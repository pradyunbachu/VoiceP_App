"""Chat-driven budget and list-sharing handlers.

  handle_budget_set  — Parses a dollar amount and category from the user's
                       message ("Set a $200 budget for groceries"), resolves
                       the target month, and creates or updates the budget row.
  handle_share_list  — Shares the user's shopping list with another user by
                       looking up the target by display_name or email, then
                       creating a shared group (or reusing an existing one)
                       with both users as members.

Helpers:
  parse_budget_amount   — Extracts $XX.XX or "XX dollars/bucks" from text.
  parse_budget_category — Maps common food/spending keywords to a category.
"""

# ============================================================================
# BUDGET & SHARING HANDLERS
# ============================================================================
import re
from datetime import datetime

from config import supabase


def parse_budget_amount(message: str) -> float | None:
    """Extract a dollar amount from a message."""
    match = re.search(r'\$\s*([\d,]+(?:\.\d{2})?)', message)
    if match:
        return float(match.group(1).replace(",", ""))
    match = re.search(r'(\d+(?:\.\d{2})?)\s*(?:dollar|bucks)', message.lower())
    if match:
        return float(match.group(1))
    return None


def parse_budget_category(message: str) -> str:
    """Extract a budget category from a message."""
    message_lower = message.lower()
    categories = [
        "groceries", "grocery", "food", "eating out", "dining",
        "restaurants", "takeout", "snacks", "drinks", "household"
    ]
    for cat in categories:
        if cat in message_lower:
            if cat == "grocery":
                return "groceries"
            return cat
    return "groceries"


