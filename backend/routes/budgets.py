# ============================================================================
# BUDGET ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta
from typing import Optional

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import BudgetCreate, BudgetUpdate

router = APIRouter()

@router.get("/budgets")
@limiter.limit("60/minute")
async def get_budgets(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """Get budgets for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    query = supabase.table("budgets").select("*").eq("user_id", current_user["id"])

    if month and year:
        query = query.eq("month", month).eq("year", year).order("category")
    elif year:
        query = query.eq("year", year).order("month").order("category")
    else:
        now = datetime.now()
        query = query.eq("month", now.month).eq("year", now.year).order("category")

    response = query.execute()
    budgets = response.data
    return {"budgets": budgets, "count": len(budgets)}

@router.post("/budgets")
@limiter.limit("20/minute")
async def create_budget(
    request: Request,
    budget: BudgetCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new budget"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        # Determine if recurring
        is_recurring = budget.recurring and budget.repeat_interval and budget.repeat_unit
        recurring_int = 1 if is_recurring else 0

        # Check if budget already exists
        response = supabase.table("budgets").select("id").eq("user_id", current_user["id"]).eq("category", budget.category).eq("month", budget.month).eq("year", budget.year).execute()
        if response.data:
            raise HTTPException(status_code=400, detail="Budget already exists for this category, month, and year")

        # Create budgets
        now = datetime.now().isoformat()
        created_budgets = []
        current_date = datetime(budget.year, budget.month, 1)

        # Calculate how many periods to create
        if is_recurring:
            if budget.repeat_unit == "weeks":
                total_periods = min(52 // budget.repeat_interval if budget.repeat_interval > 0 else 12, 60)
            elif budget.repeat_unit == "months":
                total_periods = min(12 // budget.repeat_interval if budget.repeat_interval > 0 else 12, 60)
            elif budget.repeat_unit == "years":
                total_periods = min(5 // budget.repeat_interval if budget.repeat_interval > 0 else 5, 60)
            else:
                total_periods = 12
        else:
            total_periods = 1

        for i in range(total_periods):
            if i > 0:
                if budget.repeat_unit == "weeks":
                    next_date = current_date + timedelta(weeks=budget.repeat_interval * i)
                    next_month = next_date.month
                    next_year = next_date.year
                elif budget.repeat_unit == "months":
                    next_month = budget.month + (budget.repeat_interval * i)
                    next_year = budget.year
                    while next_month > 12:
                        next_month -= 12
                        next_year += 1
                elif budget.repeat_unit == "years":
                    next_month = budget.month
                    next_year = budget.year + (budget.repeat_interval * i)
                else:
                    break
            else:
                next_month = budget.month
                next_year = budget.year

            # Check if already exists
            check_response = supabase.table("budgets").select("id").eq("user_id", current_user["id"]).eq("category", budget.category).eq("month", next_month).eq("year", next_year).execute()
            if check_response.data:
                continue

            response = supabase.table("budgets").insert({
                "user_id": current_user["id"],
                "category": budget.category,
                "amount": budget.amount,
                "month": next_month,
                "year": next_year,
                "recurring": recurring_int,
                "repeat_interval": budget.repeat_interval,
                "repeat_unit": budget.repeat_unit,
                "created_at": now,
                "updated_at": now
            }).execute()

            if response.data:
                created_budgets.append(response.data[0]["id"])

        message = f"{len(created_budgets)} budget(s) created successfully"
        if is_recurring:
            message += f" (recurring every {budget.repeat_interval} {budget.repeat_unit})"

        return {
            "id": created_budgets[0] if created_budgets else None,
            "category": budget.category,
            "amount": budget.amount,
            "month": budget.month,
            "year": budget.year,
            "recurring": is_recurring,
            "repeat_interval": budget.repeat_interval,
            "repeat_unit": budget.repeat_unit,
            "message": message
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Failed to create budget: {e}")
        raise HTTPException(status_code=500, detail="Failed to create budget")

@router.put("/budgets/{budget_id}")
@limiter.limit("30/minute")
async def update_budget(
    request: Request,
    budget_id: int,
    budget_update: BudgetUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update a budget"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Check if budget exists
    response = supabase.table("budgets").select("*").eq("id", budget_id).eq("user_id", current_user["id"]).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Budget not found")

    existing_dict = response.data[0]

    # Build update data
    update_data = {}

    if budget_update.category is not None:
        update_data["category"] = budget_update.category

    if budget_update.amount is not None:
        update_data["amount"] = budget_update.amount

    if budget_update.month is not None:
        update_data["month"] = budget_update.month

    if budget_update.year is not None:
        update_data["year"] = budget_update.year

    # Handle recurring fields
    if budget_update.repeat_interval is not None:
        update_data["repeat_interval"] = budget_update.repeat_interval

    if budget_update.repeat_unit is not None:
        update_data["repeat_unit"] = budget_update.repeat_unit

    # Set recurring flag based on whether repeat_interval and repeat_unit are provided
    if budget_update.recurring is not None:
        update_data["recurring"] = 1 if budget_update.recurring else 0
    elif budget_update.repeat_interval is not None or budget_update.repeat_unit is not None:
        # Auto-determine recurring status
        final_repeat_interval = budget_update.repeat_interval if budget_update.repeat_interval is not None else existing_dict.get("repeat_interval")
        final_repeat_unit = budget_update.repeat_unit if budget_update.repeat_unit is not None else existing_dict.get("repeat_unit")
        is_recurring = (final_repeat_interval is not None and final_repeat_interval != 0) and (final_repeat_unit is not None and final_repeat_unit != "")
        update_data["recurring"] = 1 if is_recurring else 0

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided to update")

    # Check for conflicts if changing category/month/year
    new_category = budget_update.category if budget_update.category is not None else existing_dict["category"]
    new_month = budget_update.month if budget_update.month is not None else existing_dict["month"]
    new_year = budget_update.year if budget_update.year is not None else existing_dict["year"]

    if (budget_update.category is not None or budget_update.month is not None or budget_update.year is not None):
        check_response = supabase.table("budgets").select("id").eq("user_id", current_user["id"]).eq("category", new_category).eq("month", new_month).eq("year", new_year).neq("id", budget_id).execute()
        if check_response.data:
            raise HTTPException(status_code=400, detail="Budget already exists for this category, month, and year")

    update_data["updated_at"] = datetime.now().isoformat()

    supabase.table("budgets").update(update_data).eq("id", budget_id).eq("user_id", current_user["id"]).execute()

    return {"message": "Budget updated successfully"}

@router.delete("/budgets/{budget_id}")
@limiter.limit("30/minute")
async def delete_budget(
    request: Request,
    budget_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a budget"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("budgets").delete().eq("id", budget_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Budget not found")

    return {"message": "Budget deleted successfully"}

@router.get("/budgets/check")
@limiter.limit("30/minute")
async def check_budgets(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """Get budgets with actual spending"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Get budgets
    query = supabase.table("budgets").select("*").eq("user_id", current_user["id"])

    if month and year:
        query = query.eq("month", month).eq("year", year).order("category")
    elif year:
        query = query.eq("year", year).order("month").order("category")
    else:
        query = query.order("year", desc=True).order("month", desc=True).order("category")

    response = query.execute()
    budgets = response.data if response.data else []

    # Calculate spending for each budget
    budget_status = []
    for budget in budgets:
        start_date = f"{budget['year']}-{budget['month']:02d}-01"
        if budget['month'] == 12:
            end_date = f"{budget['year']}-12-31"
        else:
            next_month = datetime(budget['year'], budget['month'] + 1, 1)
            last_day = (next_month - timedelta(days=1)).day
            end_date = f"{budget['year']}-{budget['month']:02d}-{last_day:02d}"

        # Get expenses for this period - use case-insensitive category matching
        # Also handle comma-separated categories (e.g., "Home, Utilities")
        budget_category = budget["category"].strip()

        # First try exact match (case-insensitive)
        expense_query = supabase.table("expenses").select("amount, category").eq("user_id", current_user["id"]).gte("date", start_date).lte("date", end_date).execute()

        expenses = expense_query.data if expense_query.data else []
        actual_spending = 0

        # Filter and sum expenses matching the budget category (case-insensitive)
        for exp in expenses:
            exp_category = (exp.get("category") or "").strip()
            if exp_category.lower() == budget_category.lower():
                amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
                actual_spending += amount

        # If no exact match, try pattern matching for comma-separated categories
        if actual_spending == 0:
            for exp in expenses:
                exp_category = (exp.get("category") or "").strip().lower()
                budget_cat_lower = budget_category.lower()
                # Check if budget category appears in expense category
                if (exp_category.startswith(budget_cat_lower + ",") or
                    f", {budget_cat_lower}," in exp_category or
                    exp_category.endswith(f", {budget_cat_lower}")):
                    amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
                    actual_spending += amount

        percentage_used = (actual_spending / budget["amount"] * 100) if budget["amount"] > 0 else 0
        remaining = budget["amount"] - actual_spending

        alert_level = "ok"
        if percentage_used >= 100:
            alert_level = "exceeded"
        elif percentage_used >= 90:
            alert_level = "warning"
        elif percentage_used >= 75:
            alert_level = "caution"

        budget_status.append({
            **budget,
            "actual_spending": actual_spending,
            "remaining": remaining,
            "percentage_used": round(percentage_used, 2),
            "alert_level": alert_level
        })

    return {"budgets": budget_status}
