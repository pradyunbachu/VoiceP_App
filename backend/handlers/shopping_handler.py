"""Chat-driven shopping list handlers.

  handle_shopping_complete  — When the user says "I bought milk and eggs",
      parses the purchased items, removes matching entries from the shopping
      list, and optionally auto-adds them to the pantry (if the user says
      "add these to my pantry").
  handle_shopping_list_add  — When the user says "Add milk to my shopping
      list", parses item names and inserts them into the shopping_list table.

Helpers:
  parse_purchased_items           — Strips filler phrases from a purchase
                                    message and splits on commas/and.
  parse_shopping_items_from_message — Same idea for "add to list" messages.
"""

# ============================================================================
# SHOPPING HANDLERS
# ============================================================================
import re
from datetime import datetime

from config import supabase


def parse_purchased_items(message: str) -> list:
    """Parse item names from a purchase message."""
    message_lower = message.lower()

    remove_phrases = [
        "i bought", "just bought", "i got", "just got", "picked up",
        "got back from the store", "finished shopping", "from the store",
        "at the store", "today", "yesterday", "and", "some", "a few",
        "add these to the pantry", "add these to my pantry", "add them to the pantry",
        "add them to my pantry", "add to the pantry", "add to my pantry",
        "add to pantry", "put these in the pantry", "put these in my pantry",
        "put them in the pantry", "put them in my pantry",
        "stock the pantry", "stock my pantry"
    ]

    cleaned = message_lower
    for phrase in remove_phrases:
        cleaned = cleaned.replace(phrase, " ")

    items = re.split(r'[,;]|\band\b', cleaned)

    parsed_items = []
    for item in items:
        item = item.strip().strip('.')
        if item and len(item) > 1 and item not in ["the", "a", "an", "some"]:
            parsed_items.append(item)

    return parsed_items


_ADD_TO_PANTRY_PHRASES = [
    "add these to the pantry", "add these to my pantry", "add them to the pantry",
    "add them to my pantry", "add to the pantry", "add to my pantry",
    "add to pantry", "put these in the pantry", "put these in my pantry",
    "put them in the pantry", "put them in my pantry",
    "stock the pantry", "stock my pantry"
]


def _should_auto_add_to_pantry(message: str) -> bool:
    """Check if the user wants purchased items auto-added to pantry."""
    message_lower = message.lower()
    return any(phrase in message_lower for phrase in _ADD_TO_PANTRY_PHRASES)


async def handle_shopping_complete(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle when user indicates they finished shopping and bought items."""
    if supabase is None:
        return {"removed_items": [], "message": "Database not configured"}

    auto_add_pantry = _should_auto_add_to_pantry(original_message)

    purchased_items = entities.get("purchased_items", [])

    if not purchased_items:
        purchased_items = parse_purchased_items(original_message)

    if not purchased_items:
        return {
            "removed_items": [],
            "removed_count": 0,
            "message": "I couldn't identify which items you bought. Could you list them?",
            "query_type": "shopping_complete"
        }

    shopping_response = supabase.table("shopping_list").select("*").eq("user_id", user_id).execute()
    shopping_items = shopping_response.data if shopping_response.data else []

    removed_items = []
    removed_ids = []

    for purchased in purchased_items:
        purchased_lower = purchased.lower().strip()
        for shopping_item in shopping_items:
            item_name = shopping_item.get("name", "").lower()
            if purchased_lower in item_name or item_name in purchased_lower:
                if shopping_item["id"] not in removed_ids:
                    removed_ids.append(shopping_item["id"])
                    removed_items.append(shopping_item.get("name"))

    deleted_count = 0
    for item_id in removed_ids:
        response = supabase.table("shopping_list").delete().eq("id", item_id).eq("user_id", user_id).execute()
        if response.data:
            deleted_count += 1

    # Auto-add purchased items to pantry if the user asked for it
    pantry_added = []
    pantry_skipped = []
    if auto_add_pantry:
        from handlers.pantry_handler import categorize_pantry_item, is_pantry_item

        now = datetime.now().isoformat()
        today = datetime.now().strftime("%Y-%m-%d")

        for item_name in purchased_items:
            if not is_pantry_item(item_name):
                pantry_skipped.append(item_name.title())
                continue
            category = categorize_pantry_item(item_name)
            try:
                resp = supabase.table("pantry_items").insert({
                    "user_id": user_id,
                    "name": item_name.title(),
                    "quantity": 1,
                    "unit": None,
                    "category": category,
                    "expiration_date": None,
                    "purchase_date": today,
                    "stock_status": "full",
                    "notes": "Auto-added from shopping trip",
                    "created_at": now,
                    "updated_at": now
                }).execute()
                if resp.data:
                    pantry_added.append(item_name.title())
            except Exception as e:
                print(f"Error auto-adding '{item_name}' to pantry: {e}")

    return {
        "removed_items": removed_items,
        "removed_count": deleted_count,
        "purchased_items": purchased_items,
        "pantry_added": pantry_added,
        "pantry_added_count": len(pantry_added),
        "pantry_skipped": pantry_skipped,
        "pantry_skipped_count": len(pantry_skipped),
        "query_type": "shopping_complete"
    }


def parse_shopping_items_from_message(message: str) -> list:
    """Parse item names from a shopping list add message."""
    message_lower = message.lower()

    remove_phrases = [
        "add to my shopping list", "add to my list", "add to the list",
        "put on my list", "put on the list", "put on my shopping list",
        "add to grocery list", "add to the grocery list",
        "i need to buy", "i need to get", "need to get",
        "add", "please", "can you", "could you"
    ]

    cleaned = message_lower
    for phrase in remove_phrases:
        cleaned = cleaned.replace(phrase, " ")

    items = re.split(r'[,;]|\band\b', cleaned)

    parsed_items = []
    for item in items:
        item = item.strip().strip('.')
        if item and len(item) > 1 and item not in ["the", "a", "an", "some", "to", "my", "me"]:
            parsed_items.append(item.strip())

    return parsed_items


async def handle_shopping_list_add(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle adding items to the shopping list."""
    if supabase is None:
        return {"message": "Database not configured"}

    shopping_items = entities.get("shopping_items", [])
    if not shopping_items:
        shopping_items = parse_shopping_items_from_message(original_message)

    if not shopping_items:
        return {
            "added_items": [],
            "added_count": 0,
            "message": "I couldn't identify which items to add. Try 'Add milk and eggs to my shopping list'.",
            "query_type": "shopping_list_add"
        }

    now = datetime.now().isoformat()
    added_items = []

    for item_name in shopping_items:
        try:
            response = supabase.table("shopping_list").insert({
                "user_id": user_id,
                "name": item_name.title(),
                "quantity": 1,
                "unit": None,
                "category": None,
                "notes": "Added via voice",
                "created_at": now
            }).execute()

            if response.data:
                added_items.append({
                    "name": item_name.title(),
                    "id": response.data[0].get("id")
                })
        except Exception as e:
            print(f"Error adding shopping list item '{item_name}': {e}")

    return {
        "added_items": added_items,
        "added_count": len(added_items),
        "query_type": "shopping_list_add"
    }
