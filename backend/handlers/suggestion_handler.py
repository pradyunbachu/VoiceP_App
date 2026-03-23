"""Chat-driven suggestion handlers (shopping, meals, weekly plans, budget meals).

  handle_suggestion       — Merges the user's shopping list with low/out-of-stock
                            pantry items to build a consolidated shopping suggestion.
  handle_meal_suggestion  — Uses Groq to suggest 3 meals based on the user's
                            pantry, prioritizing expiring items and respecting
                            the requested meal type (breakfast/lunch/dinner/snack).
  handle_reminder_check   — Looks up a specific pantry item and reports its
                            quantity, stock status, and days until expiration.
  handle_meal_plan_week   — Uses Groq to generate a full 7-day meal plan
                            (breakfast/lunch/dinner) from pantry ingredients.
  handle_budget_meal      — Uses Groq to suggest 3 meals under a given price
                            limit, distinguishing ingredients on-hand vs. to-buy.
"""

# ============================================================================
# SUGGESTION HANDLERS (Shopping + Meal)
# ============================================================================
from datetime import datetime, timedelta
import json

from config import supabase, groq_client

import logging
logger = logging.getLogger(__name__)


async def handle_suggestion(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Generate shopping suggestions based on shopping list and pantry status."""
    if supabase is None:
        return {"shopping_list_items": [], "pantry_items": [], "message": "Database not configured"}

    shopping_response = supabase.table("shopping_list").select("*").eq("user_id", user_id).execute()
    shopping_list_items = shopping_response.data if shopping_response.data else []

    formatted_shopping_list = []
    for item in shopping_list_items:
        formatted_shopping_list.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "quantity": item.get("quantity"),
            "unit": item.get("unit"),
            "category": item.get("category"),
            "notes": item.get("notes"),
            "source": "shopping_list"
        })

    pantry_response = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_response.data if pantry_response.data else []

    pantry_suggestions = []
    for item in pantry_items:
        status = item.get("stock_status", "full")
        if status in ["low", "out_of_stock"]:
            pantry_suggestions.append({
                "id": item.get("id"),
                "name": item.get("name"),
                "category": item.get("category"),
                "status": status,
                "quantity": item.get("quantity"),
                "unit": item.get("unit"),
                "source": "pantry"
            })

    pantry_suggestions.sort(key=lambda x: 0 if x["status"] == "out_of_stock" else 1)

    return {
        "shopping_list_items": formatted_shopping_list,
        "pantry_items": pantry_suggestions,
        "shopping_list_count": len(formatted_shopping_list),
        "pantry_count": len(pantry_suggestions),
        "total_count": len(formatted_shopping_list) + len(pantry_suggestions),
        "query_type": "shopping_list"
    }


async def handle_meal_suggestion(user_id: str, sub_intent: str, entities: dict, message: str = None) -> dict:
    """Generate meal suggestions based on pantry contents and user preferences."""
    if supabase is None:
        return {"meals": [], "message": "Database not configured"}

    pantry_response = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_response.data if pantry_response.data else []

    if not pantry_items:
        return {
            "meals": [],
            "pantry_count": 0,
            "expiring_count": 0,
            "query_type": "meal_suggestion",
            "message": "Your pantry is empty. Add some items first!"
        }

    full_items = [i for i in pantry_items if i.get("stock_status") != "out_of_stock"]

    today = datetime.now().date()
    five_days = today + timedelta(days=5)
    expiring_items = []
    for item in pantry_items:
        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                if today <= exp_date <= five_days:
                    expiring_items.append(item)
            except:
                pass

    ingredient_names = [i["name"] for i in full_items]
    ingredient_list = ", ".join(ingredient_names)

    expiring_names = [i["name"] for i in expiring_items]
    expiring_list = ", ".join(expiring_names) if expiring_names else "none"

    if not groq_client:
        return {
            "meals": [],
            "pantry_count": len(full_items),
            "expiring_count": len(expiring_items),
            "query_type": "meal_suggestion",
            "message": "AI service not available for meal suggestions"
        }

    meal_type = entities.get("meal_type")
    meal_type_instruction = ""
    if meal_type:
        meal_type_instruction = f"\nMeal type requested: {meal_type}. Suggest ONLY {meal_type} recipes that are appropriate for {meal_type} time."
        if meal_type == "breakfast":
            meal_type_instruction += " Think: eggs, pancakes, oatmeal, smoothies, toast, cereal, waffles, etc."
        elif meal_type == "lunch":
            meal_type_instruction += " Think: sandwiches, salads, wraps, soups, light meals, etc."
        elif meal_type == "dinner":
            meal_type_instruction += " Think: full entrees, hearty meals, proteins with sides, pasta dishes, etc."
        elif meal_type == "snack":
            meal_type_instruction += " Think: quick bites, dips, finger food, trail mix, smoothies, etc."
    else:
        current_hour = datetime.now().hour
        if current_hour < 11:
            meal_type_instruction = "\nIt's morning time - suggest breakfast-appropriate meals."
            meal_type = "breakfast"
        elif current_hour < 15:
            meal_type_instruction = "\nIt's around lunchtime - suggest lunch-appropriate meals."
            meal_type = "lunch"
        elif current_hour < 21:
            meal_type_instruction = "\nIt's evening - suggest dinner-appropriate meals."
            meal_type = "dinner"
        else:
            meal_type_instruction = "\nIt's late evening - suggest quick and easy meals or snacks."
            meal_type = "snack"

    user_request = ""
    if message:
        user_request = f"\nUser's request: \"{message}\"\nIMPORTANT: Pay close attention to what the user is asking for. If they want something sweet, suggest desserts or sweet dishes. If they want something spicy, healthy, quick, etc., tailor your suggestions accordingly.\n"

    meal_prompt = f"""Based on these available ingredients, suggest 3 practical meals.
{meal_type_instruction}
{user_request}
Available ingredients: {ingredient_list}
Expiring soon (use first): {expiring_list}

Return ONLY a JSON array of 3 meals. Each meal:
{{
  "name": "Meal Name",
  "ingredients_used": ["ingredient1", "ingredient2"],
  "ingredients_needed": ["any extra ingredient not in pantry"],
  "instructions": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5", "Step 6"],
  "time_minutes": 30,
  "uses_expiring": true/false
}}

Instructions should be an array of 5-8 detailed steps. Each step must include:
- Specific quantities and measurements (e.g., "2 tablespoons", "1 cup diced")
- Cooking temperatures and times (e.g., "over medium-high heat for 3-4 minutes")
- Visual or sensory cues so the cook knows when to move on (e.g., "until golden brown", "until the onions are translucent", "until the internal temperature reaches 165°F")
- Prep details like how to cut, chop, or season (e.g., "dice the onion into 1/4-inch pieces", "season generously with salt and pepper on both sides")
Example good step: "Heat 2 tablespoons of olive oil in a large skillet over medium-high heat until the oil shimmers, about 1 minute."
Example bad step: "Cook the chicken."
Prioritize meals that use expiring ingredients. Keep it practical."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful meal planning assistant. Always respond with valid JSON only."},
                {"role": "user", "content": meal_prompt}
            ],
            temperature=0.7
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        meals = json.loads(content)

        return {
            "meals": meals,
            "pantry_count": len(full_items),
            "expiring_count": len(expiring_items),
            "expiring_items": expiring_names,
            "meal_type": meal_type,
            "query_type": "meal_suggestion"
        }
    except Exception as e:
        logger.error("Meal suggestion error: %s", e)
        return {
            "meals": [],
            "pantry_count": len(full_items),
            "expiring_count": len(expiring_items),
            "query_type": "meal_suggestion",
            "message": "Could not generate meal suggestions. Please try again."
        }


