# ============================================================================
# EXPENSE ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta
from typing import Optional
import json
import re

from config import supabase, groq_client
from auth import get_current_user_dependency
from schemas import TranscriptRequest, ExpenseCreate, ExpenseUpdate, BulkDeleteRequest
from services.text_processing import parse_relative_date
from services.expense_extraction import (
    validate_expense,
    extract_expense_simple
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# ----------------------------------------------------------------------------
# Expense Extraction Endpoints
# ----------------------------------------------------------------------------

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

        # Save to database with user_id
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

        return {
            "id": expense_id,
            "store": expense_data["store"],
            "items": expense_data["items"],
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "message": "Expense saved successfully (using simple extraction)"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simple extraction error: {str(e)}")

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

        # Simplified, structured system prompt
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
            # First attempt with structured prompt
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1
            )

            # Parse the response
            content = response.choices[0].message.content.strip()
            # Remove markdown code blocks if present
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

            expenses_data = json.loads(content)

            # Ensure we have an array
            if not isinstance(expenses_data, list):
                expenses_data = [expenses_data]

            # Post-process and validate expenses
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

            # Save to database
            saved_expenses = []
            if supabase is None:
                raise HTTPException(status_code=500, detail="Database not configured")

            for expense in validated_expenses:
                # Handle date parsing
                date_str = expense.get("date", "")
                if date_str and (date_str.lower() in ["yesterday", "tomorrow", "today"] or "ago" in date_str.lower() or "last week" in date_str.lower()):
                    date = parse_relative_date(transcript)
                elif date_str:
                    date = date_str
                else:
                    date = parse_relative_date(transcript)

                # Extract recurring info
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
            return {
                "expenses": saved_expenses,
                "count": len(saved_expenses),
                "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq)"
            }

        except (json.JSONDecodeError, ValueError, KeyError) as e:
            print(f"First Groq extraction attempt failed: {e}, trying simpler prompt...")
            # Retry with simpler prompt
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

                # Validate and save
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

                        # Extract recurring info
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

                    return {
                        "expenses": saved_expenses,
                        "count": len(saved_expenses),
                        "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq - retry)"
                    }
            except Exception as retry_error:
                print(f"Retry also failed: {retry_error}")
                # Fall through to simple extraction
        except Exception as e:
            print(f"Groq error: {str(e)}")
            import traceback
            traceback.print_exc()
            # Fall through to simple extraction

    # Fallback to simple extraction if Groq fails or unavailable
    print("Using simple extraction (Groq unavailable or failed)")
    expenses_data = extract_expense_simple(transcript)
    print(f"Simple extraction result: {expenses_data}")

    # Ensure we have a list
    if not isinstance(expenses_data, list):
        expenses_data = [expenses_data]

    # Save to database with user_id
    saved_expenses = []
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    for expense_data in expenses_data:
        # Extract recurring info
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

    return {
        "expenses": saved_expenses,
        "count": len(saved_expenses),
        "message": f"{len(saved_expenses)} expense(s) saved successfully (using simple extraction - Groq unavailable)"
    }

# ----------------------------------------------------------------------------
# Expense Management Endpoints
# ----------------------------------------------------------------------------

@router.post("/expenses")
@limiter.limit("30/minute")
async def create_expense(
    request: Request,
    expense: ExpenseCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new expense"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        response = supabase.table("expenses").insert({
            "user_id": current_user["id"],
            "store": expense.store,
            "items": expense.items or "Various items",
            "category": expense.category,
            "amount": expense.amount,
            "date": expense.date,
            "created_at": datetime.now().isoformat()
        }).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create expense")

        expense_id = response.data[0]["id"]

        return {
            "id": expense_id,
            "store": expense.store,
            "items": expense.items or "Various items",
            "category": expense.category,
            "amount": expense.amount,
            "date": expense.date,
            "message": "Expense created successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create expense: {str(e)}")

