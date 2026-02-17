# ============================================================================
# PANTRY ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta
from typing import Optional

import math as pantry_math

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import (
    PantryItemCreate,
    PantryItemUpdate,
    BulkPantryDeleteRequest,
    AutoPopulatePantryRequest
)
from shelf_life import predict_expiration

router = APIRouter()


def _find_existing_pantry_item(user_id: str, item_name: str):
    """Find an existing pantry item by name (case-insensitive) for the user."""
    response = supabase.table("pantry_items").select("*")\
        .eq("user_id", user_id)\
        .ilike("name", item_name.strip())\
        .limit(1)\
        .execute()
    return response.data[0] if response.data else None


def _merge_pantry_item(existing, add_quantity: float, purchase_date: str = None):
    """Merge a new quantity into an existing pantry item, updating stock status."""
    new_qty = (existing.get("quantity") or 1) + (add_quantity or 1)
    update_data = {
        "quantity": new_qty,
        "stock_status": "full",
        "updated_at": datetime.now().isoformat(),
    }
    if purchase_date:
        update_data["purchase_date"] = purchase_date

    supabase.table("pantry_items").update(update_data)\
        .eq("id", existing["id"]).execute()

    return {**existing, **update_data}


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
    sort_order: Optional[str] = "asc",
    page: int = 1,
    page_size: int = 20,
    paginate: bool = False
):
    """Get pantry items for the current user with filtering, sorting, and optional pagination"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if paginate:
        query = supabase.table("pantry_items").select("*", count="exact").eq("user_id", current_user["id"])
    else:
        query = supabase.table("pantry_items").select("*").eq("user_id", current_user["id"])

    if category:
        query = query.eq("category", category)

    if stock_status:
        query = query.eq("stock_status", stock_status)

    if search:
        query = query.or_(f"name.ilike.%{search}%,category.ilike.%{search}%,notes.ilike.%{search}%")

    valid_sort_fields = {"name", "category", "expiration_date", "purchase_date", "stock_status", "created_at"}
    sort_field = sort_by if sort_by in valid_sort_fields else "name"
    query = query.order(sort_field, desc=(sort_order.lower() == "desc"))

    if paginate:
        start = (page - 1) * page_size
        end = start + page_size - 1
        query = query.range(start, end)

    response = query.execute()
    items = response.data if response.data else []

    # Apply expiring_within_days filter
    if expiring_within_days is not None:
        future_date = (datetime.now() + timedelta(days=expiring_within_days)).date()
        items = [item for item in items if
                 item.get("expiration_date") and
                 datetime.strptime(item["expiration_date"], "%Y-%m-%d").date() <= future_date]

    if paginate:
        total_count = response.count if response.count is not None else len(items)
        total_pages = pantry_math.ceil(total_count / page_size) if page_size > 0 else 1
        return {
            "items": items,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        }

    return {"items": items, "count": len(items)}

@router.post("/pantry")
@limiter.limit("30/minute")
async def create_pantry_item(
    request: Request,
    item: PantryItemCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new pantry item, or merge quantity if it already exists."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    purchase = item.purchase_date or datetime.now().strftime("%Y-%m-%d")

    # Check for existing item with same name — merge instead of duplicating
    existing = _find_existing_pantry_item(current_user["id"], item.name)
    if existing:
        merged = _merge_pantry_item(existing, item.quantity or 1, purchase)
        return {
            "message": f"Updated quantity for {item.name}",
            "merged": True,
            **merged
        }

    now = datetime.now().isoformat()

    expiration_date = item.expiration_date
    expiration_predicted = False
    if not expiration_date:
        expiration_date = predict_expiration(item.name, item.category, purchase)
        expiration_predicted = expiration_date is not None

    response = supabase.table("pantry_items").insert({
        "user_id": current_user["id"],
        "name": item.name,
        "quantity": item.quantity or 1,
        "unit": item.unit,
        "category": item.category or "Other",
        "expiration_date": expiration_date,
        "purchase_date": purchase,
        "stock_status": item.stock_status or "full",
        "notes": item.notes,
        "expiration_predicted": expiration_predicted,
        "created_at": now,
        "updated_at": now
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create pantry item")

    return {
        "message": "Pantry item created successfully",
        "merged": False,
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

    merged_count = 0
    for item_data in populate_request.items:
        item_name = item_data.get("name", "Unknown Item")
        item_category = item_data.get("category", "Other")
        item_expiration = item_data.get("expiration_date")
        item_purchase = expense.get("date")
        item_qty = item_data.get("quantity", 1)

        # Check for existing item — merge instead of duplicating
        existing = _find_existing_pantry_item(current_user["id"], item_name)
        if existing:
            merged = _merge_pantry_item(existing, item_qty, item_purchase)
            created_items.append(merged)
            merged_count += 1
            continue

        exp_predicted = False
        if not item_expiration:
            item_expiration = predict_expiration(item_name, item_category, item_purchase)
            exp_predicted = item_expiration is not None

        response = supabase.table("pantry_items").insert({
            "user_id": current_user["id"],
            "name": item_name,
            "quantity": item_qty,
            "unit": item_data.get("unit"),
            "category": item_category,
            "expiration_date": item_expiration,
            "purchase_date": item_purchase,
            "stock_status": "full",
            "notes": f"Auto-added from {expense.get('store', 'Unknown Store')}",
            "source_expense_id": populate_request.expense_id,
            "expiration_predicted": exp_predicted,
            "created_at": now,
            "updated_at": now
        }).execute()

        if response.data:
            created_items.append(response.data[0])

    new_count = len(created_items) - merged_count
    parts = []
    if new_count > 0:
        parts.append(f"{new_count} new")
    if merged_count > 0:
        parts.append(f"{merged_count} updated")

    return {
        "message": f"{' and '.join(parts)} item(s) added to pantry",
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
        # Clear predicted flag when user manually sets an expiration date
        if item_update.expiration_predicted is None:
            update_data["expiration_predicted"] = False
    if item_update.purchase_date is not None:
        update_data["purchase_date"] = item_update.purchase_date if item_update.purchase_date else None
    if item_update.stock_status is not None:
        update_data["stock_status"] = item_update.stock_status
    if item_update.notes is not None:
        update_data["notes"] = item_update.notes
    if item_update.expiration_predicted is not None:
        update_data["expiration_predicted"] = item_update.expiration_predicted

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


@router.post("/pantry/backfill-dates")
@limiter.limit("10/minute")
async def backfill_pantry_dates(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Backfill missing purchase_date and expiration_date on existing pantry items.
    Also clears bogus expiration dates on non-food items."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from shelf_life import _is_non_pantry

    response = supabase.table("pantry_items").select("*").eq("user_id", current_user["id"]).execute()
    items = response.data if response.data else []

    purchase_filled = 0
    expiration_filled = 0
    expiration_cleared = 0
    now_iso = datetime.now().isoformat()

    for item in items:
        update_data = {}
        is_non_food = _is_non_pantry(item["name"])

        # Backfill purchase_date from created_at or today
        if not item.get("purchase_date"):
            created = item.get("created_at")
            if created:
                try:
                    update_data["purchase_date"] = datetime.fromisoformat(created.replace("Z", "+00:00")).strftime("%Y-%m-%d")
                except Exception:
                    update_data["purchase_date"] = datetime.now().strftime("%Y-%m-%d")
            else:
                update_data["purchase_date"] = datetime.now().strftime("%Y-%m-%d")
            purchase_filled += 1

        # Clear expiration dates on non-food items (they don't expire)
        if is_non_food and item.get("expiration_date"):
            update_data["expiration_date"] = None
            update_data["expiration_predicted"] = False
            expiration_cleared += 1
        # Backfill expiration_date for food items only
        elif not is_non_food and not item.get("expiration_date"):
            purchase = update_data.get("purchase_date") or item.get("purchase_date") or datetime.now().strftime("%Y-%m-%d")
            predicted = predict_expiration(item["name"], item.get("category"), purchase)
            if predicted:
                update_data["expiration_date"] = predicted
                update_data["expiration_predicted"] = True
                expiration_filled += 1

        if update_data:
            update_data["updated_at"] = now_iso
            supabase.table("pantry_items").update(update_data).eq("id", item["id"]).execute()

    return {
        "message": f"Backfilled dates for {purchase_filled + expiration_filled} item(s)",
        "purchase_filled": purchase_filled,
        "expiration_filled": expiration_filled,
        "expiration_cleared": expiration_cleared
    }
