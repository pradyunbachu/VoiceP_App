# ============================================================================
# SHOPPING LIST ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime
from typing import Optional

from config import supabase
from auth import get_current_user_dependency
from schemas import (
    ShoppingListItemCreate,
    ShoppingListItemUpdate,
    BulkShoppingListDeleteRequest
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.get("/shopping-list")
@limiter.limit("60/minute")
async def get_shopping_list(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    category: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc"
):
    """Get all shopping list items for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    query = supabase.table("shopping_list").select("*").eq("user_id", current_user["id"])

    if category:
        query = query.eq("category", category)

    valid_sort_fields = {"name", "category", "created_at", "quantity"}
    sort_field = sort_by if sort_by in valid_sort_fields else "created_at"
    query = query.order(sort_field, desc=(sort_order.lower() == "desc"))

    response = query.execute()
    items = response.data if response.data else []

    return {"items": items, "count": len(items)}


@router.post("/shopping-list")
@limiter.limit("30/minute")
async def create_shopping_list_item(
    request: Request,
    item: ShoppingListItemCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Add a new item to the shopping list"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    now = datetime.now().isoformat()

    response = supabase.table("shopping_list").insert({
        "user_id": current_user["id"],
        "name": item.name,
        "quantity": item.quantity or 1,
        "unit": item.unit,
        "category": item.category,
        "notes": item.notes,
        "created_at": now
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create shopping list item")

    return {
        "message": "Item added to shopping list",
        **response.data[0]
    }


@router.put("/shopping-list/{item_id}")
@limiter.limit("30/minute")
async def update_shopping_list_item(
    request: Request,
    item_id: int,
    item_update: ShoppingListItemUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update a shopping list item"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Verify item belongs to user
    check_response = supabase.table("shopping_list").select("id").eq("id", item_id).eq("user_id", current_user["id"]).execute()
    if not check_response.data:
        raise HTTPException(status_code=404, detail="Shopping list item not found")

    update_data = {}
    if item_update.name is not None:
        update_data["name"] = item_update.name
    if item_update.quantity is not None:
        update_data["quantity"] = item_update.quantity
    if item_update.unit is not None:
        update_data["unit"] = item_update.unit
    if item_update.category is not None:
        update_data["category"] = item_update.category
    if item_update.notes is not None:
        update_data["notes"] = item_update.notes

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    supabase.table("shopping_list").update(update_data).eq("id", item_id).eq("user_id", current_user["id"]).execute()

    return {"message": "Shopping list item updated successfully"}


@router.delete("/shopping-list/clear")
@limiter.limit("10/minute")
async def clear_shopping_list(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Clear all items from the shopping list"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("shopping_list").delete().eq("user_id", current_user["id"]).execute()
    deleted_count = len(response.data) if response.data else 0

    return {"message": f"Cleared {deleted_count} item(s) from shopping list", "deleted_count": deleted_count}


@router.delete("/shopping-list/bulk")
@limiter.limit("10/minute")
async def delete_shopping_list_items_bulk(
    request: Request,
    bulk_request: BulkShoppingListDeleteRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete multiple shopping list items (e.g., when items are purchased)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    deleted_count = 0
    deleted_items = []
    for item_id in bulk_request.item_ids:
        response = supabase.table("shopping_list").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()
        if response.data:
            deleted_count += 1
            deleted_items.append(response.data[0].get("name", ""))

    return {
        "message": f"{deleted_count} item(s) removed from shopping list",
        "deleted_count": deleted_count,
        "deleted_items": deleted_items
    }


@router.delete("/shopping-list/{item_id}")
@limiter.limit("30/minute")
async def delete_shopping_list_item(
    request: Request,
    item_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a single shopping list item"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("shopping_list").delete().eq("id", item_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Shopping list item not found")

    return {"message": "Shopping list item deleted successfully"}


@router.delete("/shopping-list/by-name/{item_name}")
@limiter.limit("30/minute")
async def delete_shopping_list_item_by_name(
    request: Request,
    item_name: str,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete shopping list items matching a name (case-insensitive partial match)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Get all items for user
    all_items = supabase.table("shopping_list").select("*").eq("user_id", current_user["id"]).execute()
    items = all_items.data if all_items.data else []

    # Find matches (case-insensitive)
    item_name_lower = item_name.lower()
    matching_items = [item for item in items if item_name_lower in item.get("name", "").lower()]

    deleted_count = 0
    deleted_names = []
    for item in matching_items:
        response = supabase.table("shopping_list").delete().eq("id", item["id"]).eq("user_id", current_user["id"]).execute()
        if response.data:
            deleted_count += 1
            deleted_names.append(item.get("name", ""))

    return {
        "message": f"{deleted_count} item(s) removed from shopping list",
        "deleted_count": deleted_count,
        "deleted_items": deleted_names
    }


@router.post("/shopping-list/remove-purchased")
@limiter.limit("30/minute")
async def remove_purchased_items(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Remove items from shopping list that match purchased items text.

    Expects JSON body: { "items_text": "milk, eggs, bread" }
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    body = await request.json()
    items_text = body.get("items_text", "")

    if not items_text:
        return {"message": "No items provided", "deleted_count": 0, "deleted_items": []}

    # Parse the items text into individual items
    # Handle common separators: comma, "and", newlines
    import re
    items_text_clean = items_text.lower()
    # Split by comma, "and", or newlines
    parsed_items = re.split(r'[,\n]|\band\b', items_text_clean)
    parsed_items = [item.strip().strip('.') for item in parsed_items if item.strip()]

    if not parsed_items:
        return {"message": "No items parsed", "deleted_count": 0, "deleted_items": []}

    # Get all shopping list items for user
    all_items = supabase.table("shopping_list").select("*").eq("user_id", current_user["id"]).execute()
    shopping_items = all_items.data if all_items.data else []

    # Match and remove items
    deleted_count = 0
    deleted_names = []
    deleted_ids = set()

    for purchased in parsed_items:
        purchased_clean = purchased.lower().strip()
        if len(purchased_clean) < 2:
            continue

        for shopping_item in shopping_items:
            if shopping_item["id"] in deleted_ids:
                continue

            item_name = shopping_item.get("name", "").lower()
            # Check for partial match (either direction)
            if purchased_clean in item_name or item_name in purchased_clean:
                response = supabase.table("shopping_list").delete().eq("id", shopping_item["id"]).eq("user_id", current_user["id"]).execute()
                if response.data:
                    deleted_count += 1
                    deleted_names.append(shopping_item.get("name", ""))
                    deleted_ids.add(shopping_item["id"])

    return {
        "message": f"{deleted_count} item(s) removed from shopping list",
        "deleted_count": deleted_count,
        "deleted_items": deleted_names,
        "searched_items": parsed_items
    }
