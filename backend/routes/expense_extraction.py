"""Expense extraction routes.

POST /extract-expense        — Primary endpoint. Sends the voice transcript to
     Groq (Llama 3.3 70B) with a detailed system prompt that covers multi-item
     expenses, recurring detection, date parsing, and item-name cleanup.
     On Groq failure it retries with a simpler prompt, then falls back to
     regex-based extraction (extract_expense_simple).

POST /extract-expense-simple — Regex-only extraction (no LLM call). Useful
     when the Groq API is unavailable or for very simple transcripts.

Both endpoints validate extracted data, persist to Supabase, and invalidate
the analytics/insights cache so dashboards reflect the new expense immediately.
"""

# ============================================================================
# EXPENSE EXTRACTION ROUTES - LLM-based expense extraction from transcripts
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta
import json
import re

from config import supabase, groq_client
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import TranscriptRequest
from services.text_processing import parse_relative_date
from services.expense_extraction import (
    validate_expense,
    extract_expense_simple
)
from cache import api_cache
import logging

logger = logging.getLogger(__name__)

from routes.pantry import _normalize_item_name


def _compute_confidence(expenses: list[dict]) -> float:
    """Score 0.0-1.0 based on how completely the LLM filled each field."""
    if not expenses:
        return 0.0
    scores = []
    for exp in expenses:
        s = 0.0
        store = exp.get("store", "")
        if store and store.lower() not in ("unknown store", "unknown", "store", ""):
            s += 0.30
        if exp.get("amount") and float(exp["amount"]) > 0:
            s += 0.30
        items = exp.get("items", "")
        if items and items.lower() not in ("items", "receipt items", ""):
            s += 0.15
        cat = exp.get("category", "")
        if cat and cat != "Other":
            s += 0.10
        date = exp.get("date", "")
        if date and re.match(r"\d{4}-\d{2}-\d{2}", str(date)):
            s += 0.15
        scores.append(s)
    return round(sum(scores) / len(scores), 2)


def _detect_recurring_pattern(user_id: str, expense: dict) -> dict | None:
    """Check if this expense matches a recurring pattern in the user's history."""
    if supabase is None:
        return None
    try:
        store = expense.get("store", "")
        amount = float(expense.get("amount", 0))
        if not store or amount <= 0:
            return None
        # Find past expenses at the same store with similar amounts (within 20%)
        response = (
            supabase.table("expenses")
            .select("date, amount")
            .eq("user_id", user_id)
            .ilike("store", store)
            .order("date", desc=True)
            .limit(10)
            .execute()
        )
        past = response.data if response.data else []
        if len(past) < 2:
            return None
        # Filter to similar amounts
        similar = [p for p in past if abs(float(p["amount"]) - amount) / max(amount, 0.01) < 0.20]
        if len(similar) < 2:
            return None
        # Check for regular interval
        from datetime import datetime as _dt
        dates = sorted(
            [_dt.strptime(p["date"], "%Y-%m-%d").date() for p in similar],
            reverse=True,
        )
        gaps = [(dates[i] - dates[i + 1]).days for i in range(len(dates) - 1)]
        if not gaps:
            return None
        avg_gap = sum(gaps) / len(gaps)
        # Check consistency: all gaps within 40% of average
        if any(abs(g - avg_gap) / max(avg_gap, 1) > 0.40 for g in gaps):
            return None
        # Map gap to human-readable interval
        if 5 <= avg_gap <= 9:
            return {"interval": 1, "unit": "weeks", "label": "weekly"}
        if 12 <= avg_gap <= 18:
            return {"interval": 2, "unit": "weeks", "label": "every 2 weeks"}
        if 25 <= avg_gap <= 35:
            return {"interval": 1, "unit": "months", "label": "monthly"}
        return None
    except Exception as e:
        logger.debug("Recurring pattern check failed: %s", e)
        return None


