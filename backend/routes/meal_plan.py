"""Meal planner routes.

GET    /meal-plan                    — Fetch weekly meal plan for a given week.
POST   /meal-plan                    — Add a single meal to the plan.
DELETE /meal-plan/{id}               — Remove a meal from the plan.
POST   /meal-plan/generate           — AI-generate a full week of meals.
POST   /meal-plan/add-to-shopping-list — Push missing ingredients to shopping list.
"""

# ============================================================================
# MEAL PLAN ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from typing import Optional
import json

from config import supabase, groq_client
from auth import get_current_user_dependency
from rate_limit import limiter

import logging
logger = logging.getLogger(__name__)

router = APIRouter()

# ============================================================================
# HELPERS
# ============================================================================

DAYS_OF_WEEK = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MEAL_SLOTS = ["breakfast", "lunch", "dinner"]


def _get_monday(date_str: str | None = None) -> str:
    """Return the Monday of the week containing the given date (YYYY-MM-DD).
    Defaults to this week's Monday if None."""
    if date_str:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            d = datetime.now()
    else:
        d = datetime.now()

    # Monday is weekday 0
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%Y-%m-%d")


def _compute_shopping_summary(meals: list, pantry_items: list) -> list:
    """Cross-reference meal ingredients against pantry to find missing items."""
    # Build a set of normalized pantry item names for fast lookup
    pantry_names = set()
    for item in pantry_items:
        name = item.get("name", "").lower().strip()
        if name and item.get("stock_status") != "out_of_stock":
            pantry_names.add(name)
            # Also add singular/plural variants
            if name.endswith("s"):
                pantry_names.add(name[:-1])
            else:
                pantry_names.add(name + "s")

    missing: dict[str, dict] = {}  # keyed by lowercase item name

    for meal in meals:
        ingredients = meal.get("ingredients") or []
        recipe_name = meal.get("recipe_name", "Unknown")
        for ing in ingredients:
            item_name = ing.get("item", "").strip()
            if not item_name:
                continue

            normalized = item_name.lower().strip()

            # Check if in pantry (substring match in both directions)
            in_pantry = False
            for pname in pantry_names:
                if normalized in pname or pname in normalized:
                    in_pantry = True
                    break

            if not in_pantry:
                key = normalized
                if key in missing:
                    if recipe_name not in missing[key]["needed_for"]:
                        missing[key]["needed_for"].append(recipe_name)
                else:
                    missing[key] = {
                        "item": item_name,
                        "amount": ing.get("amount", ""),
                        "needed_for": [recipe_name],
                    }

    return list(missing.values())


# ============================================================================
# SCHEMAS
# ============================================================================

