# ============================================================================
# EXPENSE QUERY HANDLER
# ============================================================================
from datetime import datetime, timedelta

from config import supabase


async def handle_expense_query(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Handle expense-related queries."""
    if supabase is None:
        return {"expenses": [], "total": 0, "message": "Database not configured"}

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