@router.get("/expenses")
@limiter.limit("60/minute")
async def get_expenses(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    search: Optional[str] = None,
    category: Optional[str] = None,
    store: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: Optional[str] = "date",
    sort_order: Optional[str] = "desc",
    recurring: Optional[bool] = None
):
    """Get expenses for the current user with search, filtering, and sorting"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Start building query
    query = supabase.table("expenses").select("*").eq("user_id", current_user["id"])

    # Search filter (searches in store, items, and category)
    if search:
        query = query.ilike("store", f"%{search}%")

    # Category filter
    if category:
        query = query.ilike("category", f"%{category}%")

    # Store filter
    if store:
        query = query.ilike("store", f"%{store}%")

    # Amount filters
    if min_amount is not None:
        query = query.gte("amount", min_amount)

    if max_amount is not None:
        query = query.lte("amount", max_amount)

    # Date filters
    if start_date:
        query = query.gte("date", start_date)

    if end_date:
        query = query.lte("date", end_date)

    # Recurring filter
    if recurring is not None:
        query = query.eq("is_recurring", 1 if recurring else 0)

    # Sorting
    valid_sort_fields = {"date", "amount", "store", "created_at"}
    sort_field = sort_by if sort_by in valid_sort_fields else "date"
    sort_direction = "desc" if sort_order.lower() == "desc" else "asc"
    query = query.order(sort_field, desc=(sort_direction == "desc"))

    response = query.execute()
    expenses = response.data

    # Apply search filter to items and category if search was provided
    if search:
        search_lower = search.lower()
        expenses = [
            exp for exp in expenses
            if search_lower in exp.get("store", "").lower() or
               search_lower in exp.get("items", "").lower() or
               search_lower in exp.get("category", "").lower()
        ]

    return {"expenses": expenses, "count": len(expenses)}

@router.put("/expenses/{expense_id}")
@limiter.limit("30/minute")
async def update_expense(
    request: Request,
    expense_id: int,
    expense_update: ExpenseUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update an expense (only if it belongs to the current user)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Check if expense exists and belongs to user
    response = supabase.table("expenses").select("id").eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Build update dictionary
    update_data = {}

    if expense_update.store is not None:
        update_data["store"] = expense_update.store

    if expense_update.items is not None:
        update_data["items"] = expense_update.items

    if expense_update.category is not None:
        update_data["category"] = expense_update.category

    if expense_update.amount is not None:
        update_data["amount"] = expense_update.amount

    if expense_update.date is not None:
        update_data["date"] = expense_update.date

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    supabase.table("expenses").update(update_data).eq("id", expense_id).eq("user_id", current_user["id"]).execute()

    return {"message": "Expense updated successfully"}

@router.delete("/expenses/bulk")
@limiter.limit("10/minute")
async def delete_expenses_bulk(
    request: Request,
    bulk_request: BulkDeleteRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete multiple expenses by their IDs (also removes associated pantry items)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if not bulk_request.expense_ids:
        raise HTTPException(status_code=400, detail="No expense IDs provided")

    # Delete expenses that belong to the user
    deleted_count = 0
    for expense_id in bulk_request.expense_ids:
        # First delete associated pantry items
        supabase.table("pantry_items").delete().eq("source_expense_id", expense_id).eq("user_id", current_user["id"]).execute()
        # Then delete the expense
        response = supabase.table("expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()
        if response.data:
            deleted_count += 1

    return {"message": f"{deleted_count} expense(s) deleted successfully", "deleted_count": deleted_count}

@router.delete("/expenses/{expense_id}")
@limiter.limit("30/minute")
async def delete_expense(request: Request, expense_id: int, current_user: dict = Depends(get_current_user_dependency)):
    """Delete an expense and its associated pantry items"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # First delete associated pantry items
    supabase.table("pantry_items").delete().eq("source_expense_id", expense_id).eq("user_id", current_user["id"]).execute()

    # Then delete the expense
    response = supabase.table("expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    return {"message": "Expense deleted successfully"}

@router.delete("/expenses")
@limiter.limit("5/minute")
async def delete_all_expenses(request: Request, current_user: dict = Depends(get_current_user_dependency)):
    """Delete all expenses and associated pantry items for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # First delete all pantry items that came from expenses
    supabase.table("pantry_items").delete().neq("source_expense_id", None).eq("user_id", current_user["id"]).execute()

    # Then delete all expenses
    response = supabase.table("expenses").delete().eq("user_id", current_user["id"]).execute()
    deleted = len(response.data) if response.data else 0

    return {"message": f"All expenses deleted successfully ({deleted} expenses removed)"}
