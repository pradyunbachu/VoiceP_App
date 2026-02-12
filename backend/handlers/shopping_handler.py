# ============================================================================
# SHOPPING COMPLETE HANDLER
# ============================================================================
import re

from config import supabase


def parse_purchased_items(message: str) -> list:
    """Parse item names from a purchase message."""
    message_lower = message.lower()

    remove_phrases = [
        "i bought", "just bought", "i got", "just got", "picked up",
        "got back from the store", "finished shopping", "from the store",
        "at the store", "today", "yesterday", "and", "some", "a few"
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


async def handle_shopping_complete(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle when user indicates they finished shopping and bought items."""
    if supabase is None:
        return {"removed_items": [], "message": "Database not configured"}

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

    return {
        "removed_items": removed_items,
        "removed_count": deleted_count,
        "purchased_items": purchased_items,
        "query_type": "shopping_complete"
    }
