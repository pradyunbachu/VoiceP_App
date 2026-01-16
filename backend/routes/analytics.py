# ============================================================================
# ANALYTICS ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta
from typing import Optional

from config import supabase
from auth import get_current_user_dependency

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.get("/analytics")
@limiter.limit("30/minute")
async def get_analytics(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    category: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get analytics data for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    query = supabase.table("expenses").select("*").eq("user_id", current_user["id"])

    # Apply filters
    if category:
        query = query.ilike("category", f"%{category}%")

    if start_date:
        query = query.gte("date", start_date)

    if end_date:
        query = query.lte("date", end_date)

    if month and year:
        # Filter by month and year
        start = f"{year}-{month:02d}-01"
        if month == 12:
            end = f"{year}-12-31"
        else:
            next_month = datetime(year, month + 1, 1)
            last_day = (next_month - timedelta(days=1)).day
            end = f"{year}-{month:02d}-{last_day:02d}"
        query = query.gte("date", start).lte("date", end)
    elif year:
        query = query.gte("date", f"{year}-01-01").lte("date", f"{year}-12-31")

    response = query.execute()
    expenses = response.data

    # Calculate analytics
    # Handle None/NULL amounts from database
    total_expenses = sum(float(exp.get("amount") or 0) if exp.get("amount") is not None else 0 for exp in expenses)
    expense_count = len(expenses)

    # Expenses by store
    expenses_by_store = {}
    for exp in expenses:
        store = exp["store"]
        amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
        expenses_by_store[store] = expenses_by_store.get(store, 0) + amount

    # Expenses by category (handle multiple categories per expense)
    expenses_by_category = {}
    for exp in expenses:
        categories_str = exp.get("category") or "Other"
        amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0

        # Split multiple categories (comma-separated)
        categories = [cat.strip() for cat in categories_str.split(",")] if categories_str else ["Other"]

        # Distribute amount evenly across categories, or you could use the full amount for each
        # Using full amount for each category (so if $100 is Electronics, Groceries, both get $100)
        for cat in categories:
            if cat:
                expenses_by_category[cat] = expenses_by_category.get(cat, 0) + amount

    # Expenses by date
    expenses_by_date = {}
    for exp in expenses:
        date = exp["date"]
        amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
        expenses_by_date[date] = expenses_by_date.get(date, 0) + amount

    expenses_by_date_list = [{"date": date, "amount": amount} for date, amount in sorted(expenses_by_date.items())]

    # Recent expenses (last 10)
    recent_expenses = expenses[:10]

    return {
        "total_expenses": total_expenses,
        "expense_count": expense_count,
        "expenses_by_store": expenses_by_store,
        "expenses_by_category": expenses_by_category,
        "expenses_by_date": expenses_by_date_list,
        "recent_expenses": recent_expenses
    }
