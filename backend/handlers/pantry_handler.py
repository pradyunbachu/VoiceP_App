"""Chat-driven pantry handlers.

Invoked by the chat route for pantry-related intents:

  handle_pantry_query    — Queries pantry by sub-intent: item_quantity,
                           low_stock, out_of_stock, expiring (7-day window),
                           or list_all.
  handle_pantry_add      — Parses item names from the user's message
                           ("I have flour, oil, and salt") and inserts them
                           into the pantry. Skips non-food items.
  handle_pantry_remove   — Fuzzy-matches an item name and deletes all
                           matching pantry rows.
  handle_cooking_deduct  — Uses Groq to identify which pantry items a recipe
                           requires, then decrements their quantities.

Helper utilities:
  is_pantry_item         — Filters out non-food keywords (household, pet, etc.)
  categorize_pantry_item — Auto-categorizes items using grocery_categories.json
  parse_pantry_items_from_message — Strips filler phrases and splits on commas/and
"""

# ============================================================================
# PANTRY HANDLERS
# ============================================================================
import json
import os
import re
from datetime import datetime, timedelta

from config import supabase, groq_client

# Load grocery categories from shared JSON
_data_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "grocery_categories.json")
with open(_data_path, "r") as f:
    _grocery_data = json.load(f)

_CATEGORY_ITEMS = _grocery_data["items"]
_NON_PANTRY_KEYWORDS = _grocery_data.get("non_pantry", [])

# Build a flat set of all known grocery words for recognition checks
_KNOWN_FOOD_WORDS: set[str] = set()
for _items_list in _CATEGORY_ITEMS.values():
    for _item in _items_list:
        for _word in _item.lower().split():
            _KNOWN_FOOD_WORDS.add(_word)


