"""Shopping list CRUD routes.

Provides personal and group shopping list management: create, read, update,
delete (single, bulk, by-name, clear-all). Also includes an AI-powered
pantry-matching endpoint that uses a two-pass strategy — first a fast
deterministic matcher (case-insensitive, substring, word-overlap) and then
Groq LLM for any remaining unmatched items.
"""

# ============================================================================
# SHOPPING LIST ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime
from typing import Optional
import json

from config import supabase, groq_client
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import (
    ShoppingListItemCreate,
    ShoppingListItemUpdate,
    BulkShoppingListDeleteRequest
)

router = APIRouter()


def verify_group_membership(user_id: str, group_id: int) -> bool:
    """Check if user is a member of the group."""
    response = supabase.table("shopping_list_members").select("id").eq("group_id", group_id).eq("user_id", user_id).execute()
    return bool(response.data)


@router.get("/shopping-list")
@limiter.limit("60/minute")
async def get_shopping_list(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    category: Optional[str] = None,
    group_id: Optional[int] = None,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc"
):
    """Get all shopping list items for the current user or a shared group"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    if group_id:
        # Verify membership
        if not verify_group_membership(current_user["id"], group_id):
            raise HTTPException(status_code=403, detail="Not a member of this group")
        query = supabase.table("shopping_list").select("*").eq("group_id", group_id)
    else:
        # Personal list: user's items with no group
        query = supabase.table("shopping_list").select("*").eq("user_id", current_user["id"]).is_("group_id", "null")

    if category:
        query = query.eq("category", category)

    # Whitelist sortable columns to prevent SQL injection
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

    insert_data = {
        "user_id": current_user["id"],
        "name": item.name,
        "quantity": item.quantity or 1,
        "unit": item.unit,
        "category": item.category,
        "notes": item.notes,
        "created_at": now
    }

    if item.group_id:
        # Verify membership before adding to group
        if not verify_group_membership(current_user["id"], item.group_id):
            raise HTTPException(status_code=403, detail="Not a member of this group")
        insert_data["group_id"] = item.group_id

    response = supabase.table("shopping_list").insert(insert_data).execute()

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
    # Split on commas, newlines, or the word "and" to handle natural-language lists
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
        # Skip single-char fragments left over after splitting
        if len(purchased_clean) < 2:
            continue

        for shopping_item in shopping_items:
            if shopping_item["id"] in deleted_ids:
                continue

            item_name = shopping_item.get("name", "").lower()
            # Bidirectional partial match: "milk" matches "almond milk" and vice versa
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


# ============================================================================
# SEMANTIC ITEM MATCHING WITH GROQ
# ============================================================================

ITEM_MATCHING_PROMPT = """You are a grocery item matcher. Given a list of shopping list items and pantry items, identify which shopping items match pantry items (they refer to the same product).

Items match if they are the same product, even if:
- Words are in different order ("Iceberg Lettuce" = "Lettuce Iceberg")
- One is more specific ("Milk" matches "2% Milk" or "Whole Milk")
- There are minor spelling variations
- One has brand name and one doesn't

DO NOT match items that are different products (e.g., "Lettuce" should NOT match "Tomatoes").

Shopping List Items:
{shopping_items}

Pantry Items:
{pantry_items}

Return ONLY a JSON array of matches. Each match should have:
- "shopping_id": the ID of the shopping list item
- "pantry_id": the ID of the matching pantry item
- "confidence": "high" or "medium" (high = exact same product, medium = likely same but less certain)

If a shopping item has no match in the pantry, don't include it.

Example response:
[
  {{"shopping_id": 1, "pantry_id": 5, "confidence": "high"}},
  {{"shopping_id": 3, "pantry_id": 12, "confidence": "medium"}}
]

Return an empty array [] if there are no matches."""


@router.post("/shopping-list/match-pantry")
@limiter.limit("20/minute")
async def match_shopping_to_pantry(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Use AI to semantically match shopping list items to pantry items.

    Returns a mapping of shopping_item_id -> pantry_item for items that match.
    This handles cases like "Iceberg Lettuce" matching "Lettuce Iceberg".
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    # Get shopping list items
    shopping_response = supabase.table("shopping_list").select("id, name").eq("user_id", user_id).execute()
    shopping_items = shopping_response.data if shopping_response.data else []

    # Get pantry items
    pantry_response = supabase.table("pantry_items").select("id, name, quantity, unit, stock_status").eq("user_id", user_id).execute()
    pantry_items = pantry_response.data if pantry_response.data else []

    if not shopping_items or not pantry_items:
        return {"matches": {}, "method": "no_items"}

    # Pass 1 — fast deterministic matching (exact, substring, word-overlap)
    simple_matches = {}
    unmatched_shopping = []

    for shop_item in shopping_items:
        shop_name = shop_item["name"].lower().strip()
        matched = False

        for pantry_item in pantry_items:
            pantry_name = pantry_item["name"].lower().strip()

            # Exact match (case-insensitive)
            if shop_name == pantry_name:
                simple_matches[shop_item["id"]] = pantry_item
                matched = True
                break

            # Check if one contains the other (for partial matches like "Milk" -> "2% Milk")
            if shop_name in pantry_name or pantry_name in shop_name:
                simple_matches[shop_item["id"]] = pantry_item
                matched = True
                break

            # Word-overlap heuristic: if >= 50% of the shorter name's words overlap, treat as match
            # Handles reordered names like "Iceberg Lettuce" vs "Lettuce Iceberg"
            shop_words = set(shop_name.split())
            pantry_words = set(pantry_name.split())
            if shop_words and pantry_words:
                overlap = shop_words & pantry_words
                min_words = min(len(shop_words), len(pantry_words))
                if len(overlap) >= min_words * 0.5 and len(overlap) >= 1:
                    simple_matches[shop_item["id"]] = pantry_item
                    matched = True
                    break

        if not matched:
            unmatched_shopping.append(shop_item)

    # If all items matched with simple matching, return early
    if not unmatched_shopping:
        return {"matches": simple_matches, "method": "simple"}

    # Pass 2 — send remaining unmatched items to Groq for semantic matching
    if not groq_client:
        return {"matches": simple_matches, "method": "simple_only"}

    try:
        # Format items for the prompt
        shopping_str = "\n".join([f"- ID {item['id']}: {item['name']}" for item in unmatched_shopping])
        pantry_str = "\n".join([f"- ID {item['id']}: {item['name']}" for item in pantry_items])

        prompt = ITEM_MATCHING_PROMPT.format(
            shopping_items=shopping_str,
            pantry_items=pantry_str
        )

        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",  # Fast model for quick matching
            messages=[
                {"role": "system", "content": "You are a helpful assistant that matches grocery items. Always respond with valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )

        content = response.choices[0].message.content.strip()

        # Clean up markdown code blocks if present
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        ai_matches = json.loads(content)

        # Create a lookup for pantry items by ID
        pantry_by_id = {item["id"]: item for item in pantry_items}

        # Add AI matches to results
        for match in ai_matches:
            shopping_id = match.get("shopping_id")
            pantry_id = match.get("pantry_id")

            if shopping_id and pantry_id and pantry_id in pantry_by_id:
                simple_matches[shopping_id] = pantry_by_id[pantry_id]

        return {"matches": simple_matches, "method": "ai_enhanced"}

    except Exception as e:
        print(f"AI matching error: {e}")
        # Return simple matches on error
        return {"matches": simple_matches, "method": "simple_fallback"}