async def handle_reminder_check(user_id: str, entities: dict, original_message: str) -> dict:
    """Check on a specific item's expiration or stock status in the pantry."""
    if supabase is None:
        return {"message": "Database not configured"}

    item_name = entities.get("item_name")
    if not item_name:
        import re
        message_lower = original_message.lower()
        remove_phrases = [
            "remind me to use", "remind me about", "check on",
            "when does", "when do", "expire", "the", "my"
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
            "message": "I couldn't determine which item to check. Try 'Remind me to use the avocados'.",
            "query_type": "reminder_check"
        }

    try:
        response = (
            supabase.table("pantry_items")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        items = response.data if response.data else []
        matching = [i for i in items if item_name.lower() in i.get("name", "").lower()]

        if not matching:
            return {
                "success": False,
                "item_name": item_name,
                "message": f"I don't see any {item_name} in your pantry.",
                "query_type": "reminder_check"
            }

        item = matching[0]
        today = datetime.now().date()
        exp_date = None
        days_until_expiry = None

        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                days_until_expiry = (exp_date - today).days
            except:
                pass

        return {
            "success": True,
            "item_name": item["name"],
            "quantity": item.get("quantity", 1),
            "unit": item.get("unit"),
            "stock_status": item.get("stock_status", "full"),
            "expiration_date": item.get("expiration_date"),
            "days_until_expiry": days_until_expiry,
            "purchase_date": item.get("purchase_date"),
            "query_type": "reminder_check"
        }
    except Exception as e:
        logger.error("Reminder check error: %s", e)
        return {
            "success": False,
            "message": "Failed to check item. Please try again.",
            "query_type": "reminder_check"
        }


async def handle_meal_plan_week(user_id: str, entities: dict) -> dict:
    """Generate a 7-day meal plan based on pantry contents."""
    if supabase is None:
        return {"message": "Database not configured"}

    pantry_response = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_response.data if pantry_response.data else []

    full_items = [i for i in pantry_items if i.get("stock_status") != "out_of_stock"]
    ingredient_names = [i["name"] for i in full_items]
    ingredient_list = ", ".join(ingredient_names) if ingredient_names else "very limited ingredients"

    if not groq_client:
        return {
            "meal_plan": [],
            "message": "AI service not available for meal planning.",
            "query_type": "meal_plan_week"
        }

    today = datetime.now().date()
    five_days = today + timedelta(days=5)
    expiring_names = []
    for item in pantry_items:
        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                if today <= exp_date <= five_days:
                    expiring_names.append(item["name"])
            except:
                pass

    expiring_list = ", ".join(expiring_names) if expiring_names else "none"

    plan_prompt = f"""Create a 7-day meal plan (breakfast, lunch, dinner) using these available ingredients.

Available ingredients: {ingredient_list}
Expiring soon (prioritize): {expiring_list}

Return ONLY a JSON array of 7 objects, one per day:
[
  {{
    "day": "Monday",
    "breakfast": {{"name": "Meal Name", "key_ingredients": ["item1", "item2"], "instructions": ["Step 1", "Step 2", "Step 3"]}},
    "lunch": {{"name": "Meal Name", "key_ingredients": ["item1", "item2"], "instructions": ["Step 1", "Step 2", "Step 3"]}},
    "dinner": {{"name": "Meal Name", "key_ingredients": ["item1", "item2"], "instructions": ["Step 1", "Step 2", "Step 3"]}}
  }}
]

Each meal's instructions should be an array of 4-6 detailed steps. Each step must include specific quantities, cooking temperatures and times, and visual or sensory cues (e.g., "until golden brown", "until fragrant, about 30 seconds"). Include prep details like how to cut or season.
Keep meals practical, varied, and use up expiring items early in the week."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a meal planning assistant. Respond with valid JSON only."},
                {"role": "user", "content": plan_prompt}
            ],
            temperature=0.7
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        meal_plan = json.loads(content)

        return {
            "meal_plan": meal_plan,
            "pantry_count": len(full_items),
            "expiring_items": expiring_names,
            "query_type": "meal_plan_week"
        }
    except Exception as e:
        logger.error("Meal plan week error: %s", e)
        return {
            "meal_plan": [],
            "message": "Could not generate weekly meal plan. Please try again.",
            "query_type": "meal_plan_week"
        }


async def handle_budget_meal(user_id: str, entities: dict, original_message: str) -> dict:
    """Suggest meals under a given price limit, considering pantry items."""
    if supabase is None:
        return {"message": "Database not configured"}

    price_limit = entities.get("price_limit")
    if price_limit is not None:
        price_limit = float(price_limit)
    else:
        import re
        match = re.search(r'\$\s*(\d+(?:\.\d{2})?)', original_message)
        if match:
            price_limit = float(match.group(1))

    if not price_limit:
        price_limit = 10.0

    pantry_response = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_response.data if pantry_response.data else []

    full_items = [i for i in pantry_items if i.get("stock_status") != "out_of_stock"]
    ingredient_names = [i["name"] for i in full_items]
    ingredient_list = ", ".join(ingredient_names) if ingredient_names else "no pantry items"

    if not groq_client:
        return {
            "meals": [],
            "message": "AI service not available for budget meal suggestions.",
            "query_type": "budget_meal"
        }

    budget_prompt = f"""Suggest 3 meals that can be made for under ${price_limit:.2f} per serving.

The user already has these ingredients (free): {ingredient_list}

Return ONLY a JSON array of 3 meals:
[
  {{
    "name": "Meal Name",
    "estimated_cost": 5.00,
    "ingredients_on_hand": ["item1", "item2"],
    "ingredients_to_buy": ["item3"],
    "buy_cost_estimate": 3.00,
    "instructions": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]
  }}
]

Each meal's instructions should be an array of 5-8 detailed steps. Each step must include specific quantities, cooking temperatures and times, and visual or sensory cues (e.g., "until the edges are crispy", "simmer for 15 minutes until the sauce thickens"). Include prep details like how to cut or season.
Consider that pantry items are already available (no cost). Only estimate cost for items that need to be purchased. Keep it practical and budget-friendly."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a budget-conscious meal planning assistant. Respond with valid JSON only."},
                {"role": "user", "content": budget_prompt}
            ],
            temperature=0.7
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        meals = json.loads(content)

        return {
            "meals": meals,
            "price_limit": price_limit,
            "pantry_count": len(full_items),
            "query_type": "budget_meal"
        }
    except Exception as e:
        logger.error("Budget meal error: %s", e)
        return {
            "meals": [],
            "message": "Could not generate budget meal suggestions. Please try again.",
            "query_type": "budget_meal"
        }
