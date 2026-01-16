# ============================================================================
# PANTRY ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta
from typing import Optional

from config import supabase
from auth import get_current_user_dependency
from schemas import (
    PantryItemCreate,
    PantryItemUpdate,
    BulkPantryDeleteRequest,
    AutoPopulatePantryRequest
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.get("/pantry")
@limiter.limit("60/minute")
async def get_pantry_items(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    category: Optional[str] = None,
    stock_status: Optional[str] = None,
    search: Optional[str] = None,
    expiring_within_days: Optional[int] = None,
    sort_by: Optional[str] = "name",
    sort_order: Optional[str] = "asc"
):
    """Get pantry items for the current user with filtering and sorting"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    query = supabase.table("pantry_items").select("*").eq("user_id", current_user["id"])

    if category:
        query = query.eq("category", category)

    if stock_status:
        query = query.eq("stock_status", stock_status)

    valid_sort_fields = {"name", "category", "expiration_date", "purchase_date", "stock_status", "created_at"}
    sort_field = sort_by if sort_by in valid_sort_fields else "name"
    query = query.order(sort_field, desc=(sort_order.lower() == "desc"))

    response = query.execute()
    items = response.data if response.data else []

    # Apply search filter in Python (Supabase ilike can be inconsistent)
    if search:
        search_lower = search.lower()
        items = [item for item in items if
                 search_lower in item.get("name", "").lower() or
                 search_lower in (item.get("category") or "").lower() or
                 search_lower in (item.get("notes") or "").lower()]

    # Apply expiring_within_days filter
    if expiring_within_days is not None:
        future_date = (datetime.now() + timedelta(days=expiring_within_days)).date()
        items = [item for item in items if
                 item.get("expiration_date") and
                 datetime.strptime(item["expiration_date"], "%Y-%m-%d").date() <= future_date]

    return {"items": items, "count": len(items)}

@router.post("/pantry")
@limiter.limit("30/minute")
async def create_pantry_item(
    request: Request,
    item: PantryItemCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new pantry item manually"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    now = datetime.now().isoformat()

    response = supabase.table("pantry_items").insert({
        "user_id": current_user["id"],
        "name": item.name,
        "quantity": item.quantity or 1,
        "unit": item.unit,
        "category": item.category or "Other",
        "expiration_date": item.expiration_date,
        "purchase_date": item.purchase_date or datetime.now().strftime("%Y-%m-%d"),
        "stock_status": item.stock_status or "full",
        "notes": item.notes,
        "created_at": now,
        "updated_at": now
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create pantry item")

    return {
        "message": "Pantry item created successfully",
        **response.data[0]
    }

@router.post("/pantry/from-expense")
@limiter.limit("20/minute")
async def auto_populate_pantry_from_expense(
    request: Request,
    populate_request: AutoPopulatePantryRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Auto-populate pantry from a grocery expense"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Verify expense belongs to user
    expense_response = supabase.table("expenses").select("*").eq("id", populate_request.expense_id).eq("user_id", current_user["id"]).execute()
    if not expense_response.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    expense = expense_response.data[0]
    now = datetime.now().isoformat()
    created_items = []

    for item_data in populate_request.items:
        response = supabase.table("pantry_items").insert({
            "user_id": current_user["id"],
            "name": item_data.get("name", "Unknown Item"),
            "quantity": item_data.get("quantity", 1),
            "unit": item_data.get("unit"),
            "category": item_data.get("category", "Other"),
            "expiration_date": item_data.get("expiration_date"),
            "purchase_date": expense.get("date"),
            "stock_status": "full",
            "notes": f"Auto-added from {expense.get('store', 'Unknown Store')}",
            "source_expense_id": populate_request.expense_id,
            "created_at": now,
            "updated_at": now
        }).execute()

        if response.data:
            created_items.append(response.data[0])

    return {
        "message": f"{len(created_items)} item(s) added to pantry",
        "items": created_items
    }

@router.put("/pantry/{item_id}")
@limiter.limit("30/minute")
async def update_pantry_item(
    request: Request,
    item_id: int,
    item_update: PantryItemUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update a pantry item"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Verify item belongs to user
    check_response = supabase.table("pantry_items").select("id").eq("id", item_id).eq("user_id", current_user["id"]).execute()
    if not check_response.data:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    update_data = {}
    if item_update.name is not None:
        update_data["name"] = item_update.name
    if item_update.quantity is not None:
        update_data["quantity"] = item_update.quantity
    if item_update.unit is not None:
        update_data["unit"] = item_update.unit
    if item_update.category is not None:
        update_data["category"] = item_update.category
    if item_update.expiration_date is not None:
        update_data["expiration_date"] = item_update.expiration_date if item_update.expiration_date else None
    if item_update.purchase_date is not None:
        update_data["purchase_date"] = item_update.purchase_date if item_update.purchase_date else None
    if item_update.stock_status is not None:
        update_data["stock_status"] = item_update.stock_status
    if item_update.notes is not None:
        update_data["notes"] = item_update.notes

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.now().isoformat()

    supabase.table("pantry_items").update(update_data).eq("id", item_id).eq("user_id", current_user["id"]).execute()

    return {"message": "Pantry item updated successfully"}

@router.put("/pantry/{item_id}/status")
@limiter.limit("60/minute")
async def update_pantry_item_status(
    request: Request,
    item_id: int,
    stock_status: str,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Quick update for stock status only"""
    if stock_status not in ["full", "low", "out_of_stock"]:
        raise HTTPException(status_code=400, detail="Invalid stock status. Must be: full, low, or out_of_stock")

    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    check_response = supabase.table("pantry_items").select("id").eq("id", item_id).eq("user_id", current_user["id"]).execute()
    if not check_response.data:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    supabase.table("pantry_items").update({
        "stock_status": stock_status,
        "updated_at": datetime.now().isoformat()
    }).eq("id", item_id).eq("user_id", current_user["id"]).execute()

    return {"message": f"Status updated to {stock_status}"}

@router.delete("/pantry/{item_id}")
@limiter.limit("30/minute")
async def delete_pantry_item(
    request: Request,
    item_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a single pantry item"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("pantry_items").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    return {"message": "Pantry item deleted successfully"}

@router.delete("/pantry/bulk")
@limiter.limit("10/minute")
async def delete_pantry_items_bulk(
    request: Request,
    bulk_request: BulkPantryDeleteRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete multiple pantry items"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    deleted_count = 0
    for item_id in bulk_request.item_ids:
        response = supabase.table("pantry_items").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()
        if response.data:
            deleted_count += 1

    return {"message": f"{deleted_count} item(s) deleted successfully", "deleted_count": deleted_count}

@router.get("/pantry/stats")
@limiter.limit("30/minute")
async def get_pantry_stats(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Get pantry statistics"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("pantry_items").select("*").eq("user_id", current_user["id"]).execute()
    items = response.data if response.data else []

    total_items = len(items)
    full_stock = sum(1 for item in items if item.get("stock_status") == "full")
    low_stock = sum(1 for item in items if item.get("stock_status") == "low")
    out_of_stock = sum(1 for item in items if item.get("stock_status") == "out_of_stock")

    # Items expiring within 7 days
    today = datetime.now().date()
    week_from_now = today + timedelta(days=7)
    expiring_soon = 0
    for item in items:
        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                if today <= exp_date <= week_from_now:
                    expiring_soon += 1
            except:
                pass

    # Items by category
    by_category = {}
    for item in items:
        cat = item.get("category", "Other")
        by_category[cat] = by_category.get(cat, 0) + 1

    return {
        "total_items": total_items,
        "full_stock": full_stock,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "expiring_soon": expiring_soon,
        "by_category": by_category
    }