def is_pantry_item(name: str) -> bool:
    """Return False if the item matches a non-pantry keyword (household, toiletry, pet, etc.)."""
    name_lower = name.lower().strip()
    for keyword in _NON_PANTRY_KEYWORDS:
        if keyword in name_lower or name_lower in keyword:
            return False
    return True


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


    """Check if the item name contains at least one known grocery word.

    Items that categorize as 'Other' and fail this check are likely
    misheard words from voice input (e.g. 'Locales') and should trigger
    a clarification prompt instead of being silently added.
    """
    words = name.lower().strip().split()
    return any(w in _KNOWN_FOOD_WORDS for w in words)


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
    added_items = []
    skipped_items = []
    unrecognized_items = []

    for item_name in pantry_items:
        if not is_pantry_item(item_name):
            skipped_items.append(item_name.title())
            continue
        category = categorize_pantry_item(item_name)

        # If the item falls into "Other" and doesn't match any known grocery
        # word, it's likely a misheard voice input — ask the user to clarify.
        if category == "Other" and not is_recognized_food(item_name):
            unrecognized_items.append(item_name.title())
            continue

        try:
            response = supabase.table("pantry_items").insert({
                "user_id": user_id,
                "name": item_name.title(),
                "quantity": 1,
                "unit": None,
                "category": category,
                "expiration_date": None,
                "purchase_date": None,
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
        "skipped_items": skipped_items,
        "skipped_count": len(skipped_items),
        "unrecognized_items": unrecognized_items,
        "unrecognized_count": len(unrecognized_items),
        "query_type": "pantry_add"
    }


async def handle_pantry_remove(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle removing items from the pantry."""
    if supabase is None:
        return {"message": "Database not configured"}

    item_name = entities.get("item_name")
    if not item_name:
        message_lower = original_message.lower()
        remove_phrases = [
            "remove", "delete", "take out", "get rid of", "toss", "throw out",
            "from my pantry", "from pantry", "from my inventory", "the", "my"
        ]
        cleaned = message_lower
        for phrase in remove_phrases:
            cleaned = cleaned.replace(phrase, " ")
        cleaned = cleaned.strip().strip(".")
        if cleaned:
            item_name = cleaned.strip()

    if not item_name:
        return {
            "success": False,
            "removed_count": 0,
            "message": "I couldn't determine which item to remove. Try 'Remove chicken from my pantry'.",
            "query_type": "pantry_remove"
        }

    try:
        response = (
            supabase.table("pantry_items")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        items = response.data if response.data else []
        search_lower = item_name.lower().strip()

        # Prefer exact name match first, then fall back to word-boundary matching.
        # Avoids "rice" deleting "Rice Vinegar", "Rice Krispies", etc.
        exact = [i for i in items if i.get("name", "").lower().strip() == search_lower]
        if not exact:
            # Word-boundary match: check if search term matches a whole word in the name
            import re
            pattern = re.compile(r'\b' + re.escape(search_lower) + r'\b', re.IGNORECASE)
            exact = [i for i in items if pattern.search(i.get("name", ""))]
        if not exact:
            # Last resort: substring match but only remove the single best match
            substr = [i for i in items if search_lower in i.get("name", "").lower()]
            if len(substr) == 1:
                exact = substr

        matching = exact
        if not matching:
            return {
                "success": False,
                "removed_count": 0,
                "item_name": item_name,
                "message": f"I couldn't find '{item_name}' in your pantry.",
                "query_type": "pantry_remove"
            }

        removed_names = []
        for item in matching:
            supabase.table("pantry_items").delete().eq("id", item["id"]).eq("user_id", user_id).execute()
            removed_names.append(item["name"])

        return {
            "success": True,
            "removed_count": len(removed_names),
            "removed_items": removed_names,
            "query_type": "pantry_remove"
        }
    except Exception as e:
        print(f"Pantry remove error: {e}")
        return {
            "success": False,
            "removed_count": 0,
            "message": "Failed to remove item. Please try again.",
            "query_type": "pantry_remove"
        }


async def handle_cooking_deduct(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle deducting ingredients from pantry when user is cooking a recipe."""
    if supabase is None:
        return {"message": "Database not configured"}

    recipe_name = entities.get("recipe_name")
    if not recipe_name:
        message_lower = original_message.lower()
        cook_phrases = [
            "i'm cooking", "im cooking", "i am cooking",
            "i'm making", "im making", "i am making",
            "i'm preparing", "im preparing", "i am preparing",
            "cooking the", "making the", "preparing the"
        ]
        for phrase in cook_phrases:
            if phrase in message_lower:
                recipe_name = message_lower.split(phrase, 1)[1].strip().strip(".")
                break

    if not recipe_name:
        return {
            "success": False,
            "message": "I couldn't determine what you're cooking. Try 'I'm cooking chicken stir-fry'.",
            "query_type": "cooking_deduct"
        }

    try:
        pantry_response = (
            supabase.table("pantry_items")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        pantry_items = pantry_response.data if pantry_response.data else []

        if not pantry_items:
            return {
                "success": False,
                "message": "Your pantry is empty, so I can't deduct ingredients.",
                "query_type": "cooking_deduct"
            }

        ingredient_names = [i["name"] for i in pantry_items]
        ingredient_list = ", ".join(ingredient_names)

        if not groq_client:
            return {
                "success": False,
                "message": "AI service not available to match recipe ingredients.",
                "query_type": "cooking_deduct"
            }

        deduct_prompt = f"""The user is cooking "{recipe_name}".
Their pantry contains: {ingredient_list}

Which pantry items would be used in this recipe? Return ONLY a JSON array of item names that match.
Example: ["chicken", "rice", "soy sauce"]
Only include items that are actually in the pantry list above. Be practical about what the recipe needs."""

        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a cooking assistant. Respond with valid JSON only."},
                {"role": "user", "content": deduct_prompt}
            ],
            temperature=0.3
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        used_items = json.loads(content)

        deducted = []
        deducted_ids = set()  # Track already-deducted pantry items to prevent double-deduction
        for used_name in used_items:
            for pantry_item in pantry_items:
                if pantry_item["id"] in deducted_ids:
                    continue
                if used_name.lower() in pantry_item["name"].lower() or pantry_item["name"].lower() in used_name.lower():
                    current_qty = pantry_item.get("quantity", 1)
                    new_qty = max(0, current_qty - 1)
                    new_status = "out_of_stock" if new_qty == 0 else ("low" if new_qty <= 1 else "full")

                    supabase.table("pantry_items").update({
                        "quantity": new_qty,
                        "stock_status": new_status,
                        "updated_at": datetime.now().isoformat()
                    }).eq("id", pantry_item["id"]).execute()

                    # Update local copy so subsequent iterations see correct quantity
                    pantry_item["quantity"] = new_qty
                    pantry_item["stock_status"] = new_status
                    deducted_ids.add(pantry_item["id"])

                    deducted.append({
                        "name": pantry_item["name"],
                        "old_quantity": current_qty,
                        "new_quantity": new_qty,
                        "new_status": new_status
                    })
                    break

        return {
            "success": True,
            "recipe_name": recipe_name,
            "deducted_items": deducted,
            "deducted_count": len(deducted),
            "query_type": "cooking_deduct"
        }
    except Exception as e:
        print(f"Cooking deduct error: {e}")
        return {
            "success": False,
            "message": "Failed to deduct ingredients. Please try again.",
            "query_type": "cooking_deduct"
        }