async def handle_budget_query(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Handle querying budget status for the current month."""
    if supabase is None:
        return {"message": "Database not configured"}

    now = datetime.now()
    month = now.month
    year = now.year

    category = entities.get("category")

    try:
        query = (
            supabase.table("budgets")
            .select("*")
            .eq("user_id", user_id)
            .eq("month", month)
            .eq("year", year)
        )

        if category:
            query = query.ilike("category", f"%{category}%")

        response = query.execute()
        budgets = response.data if response.data else []

        if not budgets:
            return {
                "budgets": [],
                "count": 0,
                "message": "You don't have any budgets set for this month. Try 'Set a $200 budget for groceries'.",
                "query_type": "budget_query"
            }

        # For each budget, calculate actual spending
        budget_results = []
        for budget in budgets:
            budget_category = budget.get("category", "Groceries")
            budget_amount = float(budget.get("amount", 0))

            # Query actual spending for this category this month
            start_date = f"{year}-{month:02d}-01"
            end_date = now.strftime("%Y-%m-%d")

            spending_response = (
                supabase.table("expenses")
                .select("amount")
                .eq("user_id", user_id)
                .ilike("category", f"%{budget_category}%")
                .gte("date", start_date)
                .lte("date", end_date)
                .execute()
            )
            expenses = spending_response.data or []
            actual_spending = sum(float(e.get("amount", 0) or 0) for e in expenses)
            remaining = budget_amount - actual_spending
            percentage_used = (actual_spending / budget_amount * 100) if budget_amount > 0 else 0

            budget_results.append({
                "category": budget_category,
                "amount": budget_amount,
                "actual_spending": round(actual_spending, 2),
                "remaining": round(remaining, 2),
                "percentage_used": round(percentage_used, 1),
            })

        return {
            "budgets": budget_results,
            "count": len(budget_results),
            "month": month,
            "year": year,
            "query_type": "budget_query"
        }
    except Exception as e:
        print(f"Budget query error: {e}")
        return {
            "message": "Failed to check budget status. Please try again.",
            "query_type": "budget_query"
        }


async def handle_budget_set(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle setting or updating a budget."""
    if supabase is None:
        return {"message": "Database not configured"}

    amount = entities.get("budget_amount")
    if amount is not None:
        amount = float(amount)
    else:
        amount = parse_budget_amount(original_message)

    if not amount:
        return {
            "success": False,
            "message": "I couldn't determine the budget amount. Try saying something like 'Set a $200 budget for groceries'.",
            "query_type": "budget_set"
        }

    raw_category = entities.get("category") or parse_budget_category(original_message)
    category = raw_category.capitalize()

    month_str = entities.get("budget_month")
    now = datetime.now()
    budget_month = now.month
    budget_year = now.year
    if month_str:
        month_names = [
            "january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december"
        ]
        month_lower = month_str.lower()
        if month_lower in month_names:
            budget_month = month_names.index(month_lower) + 1
            budget_year = now.year if budget_month >= now.month else now.year + 1
        elif month_lower == "next month":
            if now.month == 12:
                budget_month = 1
                budget_year = now.year + 1
            else:
                budget_month = now.month + 1

    now_iso = now.isoformat()

    try:
        existing = (
            supabase.table("budgets")
            .select("*")
            .eq("user_id", user_id)
            .eq("category", category)
            .eq("month", budget_month)
            .eq("year", budget_year)
            .execute()
        )

        if existing.data:
            old_amount = existing.data[0].get("amount", 0)
            response = (
                supabase.table("budgets")
                .update({"amount": amount, "updated_at": now_iso})
                .eq("id", existing.data[0]["id"])
                .execute()
            )
            return {
                "success": True,
                "amount": amount,
                "category": category,
                "month": budget_month,
                "year": budget_year,
                "updated": True,
                "old_amount": old_amount,
                "query_type": "budget_set"
            }
        else:
            response = (
                supabase.table("budgets")
                .insert({
                    "user_id": user_id,
                    "amount": amount,
                    "category": category,
                    "month": budget_month,
                    "year": budget_year,
                    "created_at": now_iso,
                    "updated_at": now_iso
                })
                .execute()
            )
            return {
                "success": True,
                "amount": amount,
                "category": category,
                "month": budget_month,
                "year": budget_year,
                "updated": False,
                "query_type": "budget_set"
            }
    except Exception as e:
        print(f"Budget set error: {e}")
        return {
            "success": False,
            "message": "Failed to set budget. Please try again.",
            "query_type": "budget_set"
        }


async def handle_share_list(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle sharing a shopping list with another user."""
    if supabase is None:
        return {"message": "Database not configured"}

    share_target = entities.get("share_target")
    if not share_target:
        match = re.search(r'(?:with|to)\s+(\w+)', original_message, re.IGNORECASE)
        if match:
            share_target = match.group(1)

    if not share_target:
        return {
            "success": False,
            "message": "I couldn't determine who to share with. Try 'Share my shopping list with sarah@example.com'.",
            "query_type": "share_list"
        }

    # Sanitize input: strip PostgREST filter characters to prevent injection
    sanitized = re.sub(r'[,\(\):]', '', share_target).strip()
    if not sanitized:
        return {
            "success": False,
            "message": "Invalid share target. Please provide a valid email address.",
            "query_type": "share_list"
        }

    try:
        # Use exact email match to prevent user enumeration via wildcard probing
        target_query = (
            supabase.table("profiles")
            .select("id, display_name")
            .eq("email", sanitized)
            .execute()
        )

        if not target_query.data:
            return {
                "success": False,
                "message": "I couldn't find a user with that email. Make sure they have an account.",
                "query_type": "share_list"
            }

        target_user = target_query.data[0]
        target_id = target_user["id"]
        target_name = target_user.get("display_name") or "that user"

        groups_response = (
            supabase.table("group_members")
            .select("group_id")
            .eq("user_id", user_id)
            .execute()
        )
        user_group_ids = [g["group_id"] for g in (groups_response.data or [])]

        shared_group_id = None
        for gid in user_group_ids:
            member_check = (
                supabase.table("group_members")
                .select("user_id")
                .eq("group_id", gid)
                .eq("user_id", target_id)
                .execute()
            )
            if member_check.data:
                shared_group_id = gid
                break

        now_iso = datetime.now().isoformat()

        if not shared_group_id:
            group_response = (
                supabase.table("groups")
                .insert({
                    "name": f"Shared List",
                    "created_by": user_id,
                    "created_at": now_iso
                })
                .execute()
            )
            if group_response.data:
                shared_group_id = group_response.data[0]["id"]
                supabase.table("group_members").insert([
                    {"group_id": shared_group_id, "user_id": user_id, "role": "owner", "joined_at": now_iso},
                    {"group_id": shared_group_id, "user_id": target_id, "role": "member", "joined_at": now_iso}
                ]).execute()

        return {
            "success": True,
            "shared_with": target_name,
            "group_id": shared_group_id,
            "query_type": "share_list"
        }
    except Exception as e:
        print(f"Share list error: {e}")
        return {
            "success": False,
            "message": "Failed to share list. Please try again.",
            "query_type": "share_list"
        }
