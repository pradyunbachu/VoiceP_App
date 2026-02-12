# ============================================================================
# PANTRY HANDLERS
# ============================================================================
import json
import os
import re
from datetime import datetime, timedelta

from config import supabase

# Load grocery categories from shared JSON
_data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "grocery_categories.json")
with open(_data_path, "r") as f:
    _grocery_data = json.load(f)

_CATEGORY_ITEMS = _grocery_data["items"]


def categorize_pantry_item(name: str) -> str:
    """Auto-categorize a pantry item based on its name using shared grocery data."""
    name_lower = name.lower().strip()

    for word in name_lower.split():
        for category, items in _CATEGORY_ITEMS.items():
            if word in items:
                return category

    # Also try matching the full name (for multi-word items like "ice cream")
    for category, items in _CATEGORY_ITEMS.items():
        if name_lower in items:
            return category

    return "Other"


def parse_pantry_items_from_message(message: str) -> list:
    """Parse item names from a message about existing pantry items."""
    message_lower = message.lower()

    remove_phrases = [
        "i have", "i've got", "i already have", "currently i have", "currently have",
        "i currently have", "right now i have", "at home i have", "in my pantry",
        "in my fridge", "in my kitchen", "in my cabinet", "in my cupboard",
        "some", "a few", "a lot of", "plenty of", "a bit of"
    ]

    cleaned = message_lower
    for phrase in remove_phrases:
        cleaned = cleaned.replace(phrase, " ")

    items = re.split(r'[,;]|\band\b', cleaned)

    parsed_items = []
    for item in items:
        item = item.strip().strip('.')
        if item and len(item) > 1 and item not in ["the", "a", "an", "some", "also", "too", "as well"]:
            parsed_items.append(item.strip())

    return parsed_items


async def handle_pantry_query(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Handle pantry-related queries."""
    if supabase is None:
        return {"items": [], "message": "Database not configured"}

    query = supabase.table("pantry_items").select("*").eq("user_id", user_id)

    if sub_intent == "item_quantity":
        item_name = entities.get("item_name")
        if item_name:
            response = query.execute()
            items = response.data if response.data else []
            matching = [i for i in items if item_name.lower() in i.get("name", "").lower()]
            return {
                "items": matching,
                "count": len(matching),
                "query_type": "item_quantity",
                "searched_item": item_name
            }
        else:
            response = query.execute()
            items = response.data if response.data else []
            return {"items": items, "count": len(items), "query_type": "list_all"}

    elif sub_intent == "low_stock":
        response = query.eq("stock_status", "low").execute()
        items = response.data if response.data else []
        return {"items": items, "count": len(items), "query_type": "low_stock"}

    elif sub_intent == "out_of_stock":
        response = query.eq("stock_status", "out_of_stock").execute()
        items = response.data if response.data else []
        return {"items": items, "count": len(items), "query_type": "out_of_stock"}

    elif sub_intent == "expiring":
        response = query.execute()
        items = response.data if response.data else []
        today = datetime.now().date()
        week_from_now = today + timedelta(days=7)
        expiring = []
        for item in items:
            if item.get("expiration_date"):
                try:
                    exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                    if today <= exp_date <= week_from_now:
                        expiring.append(item)
                except:
                    pass
        return {"items": expiring, "count": len(expiring), "query_type": "expiring"}

    else:
        response = query.execute()
        items = response.data if response.data else []
        return {"items": items, "count": len(items), "query_type": "list_all"}


async def handle_pantry_add(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle when user wants to add pre-existing items to pantry without creating an expense."""
    if supabase is None:
        return {"added_items": [], "message": "Database not configured"}

    pantry_items = entities.get("pantry_items", [])
    if not pantry_items:
        pantry_items = parse_pantry_items_from_message(original_message)

    if not pantry_items:
        return {
            "added_items": [],
            "added_count": 0,
            "message": "I couldn't identify which items you have. Could you list them?",
            "query_type": "pantry_add"
        }

    now = datetime.now().isoformat()
    today = datetime.now().strftime("%Y-%m-%d")
    added_items = []

    for item_name in pantry_items:
        category = categorize_pantry_item(item_name)
        try:
            response = supabase.table("pantry_items").insert({
                "user_id": user_id,
                "name": item_name.title(),
                "quantity": 1,
                "unit": None,
                "category": category,
                "expiration_date": None,
                "purchase_date": today,
                "stock_status": "full",
                "notes": "Added via voice - pre-existing item",
                "created_at": now,
                "updated_at": now
            }).execute()

            if response.data:
                added_items.append({
                    "name": item_name.title(),
                    "category": category,
                    "id": response.data[0].get("id")
                })
        except Exception as e:
            print(f"Error adding pantry item '{item_name}': {e}")

    return {
        "added_items": added_items,
        "added_count": len(added_items),
        "query_type": "pantry_add"
    }
