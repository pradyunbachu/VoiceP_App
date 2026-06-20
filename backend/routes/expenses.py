"""Expense CRUD routes.

Provides standard create / read / update / delete operations for expenses:
  POST   /expenses       — Create a single expense (manual entry)
  GET    /expenses       — List expenses with search, filters, sorting, and
                           cursor-based pagination. Supports CSV export mode.
  PUT    /expenses/{id}  — Update an expense (ownership-checked)
  DELETE /expenses/{id}  — Delete a single expense + linked pantry items
  DELETE /expenses/bulk  — Delete multiple expenses by ID list
  DELETE /expenses       — Delete ALL expenses for the current user

Every mutation invalidates the analytics and insights caches so dashboards
stay in sync.
"""

# ============================================================================
# EXPENSE CRUD ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from datetime import datetime
from typing import Optional
import math

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import ExpenseCreate, ExpenseUpdate, BulkDeleteRequest
from cache import api_cache
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


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

        api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
        api_cache.invalidate_prefix(f"insights:{current_user['id']}")
        api_cache.invalidate_prefix(f"streak:{current_user['id']}")

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
        logger.error("Failed to create expense: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create expense")


def _apply_expense_filters(query, search, category, store, min_amount, max_amount, start_date, end_date, recurring, sort_by, sort_order):
    """Apply filters and sorting to an expense query."""
    if search:
        query = query.or_(f"store.ilike.%{search}%,items.ilike.%{search}%,category.ilike.%{search}%")
    if category:
        query = query.ilike("category", f"%{category}%")
    if store:
        query = query.ilike("store", f"%{store}%")
    if min_amount is not None:
        query = query.gte("amount", min_amount)
    if max_amount is not None:
        query = query.lte("amount", max_amount)
    if start_date:
        query = query.gte("date", start_date)
    if end_date:
        query = query.lte("date", end_date)
    if recurring is not None:
        query = query.eq("is_recurring", 1 if recurring else 0)

    valid_sort_fields = {"date", "amount", "store", "created_at"}
    sort_field = sort_by if sort_by in valid_sort_fields else "date"
    sort_direction = "desc" if sort_order.lower() == "desc" else "asc"
    query = query.order(sort_field, desc=(sort_direction == "desc"))

    return query


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
    recurring: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    export: bool = False
):
    """Get expenses for the current user with search, filtering, sorting, and pagination"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if export:
        # Export mode: return all matching expenses (no pagination)
        query = supabase.table("expenses").select("*").eq("user_id", current_user["id"])
        query = _apply_expense_filters(query, search, category, store, min_amount, max_amount, start_date, end_date, recurring, sort_by, sort_order)
        response = query.execute()
        expenses = response.data
        return {"expenses": expenses, "count": len(expenses)}

    # Paginated query with exact count
    query = supabase.table("expenses").select("*", count="exact").eq("user_id", current_user["id"])
    query = _apply_expense_filters(query, search, category, store, min_amount, max_amount, start_date, end_date, recurring, sort_by, sort_order)

    # Apply pagination
    start = (page - 1) * page_size
    end = start + page_size - 1
    query = query.range(start, end)

    response = query.execute()
    expenses = response.data
    total_count = response.count if response.count is not None else len(expenses)
    total_pages = math.ceil(total_count / page_size) if page_size > 0 else 1

    return {
        "expenses": expenses,
        "total_count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "has_next": page < total_pages,
        "has_prev": page > 1,
    }

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

    response = supabase.table("expenses").select("id").eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Expense not found")

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

    if expense_update.recurring is not None:
        update_data["is_recurring"] = 1 if expense_update.recurring else 0

    if expense_update.repeat_interval is not None:
        update_data["recurring_interval"] = expense_update.repeat_interval

    if expense_update.repeat_unit is not None:
        update_data["recurring_unit"] = expense_update.repeat_unit

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    supabase.table("expenses").update(update_data).eq("id", expense_id).eq("user_id", current_user["id"]).execute()

    api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
    api_cache.invalidate_prefix(f"insights:{current_user['id']}")

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

    deleted_count = 0
    for expense_id in bulk_request.expense_ids:
        supabase.table("pantry_items").delete().eq("source_expense_id", expense_id).eq("user_id", current_user["id"]).execute()
        response = supabase.table("expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()
        if response.data:
            deleted_count += 1

    api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
    api_cache.invalidate_prefix(f"insights:{current_user['id']}")

    return {"message": f"{deleted_count} expense(s) deleted successfully", "deleted_count": deleted_count}

@router.delete("/expenses/{expense_id}")
@limiter.limit("30/minute")
async def delete_expense(request: Request, expense_id: int, current_user: dict = Depends(get_current_user_dependency)):
    """Delete an expense and its associated pantry items"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    supabase.table("pantry_items").delete().eq("source_expense_id", expense_id).eq("user_id", current_user["id"]).execute()

    response = supabase.table("expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
    api_cache.invalidate_prefix(f"insights:{current_user['id']}")

    return {"message": "Expense deleted successfully"}

@router.delete("/expenses")
@limiter.limit("5/minute")
async def delete_all_expenses(request: Request, current_user: dict = Depends(get_current_user_dependency)):
    """Delete all expenses and associated pantry items for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    supabase.table("pantry_items").delete().neq("source_expense_id", None).eq("user_id", current_user["id"]).execute()

    response = supabase.table("expenses").delete().eq("user_id", current_user["id"]).execute()
    deleted = len(response.data) if response.data else 0

    api_cache.invalidate_prefix(f"analytics:{current_user['id']}")
    api_cache.invalidate_prefix(f"insights:{current_user['id']}")

    return {"message": f"All expenses deleted successfully ({deleted} expenses removed)"}