class PlannedMealCreate(BaseModel):
    day: str = Field(..., pattern="^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$")
    slot: str = Field(..., pattern="^(breakfast|lunch|dinner)$")
    recipe_name: str = Field(..., max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    time_minutes: Optional[int] = None
    ingredients: Optional[list[dict]] = None  # [{item: str, amount: str}]
    week_start: str = Field(..., max_length=10)


class GenerateMealPlanRequest(BaseModel):
    week_start: str = Field(..., max_length=10)
    preferences: Optional[str] = Field(default=None, max_length=500)


class AddToShoppingListRequest(BaseModel):
    week_start: str = Field(..., max_length=10)
    group_id: Optional[int] = None


# ============================================================================
# GET /meal-plan — Fetch weekly plan
# ============================================================================

@router.get("/meal-plan")
@limiter.limit("30/minute")
async def get_meal_plan(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    week_start: str | None = Query(None),
):
    """Fetch all meals for a given week. Includes a shopping summary of missing ingredients."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]
    monday = _get_monday(week_start)

    # Fetch meals for this week
    resp = (
        supabase.table("meal_plan")
        .select("*")
        .eq("user_id", user_id)
        .eq("week_start", monday)
        .execute()
    )
    meals = resp.data or []

    # Fetch pantry items for shopping summary
    pantry_resp = supabase.table("pantry_items").select("id, name, stock_status").eq("user_id", user_id).execute()
    pantry_items = pantry_resp.data or []

    # Mark each ingredient as in_pantry or not
    pantry_names = set()
    for item in pantry_items:
        name = item.get("name", "").lower().strip()
        if name and item.get("stock_status") != "out_of_stock":
            pantry_names.add(name)
            if name.endswith("s"):
                pantry_names.add(name[:-1])
            else:
                pantry_names.add(name + "s")

    for meal in meals:
        ingredients = meal.get("ingredients") or []
        for ing in ingredients:
            item_name = (ing.get("item", "") or "").lower().strip()
            in_pantry = False
            for pname in pantry_names:
                if item_name in pname or pname in item_name:
                    in_pantry = True
                    break
            ing["in_pantry"] = in_pantry

    shopping_summary = _compute_shopping_summary(meals, pantry_items)

    return {
        "week_start": monday,
        "meals": meals,
        "shopping_summary": shopping_summary,
    }


# ============================================================================
# POST /meal-plan — Add a single meal
# ============================================================================

@router.post("/meal-plan")
@limiter.limit("30/minute")
async def create_planned_meal(
    body: PlannedMealCreate,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Add a meal to the plan for a specific day and slot."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]
    monday = _get_monday(body.week_start)

    # Check if slot is already taken
    existing = (
        supabase.table("meal_plan")
        .select("id")
        .eq("user_id", user_id)
        .eq("week_start", monday)
        .eq("day", body.day)
        .eq("slot", body.slot)
        .execute()
    )
    if existing.data:
        # Replace existing meal in this slot
        supabase.table("meal_plan").delete().eq("id", existing.data[0]["id"]).execute()

    row = {
        "user_id": user_id,
        "week_start": monday,
        "day": body.day,
        "slot": body.slot,
        "recipe_name": body.recipe_name,
        "description": body.description,
        "time_minutes": body.time_minutes,
        "ingredients": body.ingredients or [],
    }

    resp = supabase.table("meal_plan").insert(row).execute()

    if not resp.data:
        raise HTTPException(status_code=500, detail="Failed to create planned meal")

    return resp.data[0]


# ============================================================================
# DELETE /meal-plan/{id} — Remove a meal
# ============================================================================

@router.delete("/meal-plan/{meal_id}")
@limiter.limit("30/minute")
async def delete_planned_meal(
    meal_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Remove a planned meal."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    resp = (
        supabase.table("meal_plan")
        .delete()
        .eq("id", meal_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="Meal not found")

    return {"message": "Meal removed from plan"}


# ============================================================================
# POST /meal-plan/generate — AI-generate a full week
# ============================================================================

def _generate_weekly_plan(ingredient_list: str, expiring_list: str, preferences: str = ""):
    """Call Groq to generate a full week of meals."""
    if not groq_client:
        return None

    pref_block = ""
    if preferences:
        pref_block = f"\nUser dietary preferences: {preferences}\nTailor ALL meals to match these preferences.\n"

    prompt = f"""Generate a weekly meal plan (Monday through Sunday) with breakfast, lunch, and dinner for each day.

Available pantry ingredients: {ingredient_list}
Expiring soon (PRIORITIZE these): {expiring_list}
{pref_block}
Rules:
- Use available ingredients as much as possible
- Prioritize expiring items in earlier meals
- Keep meals practical and varied
- Include prep time estimates

Return ONLY a JSON array of objects, one per meal:
[{{"day": "monday", "slot": "breakfast", "recipe_name": "Scrambled Eggs", "description": "Quick and simple", "time_minutes": 10, "ingredients": [{{"item": "eggs", "amount": "3"}}, {{"item": "butter", "amount": "1 tbsp"}}]}}]

Generate exactly 21 meals (3 per day, 7 days). JSON only, no other text."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a meal planning assistant. Respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
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

        # Validate and normalize structure
        valid_meals = []
        for m in meals:
            if not isinstance(m, dict) or not m.get("recipe_name"):
                continue
            # Normalize day/slot to lowercase
            m["day"] = (m.get("day") or "").lower().strip()
            m["slot"] = (m.get("slot") or "").lower().strip()
            if m["day"] in DAYS_OF_WEEK and m["slot"] in MEAL_SLOTS:
                valid_meals.append(m)

        return valid_meals
    except Exception as e:
        logger.error("Meal plan generation error: %s", e)
        return None


@router.post("/meal-plan/generate")
@limiter.limit("5/minute")
async def generate_meal_plan(
    body: GenerateMealPlanRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """AI-generate a full weekly meal plan based on pantry contents."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    if not groq_client:
        raise HTTPException(status_code=500, detail="AI service not configured")

    user_id = current_user["id"]
    monday = _get_monday(body.week_start)

    # Fetch pantry
    pantry_resp = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_resp.data or []

    if not pantry_items:
        raise HTTPException(status_code=400, detail="Add items to your pantry first to generate a meal plan")

    # Build ingredient lists
    available = [i for i in pantry_items if i.get("stock_status") != "out_of_stock"]
    ingredient_list = ", ".join(i["name"] for i in available) or "none"

    today = datetime.now().date()
    three_days = today + timedelta(days=3)
    expiring_names = []
    for item in pantry_items:
        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                if today <= exp_date <= three_days:
                    expiring_names.append(item["name"])
            except (ValueError, KeyError):
                pass
    expiring_list = ", ".join(expiring_names) or "none"

    # Generate with AI
    generated_meals = _generate_weekly_plan(
        ingredient_list, expiring_list, body.preferences or ""
    )

    if not generated_meals:
        raise HTTPException(status_code=500, detail="Failed to generate meal plan")

    # Clear existing meals for this week
    supabase.table("meal_plan").delete().eq("user_id", user_id).eq("week_start", monday).execute()

    # Insert all generated meals (deduplicate — AI may return multiple for same slot)
    seen_slots: set[str] = set()
    rows = []
    for meal in generated_meals:
        day = (meal.get("day") or "").lower().strip()
        slot = (meal.get("slot") or "").lower().strip()
        key = f"{day}-{slot}"
        if key in seen_slots:
            continue
        if day not in DAYS_OF_WEEK or slot not in MEAL_SLOTS:
            continue
        seen_slots.add(key)
        rows.append({
            "user_id": user_id,
            "week_start": monday,
            "day": day,
            "slot": slot,
            "recipe_name": meal["recipe_name"],
            "description": meal.get("description"),
            "time_minutes": meal.get("time_minutes"),
            "ingredients": meal.get("ingredients", []),
        })

    if rows:
        try:
            supabase.table("meal_plan").insert(rows).execute()
        except Exception as e:
            logger.error("Failed to insert meal plan rows: %s", e)
            # Try inserting one-by-one so partial success is possible
            for row in rows:
                try:
                    supabase.table("meal_plan").insert(row).execute()
                except Exception as row_err:
                    logger.warning("Skipped meal %s/%s: %s", row["day"], row["slot"], row_err)

    # Fetch the full plan back (with IDs)
    resp = (
        supabase.table("meal_plan")
        .select("*")
        .eq("user_id", user_id)
        .eq("week_start", monday)
        .execute()
    )
    meals = resp.data or []

    # Compute shopping summary
    shopping_summary = _compute_shopping_summary(meals, pantry_items)

    return {
        "week_start": monday,
        "meals": meals,
        "shopping_summary": shopping_summary,
    }


# ============================================================================
# POST /meal-plan/add-to-shopping-list — Push missing ingredients
# ============================================================================

@router.post("/meal-plan/add-to-shopping-list")
@limiter.limit("10/minute")
async def add_to_shopping_list(
    body: AddToShoppingListRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Add all missing ingredients from the meal plan to the shopping list."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]
    monday = _get_monday(body.week_start)

    # Fetch meals
    meals_resp = (
        supabase.table("meal_plan")
        .select("*")
        .eq("user_id", user_id)
        .eq("week_start", monday)
        .execute()
    )
    meals = meals_resp.data or []

    # Fetch pantry
    pantry_resp = supabase.table("pantry_items").select("id, name, stock_status").eq("user_id", user_id).execute()
    pantry_items = pantry_resp.data or []

    missing = _compute_shopping_summary(meals, pantry_items)

    if not missing:
        return {"added_count": 0, "items": []}

    # Fetch existing shopping list to avoid duplicates
    existing_resp = supabase.table("shopping_list").select("name").eq("user_id", user_id).execute()
    existing_names = {item["name"].lower().strip() for item in (existing_resp.data or [])}

    items_to_add = []
    for item in missing:
        name = item["item"].strip()
        if name.lower() in existing_names:
            continue

        row = {
            "user_id": user_id,
            "name": name,
            "quantity": 1,
            "notes": f"For: {', '.join(item['needed_for'])}",
        }
        if body.group_id:
            row["group_id"] = body.group_id
        items_to_add.append(row)

    if not items_to_add:
        return {"added_count": 0, "items": []}

    resp = supabase.table("shopping_list").insert(items_to_add).execute()
    added = resp.data or []

    return {
        "added_count": len(added),
        "items": added,
    }
