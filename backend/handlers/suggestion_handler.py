# ============================================================================
# SUGGESTION HANDLERS (Shopping + Meal)
# ============================================================================
from datetime import datetime, timedelta
import json

from config import supabase, groq_client


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


async def handle_meal_suggestion(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Generate meal suggestions based on pantry contents."""
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

    meal_prompt = f"""Based on these available ingredients, suggest 3 practical meals.
{meal_type_instruction}

Available ingredients: {ingredient_list}
Expiring soon (use first): {expiring_list}

Return ONLY a JSON array of 3 meals. Each meal:
{{
  "name": "Meal Name",
  "ingredients_used": ["ingredient1", "ingredient2"],
  "ingredients_needed": ["any extra ingredient not in pantry"],
  "instructions": ["Step 1 description", "Step 2 description", "Step 3 description"],
  "time_minutes": 30,
  "uses_expiring": true/false
}}

Instructions should be an array of clear, concise steps (4-6 steps each). Each step should be one action.
Prioritize meals that use expiring ingredients. Keep it practical and simple."""

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
        print(f"Meal suggestion error: {e}")
        return {
            "meals": [],
            "pantry_count": len(full_items),
            "expiring_count": len(expiring_items),
            "query_type": "meal_suggestion",
            "message": "Could not generate meal suggestions. Please try again."
        }