def _get_user_store_context(user_id: str) -> str:
    """Return the user's top stores per category for smart default context."""
    if supabase is None:
        return ""
    try:
        response = (
            supabase.table("expenses")
            .select("store, category")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        rows = response.data if response.data else []
        if not rows:
            return ""
        # Count store frequency per category
        from collections import Counter
        cat_stores: dict[str, Counter] = {}
        for r in rows:
            cat = r.get("category") or "Other"
            store = r.get("store") or ""
            if store:
                cat_stores.setdefault(cat, Counter())[store] += 1
        lines = []
        for cat, counter in cat_stores.items():
            top = counter.most_common(2)
            stores_str = ", ".join(f"{s} ({n}x)" for s, n in top)
            lines.append(f"  {cat}: {stores_str}")
        if not lines:
            return ""
        return "USER'S FREQUENT STORES (use as default when store is unclear):\n" + "\n".join(lines)
    except Exception:
        return ""


def _normalize_items_string(items_str: str) -> str:
    """Normalize each comma-separated item in the expense items string.

    Only strips unit-as-name patterns (no leading number):
      "Bottle of Chipotle Sauce" → "Chipotle Sauce"
      "Bottled Water"            → "Water"
    Preserves quantity+unit patterns as-is for readability:
      "2 bags of chips"          → "2 bags of chips"  (unchanged)
      "6 chocolates"             → "6 chocolates"     (unchanged)
    """
    if not items_str:
        return items_str
    parts = []
    for raw in items_str.split(","):
        raw = raw.strip()
        if not raw:
            continue
        clean_name, parsed_unit, parsed_qty = _normalize_item_name(raw)
        # Only apply normalization when there was NO leading number
        # (i.e. "bottle of X" or "Bottled X", not "2 bags of chips")
        if clean_name != raw.strip() and parsed_qty in (1, None):
            # Title-case the cleaned name for consistent display
            parts.append(clean_name.title())
        else:
            parts.append(raw.strip())
    return ", ".join(parts)


router = APIRouter()


@router.post("/extract-expense-simple")
@limiter.limit("20/minute")
async def extract_expense_simple_endpoint(
    request: Request,
    transcript_request: TranscriptRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Extract expense information using simple regex (no API needed)"""
    transcript = transcript_request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")

    try:
        expense_data = extract_expense_simple(transcript)
        expense_data["items"] = _normalize_items_string(expense_data.get("items", ""))

        if supabase is None:
            raise HTTPException(status_code=500, detail="Database not configured")

        response = supabase.table("expenses").insert({
            "user_id": current_user["id"],
            "store": expense_data["store"],
            "items": expense_data["items"],
            "category": expense_data.get("category"),
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "created_at": datetime.now().isoformat()
        }).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save expense")

        expense_id = response.data[0]["id"]

        api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
        api_cache.invalidate_prefix(f"insights:{current_user['id']}")
        api_cache.invalidate_prefix(f"streak:{current_user['id']}")

        return {
            "id": expense_id,
            "store": expense_data["store"],
            "items": expense_data["items"],
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "message": "Expense saved successfully (using simple extraction)"
        }
    except Exception as e:
        logger.error("Simple extraction error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to extract expense from transcript")

@router.post("/extract-expense")
@limiter.limit("20/minute")
async def extract_expense(
    request: Request,
    transcript_request: TranscriptRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Extract expense information from transcript using Groq (primary) or simple extraction (fallback)"""
    transcript = transcript_request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")

    user_id = current_user["id"]

    # Try Groq first (faster, free tier available)
    if groq_client:
        today_str = datetime.now().strftime("%Y-%m-%d")
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        # Smart defaults: inject user's store history so the LLM can fill in
        # the store when the transcript doesn't mention one explicitly.
        store_context = _get_user_store_context(user_id)

        system_prompt = f"""You extract expense data from voice transcripts into JSON.

{store_context}

OUTPUT FORMAT: Always return a JSON array, even for single expenses.

EXPENSE OBJECT STRUCTURE:
{{
  "store": "Store name (capitalize properly)",
  "items": "Product names WITH quantities if mentioned (e.g. '6 chocolates, 2 bags of chips')",
  "category": "One category from: Electronics, Groceries, Clothing, Transportation, Dining, Entertainment, Health, Home, Utilities, Other",
  "amount": <number>,
  "date": "YYYY-MM-DD",
  "is_recurring": true/false,
  "recurring_interval": <number or null>,
  "recurring_unit": "days" | "weeks" | "months" | "years" | null
}}

CRITICAL RULES:
1. ITEMS FIELD - EXTRACT PRODUCT NAMES WITH QUANTITIES:
   - PRESERVE QUANTITIES when mentioned: "6 chocolates" → "6 chocolates", "2 bags of chips" → "2 bags of chips"
   - Extract ACTUAL PRODUCT NAMES, NOT the category name, NOT prices, NOT "worth of"
   - "I bought 6 chocolates for $14" → items = "6 chocolates" (KEEP the quantity!)
   - "I got 2 gallons of milk" → items = "2 gallons of milk" (KEEP quantity and unit!)
   - "I got groceries at Target, spent $12 on bananas" → items = "bananas" (NOT "groceries", NOT "$12 worth of bananas")
   - "$13 worth of banana" → items = "banana" (remove "$13 worth of")
   - "$6 worth of ice cream" → items = "ice cream" (remove "$6 worth of")
   - "$13 worth of banana, $6 worth of ice cream, $4 worth of pineapple juice" → items = "banana, ice cream, pineapple juice" (remove ALL prices and "worth of")
   - Remove ALL articles: "an iPad" → "iPad", "a laptop" → "laptop", "the milk" → "milk"
   - Remove action words: "bought", "got", "purchased", "I", "spent", "worth of"
   - Remove price information: "$13", "$6", "$4" should NEVER appear in items field
   - Apple products: "iPad", "iPhone", "MacBook" (exact capitalization)
   - NEVER include: store name, category name, prices, dollar amounts, "worth of" in items field
   - ALWAYS INCLUDE: quantities (numbers) when the user specifies how many they bought

2. MULTIPLE ITEMS WITH INDIVIDUAL PRICES - CRITICAL:
   - When you see MULTIPLE dollar amounts with different items at the SAME store, COMBINE them into ONE expense
   - The "amount" should be the SUM of all individual prices
   - The "items" should list all items separated by commas
   - Look for patterns like: "$X worth of item1, $Y worth of item2, and $Z worth of item3"
   - Example: "$17 worth of ice cream, $4 worth of strawberries, and $32 worth of chocolate at Target"
     → ONE expense: {{"items": "ice cream, strawberries, chocolate", "amount": 53}} (17+4+32=53)
   - Example: "$17 worth of chocolate, $14 worth of bananas, and $7 worth of bread from Target"
     → ONE expense: {{"items": "chocolate, bananas, bread", "amount": 38}} (17+14+7=38)
   - Example: "spent $12 on bananas, $13 on cereal, $14 on strawberries at Walmart"
     → ONE expense: {{"items": "bananas, cereal, strawberries", "amount": 39}} (12+13+14=39)

3. AMOUNTS:
   - If multiple items with individual prices are combined: SUM the amounts
   - Numbers like 700, 800, 900 = whole dollars (700, 800, 900)
   - 4-5 digit numbers like 2350 = 23.50, 1234 = 12.34
   - Always return as number (no $ symbol)

4. DATES:
   - "today" = {today_str}
   - "yesterday" = {yesterday_str}
   - "tomorrow" = {tomorrow_str}
   - If not mentioned, use {today_str}

5. RECURRING EXPENSES - IMPORTANT:
   - Detect if user mentions the expense is recurring/repeating
   - Keywords: "monthly", "weekly", "every week", "every month", "every 2 weeks", "biweekly", "annually", "yearly", "recurring", "subscription"
   - Set is_recurring: true when recurring is mentioned
   - Set recurring_interval: the number (default 1 if not specified)
   - Set recurring_unit: "days", "weeks", "months", or "years"
   - Examples:
     - "monthly" or "every month" → is_recurring: true, recurring_interval: 1, recurring_unit: "months"
     - "weekly" or "every week" → is_recurring: true, recurring_interval: 1, recurring_unit: "weeks"
     - "every 2 weeks" or "biweekly" → is_recurring: true, recurring_interval: 2, recurring_unit: "weeks"
     - "every 3 months" or "quarterly" → is_recurring: true, recurring_interval: 3, recurring_unit: "months"
     - "yearly" or "annually" → is_recurring: true, recurring_interval: 1, recurring_unit: "years"
   - If NOT recurring, set: is_recurring: false, recurring_interval: null, recurring_unit: null

EXAMPLES:
Input: "I bought an iPad from Target for $700"
Output: [{{"store": "Target", "items": "iPad", "category": "Electronics", "amount": 700, "date": "{today_str}"}}]

Input: "got eggs and milk at Walmart for $10"
Output: [{{"store": "Walmart", "items": "eggs and milk", "category": "Groceries", "amount": 10, "date": "{today_str}"}}]

Input: "I got $17 worth of ice cream, $4 worth of strawberries, and $32 worth of chocolate at Target today"
Output: [{{"store": "Target", "items": "ice cream, strawberries, chocolate", "category": "Groceries", "amount": 53, "date": "{today_str}"}}]

Input: "I got groceries at Target, spent $12 on bananas, $13 on cereal, and $14 on strawberries"
Output: [{{"store": "Target", "items": "bananas, cereal, strawberries", "category": "Groceries", "amount": 39, "date": "{today_str}"}}]

Input: "I got $13 worth of banana, $6 worth of ice cream, and $4 worth of pineapple juice at Target"
Output: [{{"store": "Target", "items": "banana, ice cream, pineapple juice", "category": "Groceries", "amount": 23, "date": "{today_str}"}}]

Input: "bought candy for $5 and an iPad for $700 at Target"
Output: [{{"store": "Target", "items": "candy, iPad", "category": "Other", "amount": 705, "date": "{today_str}"}}]

Input: "purchased a MacBook from Apple Store yesterday for $2000"
Output: [{{"store": "Apple Store", "items": "MacBook", "category": "Electronics", "amount": 2000, "date": "{yesterday_str}", "is_recurring": false, "recurring_interval": null, "recurring_unit": null}}]

Input: "I pay $15 monthly for Netflix"
Output: [{{"store": "Netflix", "items": "subscription", "category": "Entertainment", "amount": 15, "date": "{today_str}", "is_recurring": true, "recurring_interval": 1, "recurring_unit": "months"}}]

Input: "my rent is $1500 every month"
Output: [{{"store": "Landlord", "items": "rent", "category": "Home", "amount": 1500, "date": "{today_str}", "is_recurring": true, "recurring_interval": 1, "recurring_unit": "months"}}]

Input: "I pay $50 every 2 weeks for gym membership"
Output: [{{"store": "Gym", "items": "membership", "category": "Health", "amount": 50, "date": "{today_str}", "is_recurring": true, "recurring_interval": 2, "recurring_unit": "weeks"}}]

Input: "spotify subscription is $10 monthly"
Output: [{{"store": "Spotify", "items": "subscription", "category": "Entertainment", "amount": 10, "date": "{today_str}", "is_recurring": true, "recurring_interval": 1, "recurring_unit": "months"}}]

Today is {today_str}."""

        user_prompt = f"""Extract expenses from: "{transcript}"

Return JSON array only, no other text."""

        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1
            )

            content = response.choices[0].message.content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

            expenses_data = json.loads(content)

            if not isinstance(expenses_data, list):
                expenses_data = [expenses_data]

            validated_expenses = []
            for expense_data in expenses_data:
                try:
                    validated = validate_expense(expense_data, today_str)
                    validated_expenses.append(validated)
                except ValueError as e:
                    logger.warning("Validation error for expense: %s, skipping", e)
                    continue

            if not validated_expenses:
                raise ValueError("No valid expenses extracted")

            saved_expenses = []
            if supabase is None:
                raise HTTPException(status_code=500, detail="Database not configured")

            for expense in validated_expenses:
                # Normalize item names (strip unit prefixes like "Bottle of ...")
                expense["items"] = _normalize_items_string(expense.get("items", ""))

                date_str = expense.get("date", "")
                if date_str and (date_str.lower() in ["yesterday", "tomorrow", "today"] or "ago" in date_str.lower() or "last week" in date_str.lower()):
                    date = parse_relative_date(transcript)
                elif date_str:
                    date = date_str
                else:
                    date = parse_relative_date(transcript)

                is_recurring = expense.get("is_recurring", False)
                recurring_interval = expense.get("recurring_interval")
                recurring_unit = expense.get("recurring_unit")

                response = supabase.table("expenses").insert({
                    "user_id": current_user["id"],
                    "store": expense["store"],
                    "items": expense["items"],
                    "category": expense["category"],
                    "amount": expense["amount"],
                    "date": date,
                    "created_at": datetime.now().isoformat(),
                    "is_recurring": 1 if is_recurring else 0,
                    "recurring_interval": recurring_interval,
                    "recurring_unit": recurring_unit
                }).execute()

                if not response.data:
                    continue

                expense_id = response.data[0]["id"]

                saved_expenses.append({
                    "id": expense_id,
                    "store": expense["store"],
                    "items": expense["items"],
                    "category": expense["category"],
                    "amount": expense["amount"],
                    "date": date,
                    "is_recurring": is_recurring,
                    "recurring_interval": recurring_interval,
                    "recurring_unit": recurring_unit
                })

            logger.info("Groq extraction successful: %d expense(s) saved", len(saved_expenses))
            api_cache.invalidate_prefix(f"analytics:{user_id}")
            api_cache.invalidate_prefix(f"insights:{user_id}")
            api_cache.invalidate_prefix(f"streak:{user_id}")

            confidence = _compute_confidence(saved_expenses)

            # Check for recurring pattern on the first saved expense
            recurring_suggestion = None
            if saved_expenses and not saved_expenses[0].get("is_recurring"):
                recurring_suggestion = _detect_recurring_pattern(user_id, saved_expenses[0])

            return {
                "expenses": saved_expenses,
                "count": len(saved_expenses),
                "confidence": confidence,
                "recurring_suggestion": recurring_suggestion,
                "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq)"
            }

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning("First Groq extraction attempt failed: %s, trying simpler prompt", e)
            try:
                simple_prompt = f"""Extract expense from: "{transcript}"

Return JSON array: [{{"store": "...", "items": "...", "category": "...", "amount": <number>, "date": "YYYY-MM-DD"}}]

If multiple items with different prices, return array of objects.
Today is {today_str}. Remove articles (a, an, the) from items."""

                response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": simple_prompt}],
                    temperature=0.1
                )

                content = response.choices[0].message.content.strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()

                expenses_data = json.loads(content)
                if not isinstance(expenses_data, list):
                    expenses_data = [expenses_data]

                validated_expenses = []
                for expense_data in expenses_data:
                    try:
                        validated = validate_expense(expense_data, today_str)
                        validated_expenses.append(validated)
                    except ValueError:
                        continue

                if validated_expenses:
                    saved_expenses = []
                    if supabase is None:
                        raise HTTPException(status_code=500, detail="Database not configured")

                    for expense in validated_expenses:
                        expense["items"] = _normalize_items_string(expense.get("items", ""))
                        date = expense.get("date", today_str)
                        if not re.match(r'\d{4}-\d{2}-\d{2}', str(date)):
                            date = parse_relative_date(transcript)

                        is_recurring = expense.get("is_recurring", False)
                        recurring_interval = expense.get("recurring_interval")
                        recurring_unit = expense.get("recurring_unit")

                        response = supabase.table("expenses").insert({
                            "user_id": current_user["id"],
                            "store": expense["store"],
                            "items": expense["items"],
                            "category": expense["category"],
                            "amount": expense["amount"],
                            "date": date,
                            "created_at": datetime.now().isoformat(),
                            "is_recurring": 1 if is_recurring else 0,
                            "recurring_interval": recurring_interval,
                            "recurring_unit": recurring_unit
                        }).execute()

                        if not response.data:
                            continue

                        expense_id = response.data[0]["id"]

                        saved_expenses.append({
                            "id": expense_id,
                            "store": expense["store"],
                            "items": expense["items"],
                            "category": expense["category"],
                            "amount": expense["amount"],
                            "date": date,
                            "is_recurring": is_recurring,
                            "recurring_interval": recurring_interval,
                            "recurring_unit": recurring_unit
                        })

                    api_cache.invalidate_prefix(f"analytics:{user_id}")
                    api_cache.invalidate_prefix(f"insights:{user_id}")
                    api_cache.invalidate_prefix(f"streak:{user_id}")

                    confidence = _compute_confidence(saved_expenses)
                    recurring_suggestion = None
                    if saved_expenses and not saved_expenses[0].get("is_recurring"):
                        recurring_suggestion = _detect_recurring_pattern(user_id, saved_expenses[0])

                    return {
                        "expenses": saved_expenses,
                        "count": len(saved_expenses),
                        "confidence": confidence,
                        "recurring_suggestion": recurring_suggestion,
                        "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq - retry)"
                    }
            except Exception as retry_error:
                logger.error("Retry also failed: %s", retry_error)
        except Exception as e:
            logger.exception("Groq error")

    # Fallback to simple extraction if Groq fails or unavailable
    logger.info("Using simple extraction (Groq unavailable or failed)")
    expenses_data = extract_expense_simple(transcript)
    logger.debug("Simple extraction result: %s", expenses_data)

    if not isinstance(expenses_data, list):
        expenses_data = [expenses_data]

    saved_expenses = []
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    for expense_data in expenses_data:
        expense_data["items"] = _normalize_items_string(expense_data.get("items", ""))
        is_recurring = expense_data.get("is_recurring", False)
        recurring_interval = expense_data.get("recurring_interval")
        recurring_unit = expense_data.get("recurring_unit")

        response = supabase.table("expenses").insert({
            "user_id": current_user["id"],
            "store": expense_data["store"],
            "items": expense_data["items"],
            "category": expense_data.get("category"),
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "created_at": datetime.now().isoformat(),
            "is_recurring": 1 if is_recurring else 0,
            "recurring_interval": recurring_interval,
            "recurring_unit": recurring_unit
        }).execute()

        if not response.data:
            continue

        expense_id = response.data[0]["id"]

        saved_expenses.append({
            "id": expense_id,
            "store": expense_data["store"],
            "items": expense_data["items"],
            "category": expense_data.get("category"),
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "is_recurring": is_recurring,
            "recurring_interval": recurring_interval,
            "recurring_unit": recurring_unit
        })

    api_cache.invalidate_prefix(f"analytics:{user_id}")
    api_cache.invalidate_prefix(f"insights:{user_id}")
    api_cache.invalidate_prefix(f"streak:{user_id}")

    confidence = _compute_confidence(saved_expenses)
    recurring_suggestion = None
    if saved_expenses and not saved_expenses[0].get("is_recurring"):
        recurring_suggestion = _detect_recurring_pattern(user_id, saved_expenses[0])

    return {
        "expenses": saved_expenses,
        "count": len(saved_expenses),
        "confidence": confidence,
        "recurring_suggestion": recurring_suggestion,
        "message": f"{len(saved_expenses)} expense(s) saved successfully (using simple extraction - Groq unavailable)"
    }
