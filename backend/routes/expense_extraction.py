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

        return {
            "id": expense_id,
            "store": expense_data["store"],
            "items": expense_data["items"],
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "message": "Expense saved successfully (using simple extraction)"
        }
    except Exception as e:
        print(f"Simple extraction error: {e}")
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

    # Try Groq first (faster, free tier available)
    if groq_client:
        today_str = datetime.now().strftime("%Y-%m-%d")
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

        system_prompt = f"""You extract expense data from voice transcripts into JSON.

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
                    print(f"Validation error for expense: {e}, skipping...")
                    continue

            if not validated_expenses:
                raise ValueError("No valid expenses extracted")

            saved_expenses = []
            if supabase is None:
                raise HTTPException(status_code=500, detail="Database not configured")

            for expense in validated_expenses:
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

            print(f"Groq extraction successful: {len(saved_expenses)} expense(s) saved")
            api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
            api_cache.invalidate_prefix(f"insights:{current_user['id']}")
            return {
                "expenses": saved_expenses,
                "count": len(saved_expenses),
                "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq)"
            }

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            print(f"First Groq extraction attempt failed: {e}, trying simpler prompt...")
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

                    api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
                    api_cache.invalidate_prefix(f"insights:{current_user['id']}")
                    return {
                        "expenses": saved_expenses,
                        "count": len(saved_expenses),
                        "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq - retry)"
                    }
            except Exception as retry_error:
                print(f"Retry also failed: {retry_error}")
        except Exception as e:
            print(f"Groq error: {str(e)}")
            import traceback
            traceback.print_exc()

    # Fallback to simple extraction if Groq fails or unavailable
    print("Using simple extraction (Groq unavailable or failed)")
    expenses_data = extract_expense_simple(transcript)
    print(f"Simple extraction result: {expenses_data}")

    if not isinstance(expenses_data, list):
        expenses_data = [expenses_data]

    saved_expenses = []
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    for expense_data in expenses_data:
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

    api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
    api_cache.invalidate_prefix(f"insights:{current_user['id']}")

    return {
        "expenses": saved_expenses,
        "count": len(saved_expenses),
        "message": f"{len(saved_expenses)} expense(s) saved successfully (using simple extraction - Groq unavailable)"
    }
