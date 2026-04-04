"""Chat-driven expense handlers.

These are invoked by the chat route when the intent is expense-related:

  handle_expense_query      — Queries expenses by time period, category, or
                              store. Also handles the spending_comparison
                              sub-intent (current vs. previous month).
  handle_expense_delete     — Deletes the most recent expense matching the
                              user's criteria (store, amount, item name).
  handle_store_trip         — When the user says "I just got back from Costco",
                              finds the most recent expense for that store and
                              auto-adds its line items to the pantry.
  handle_mark_subscription  — Marks the user's most recent expense as a
                              recurring subscription (is_recurring = True).
"""

# ============================================================================
# EXPENSE HANDLERS
# ============================================================================
import re
from datetime import datetime, timedelta

from config import supabase

import logging
logger = logging.getLogger(__name__)


async def handle_expense_query(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Handle expense-related queries."""
    if supabase is None:
        return {"expenses": [], "total": 0, "message": "Database not configured"}

    # --- Spending comparison sub-intent ---
    if sub_intent == "spending_comparison":
        return await _handle_spending_comparison(user_id, entities)

    query = supabase.table("expenses").select("*").eq("user_id", user_id)

    time_period = entities.get("time_period", "this month")
    today = datetime.now().date()

    if time_period == "today":
        start_date = today.strftime("%Y-%m-%d")
        end_date = start_date
    elif time_period == "this week":
        start_date = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
    elif time_period == "this year":
        start_date = f"{today.year}-01-01"
        end_date = today.strftime("%Y-%m-%d")
    else:  # this month (default)
        start_date = f"{today.year}-{today.month:02d}-01"
        end_date = today.strftime("%Y-%m-%d")

    query = query.gte("date", start_date).lte("date", end_date)

    category = entities.get("category")
    store = entities.get("store")

    if sub_intent == "by_category" and category:
        query = query.ilike("category", f"%{category}%")
    elif sub_intent == "by_store" and store:
        query = query.ilike("store", f"%{store}%")

    response = query.order("date", desc=True).execute()
    expenses = response.data if response.data else []

    total = sum(float(e.get("amount", 0) or 0) for e in expenses)

    return {
        "expenses": expenses,
        "count": len(expenses),
        "total": round(total, 2),
        "time_period": time_period,
        "category": category,
        "store": store,
        "query_type": sub_intent or "total_spending"
    }


async def _handle_spending_comparison(user_id: str, entities: dict) -> dict:
    """Compare current month spending to previous month."""
    today = datetime.now().date()

    current_start = f"{today.year}-{today.month:02d}-01"
    current_end = today.strftime("%Y-%m-%d")

    if today.month == 1:
        prev_month = 12
        prev_year = today.year - 1
    else:
        prev_month = today.month - 1
        prev_year = today.year

    prev_start = f"{prev_year}-{prev_month:02d}-01"
    if prev_month == 12:
        prev_end = f"{prev_year}-12-31"
    else:
        prev_end = f"{prev_year}-{prev_month + 1:02d}-01"

    try:
        current_response = (
            supabase.table("expenses")
            .select("amount")
            .eq("user_id", user_id)
            .gte("date", current_start)
            .lte("date", current_end)
            .execute()
        )
        current_expenses = current_response.data or []
        current_total = sum(float(e.get("amount", 0) or 0) for e in current_expenses)

        prev_response = (
            supabase.table("expenses")
            .select("amount")
            .eq("user_id", user_id)
            .gte("date", prev_start)
            .lt("date", prev_end)
            .execute()
        )
        prev_expenses = prev_response.data or []
        prev_total = sum(float(e.get("amount", 0) or 0) for e in prev_expenses)

        diff = current_total - prev_total
        if prev_total > 0:
            percentage = (diff / prev_total) * 100
        else:
            percentage = 100.0 if current_total > 0 else 0.0

        return {
            "current_total": round(current_total, 2),
            "previous_total": round(prev_total, 2),
            "difference": round(diff, 2),
            "percentage_change": round(percentage, 1),
            "current_count": len(current_expenses),
            "previous_count": len(prev_expenses),
            "query_type": "spending_comparison"
        }
    except Exception as e:
        logger.error("Spending comparison error: %s", e)
        return {
            "message": "Failed to compare spending. Please try again.",
            "query_type": "spending_comparison"
        }


async def handle_expense_delete(user_id: str, entities: dict, original_message: str) -> dict:
    """Delete the most recent expense matching the user's criteria."""
    if supabase is None:
        return {"message": "Database not configured"}

    try:
        # Build query to find the expense to delete
        query = (
            supabase.table("expenses")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
        )

        # Apply filters from entities if provided
        store = entities.get("store") or entities.get("delete_item_name")
        amount = entities.get("delete_amount") or entities.get("amount")
        item_name = entities.get("item_name") or entities.get("delete_item_name")

        if store:
            query = query.ilike("store", f"%{store}%")
        if amount:
            query = query.eq("amount", float(amount))

        response = query.limit(5).execute()
        expenses = response.data if response.data else []

        if not expenses:
            return {
                "success": False,
                "message": "I couldn't find a matching expense to delete.",
                "query_type": "expense_delete"
            }

        # If item_name filter provided but wasn't a store match, try matching items/description
        expense = expenses[0]
        if item_name and not store:
            for e in expenses:
                items_str = (e.get("items") or e.get("description") or "").lower()
                store_str = (e.get("store") or "").lower()
                if item_name.lower() in items_str or item_name.lower() in store_str:
                    expense = e
                    break

        expense_id = expense["id"]

        # Delete linked pantry items that came from this expense
        try:
            supabase.table("pantry_items").delete().eq(
                "source_expense_id", expense_id
            ).execute()
        except Exception:
            pass  # Not all expenses have linked pantry items

        # Delete the expense itself
        supabase.table("expenses").delete().eq("id", expense_id).eq("user_id", user_id).execute()

        return {
            "success": True,
            "deleted_expense": {
                "store": expense.get("store"),
                "amount": expense.get("amount"),
                "items": expense.get("items"),
                "date": expense.get("date"),
                "category": expense.get("category"),
            },
            "query_type": "expense_delete"
        }
    except Exception as e:
        logger.error("Expense delete error: %s", e)
        return {
            "success": False,
            "message": "Failed to delete expense. Please try again.",
            "query_type": "expense_delete"
        }


async def handle_store_trip(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle when user returns from a store — add items to pantry.

    If the user mentions specific items in their message, use those directly.
    Only fall back to looking up the most recent expense if no items are mentioned.
    """
    if supabase is None:
        return {"message": "Database not configured"}

    store = entities.get("store")
    if not store:
        store_names = [
            "costco", "walmart", "trader joe's", "trader joes", "kroger",
            "target", "aldi", "whole foods", "safeway", "publix",
            "heb", "h-e-b", "wegmans", "sprouts", "sam's club"
        ]
        message_lower = original_message.lower()
        for s in store_names:
            if s in message_lower:
                store = s.title()
                break

    if not store:
        store = "the store"

    try:
        # First, check if the user mentioned specific items in their message
        from handlers.shopping_handler import parse_purchased_items
        message_items = entities.get("purchased_items", [])
        if not message_items:
            message_items = parse_purchased_items(original_message)
            # Filter out store names from parsed items
            store_lower = store.lower()
            message_items = [
                item for item in message_items
                if item.lower().strip() not in [store_lower, "the store"]
                and store_lower not in item.lower()
            ]

        items_str = ""
        expense_amount = None

        if message_items:
            # User mentioned specific items — use those directly
            items_str = ", ".join(message_items)
        else:
            # No items mentioned — fall back to most recent expense from this store
            today = datetime.now().date()
            week_ago = (today - timedelta(days=7)).strftime("%Y-%m-%d")

            query = (
                supabase.table("expenses")
                .select("*")
                .eq("user_id", user_id)
                .gte("date", week_ago)
                .order("date", desc=True)
            )

            if store != "the store":
                query = query.ilike("store", f"%{store}%")

            response = query.limit(1).execute()
            expenses = response.data if response.data else []

            if not expenses:
                return {
                    "success": False,
                    "store": store,
                    "message": f"I couldn't find a recent expense from {store}. Log the expense first, then I can add items to your pantry.",
                    "query_type": "store_trip"
                }

            expense = expenses[0]
            expense_amount = expense.get("amount")
            items_str = expense.get("items") or expense.get("description") or ""

        if items_str:
            from handlers.pantry_handler import categorize_pantry_item, is_pantry_item

            item_names = re.split(r'[,;]|\band\b', items_str)
            item_names = [i.strip().strip(".") for i in item_names if i.strip() and len(i.strip()) > 1]

            # Deduplicate and return items as pending — frontend will show editable confirmation UI
            seen: dict[str, dict] = {}
            for item_name in item_names:
                key = item_name.lower().strip()
                if key in seen:
                    seen[key]["quantity"] += 1
                else:
                    category = categorize_pantry_item(item_name)
                    seen[key] = {
                        "name": item_name.title(),
                        "quantity": 1,
                        "unit": None,
                        "category": category,
                        "is_pantry_item": is_pantry_item(item_name),
                    }
            pending_items = list(seen.values())

            return {
                "success": True,
                "store": store,
                "expense_amount": expense_amount,
                "pending_items": pending_items,
                "needs_confirmation": True,
                "query_type": "store_trip"
            }
        else:
            return {
                "success": True,
                "store": store,
                "expense_amount": expense_amount,
                "pending_items": [],
                "needs_confirmation": True,
                "message": f"No specific items found. You can add items to your pantry by saying what you bought.",
                "query_type": "store_trip"
            }
    except Exception as e:
        logger.error("Store trip error: %s", e)
        return {
            "success": False,
            "message": "Failed to process store trip. Please try again.",
            "query_type": "store_trip"
        }


async def handle_mark_subscription(user_id: str, entities: dict) -> dict:
    """Mark the most recent expense as a recurring subscription."""
    if supabase is None:
        return {"message": "Database not configured"}

    try:
        response = (
            supabase.table("expenses")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        expenses = response.data if response.data else []

        if not expenses:
            return {
                "success": False,
                "message": "I couldn't find any recent expenses to mark as a subscription.",
                "query_type": "mark_subscription"
            }

        expense = expenses[0]

        supabase.table("expenses").update({
            "is_recurring": True,
            "updated_at": datetime.now().isoformat()
        }).eq("id", expense["id"]).execute()

        return {
            "success": True,
            "expense_name": expense.get("description") or expense.get("store") or "expense",
            "expense_amount": expense.get("amount"),
            "query_type": "mark_subscription"
        }
    except Exception as e:
        logger.error("Mark subscription error: %s", e)
        return {
            "success": False,
            "message": "Failed to mark as subscription. Please try again.",
            "query_type": "mark_subscription"
        }
