# ============================================================================
# DAILY RECS ROUTES - AI-Powered Daily Recommendations
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta
import json

from config import supabase, groq_client
from auth import get_current_user_dependency
from rate_limit import limiter
from cache import api_cache, make_cache_key

router = APIRouter()


def detect_meal_type() -> str:
    """Determine meal type based on current hour."""
    hour = datetime.now().hour
    if hour < 11:
        return "breakfast"
    elif hour < 15:
        return "lunch"
    elif hour < 21:
        return "dinner"
    else:
        return "snack"


def get_greeting(meal_type: str) -> str:
    """Return a time-appropriate greeting."""
    greetings = {
        "breakfast": "Good morning! Here's what I'd suggest to start your day.",
        "lunch": "Afternoon! Here are some lunch ideas based on your pantry.",
        "dinner": "Good evening! Here's what you could make for dinner tonight.",
        "snack": "Late night? Here are some quick bites you can whip up.",
    }
    return greetings.get(meal_type, "Here are some meal ideas for you!")


def generate_meal_recs(ingredient_list: str, expiring_list: str, meal_type: str):
    """Call Groq for 2 quick meal suggestions."""
    if not groq_client:
        return None

    meal_hints = {
        "breakfast": "breakfast foods like eggs, pancakes, oatmeal, toast, smoothies",
        "lunch": "lunch foods like sandwiches, salads, wraps, soups",
        "dinner": "dinner foods like pasta, stir-fry, proteins with sides",
        "snack": "snacks like dips, toast, trail mix, quick bites",
    }

    prompt = f"""Suggest exactly 2 quick {meal_type} meals using these ingredients.

Available: {ingredient_list}
Expiring soon (prioritize): {expiring_list}

Think: {meal_hints.get(meal_type, "simple practical meals")}

Return ONLY a JSON array of 2 objects:
[{{"name": "Meal Name", "description": "One sentence about the dish", "time_minutes": 15, "uses_expiring": true}}]

Keep it short and practical."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful meal planning assistant. Respond with valid JSON only."},
                {"role": "user", "content": prompt}
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

        return json.loads(content)
    except Exception as e:
        print(f"Daily recs meal generation error: {e}")
        return None


@router.get("/daily-recs")
@limiter.limit("20/minute")
async def get_daily_recs(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """
    Generate daily recommendations: meal ideas + pantry alerts.
    Cached for 30 minutes per user.
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    cache_key = make_cache_key(user_id, "daily_recs")
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    # Single query for all pantry items
    pantry_response = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_response.data or []

    if not pantry_items:
        result = {
            "meal_type": detect_meal_type(),
            "greeting": get_greeting(detect_meal_type()),
            "meals": [],
            "low_stock": [],
            "expiring": [],
            "pantry_count": 0,
        }
        api_cache.set(cache_key, result, ttl=1800)
        return result

    # Filter: low stock items
    low_stock = []
    for item in pantry_items:
        status = item.get("stock_status", "full")
        if status in ("low", "out_of_stock"):
            low_stock.append({
                "name": item["name"],
                "status": status,
                "category": item.get("category", "Other"),
            })
    low_stock.sort(key=lambda x: 0 if x["status"] == "out_of_stock" else 1)

    # If no low stock items, pick up to 2 random items with quantity == 1
    if not low_stock:
        qty_one_items = [
            item for item in pantry_items
            if item.get("quantity") == 1 and item.get("stock_status") not in ("low", "out_of_stock")
        ]
        import random
        sampled = random.sample(qty_one_items, min(2, len(qty_one_items)))
        for item in sampled:
            low_stock.append({
                "name": item["name"],
                "status": "low",
                "category": item.get("category", "Other"),
            })

    # Filter: expiring within 3 days
    today = datetime.now().date()
    three_days = today + timedelta(days=3)
    expiring = []
    for item in pantry_items:
        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                if today <= exp_date <= three_days:
                    days_left = (exp_date - today).days
                    expiring.append({
                        "name": item["name"],
                        "expiration_date": item["expiration_date"],
                        "days_left": days_left,
                        "category": item.get("category", "Other"),
                    })
            except (ValueError, KeyError):
                pass
    expiring.sort(key=lambda x: x["days_left"])

    # Build ingredient lists for Groq
    available_items = [i for i in pantry_items if i.get("stock_status") != "out_of_stock"]
    ingredient_list = ", ".join(i["name"] for i in available_items) or "none"
    expiring_list = ", ".join(i["name"] for i in expiring) or "none"

    meal_type = detect_meal_type()
    meals = generate_meal_recs(ingredient_list, expiring_list, meal_type) or []

    result = {
        "meal_type": meal_type,
        "greeting": get_greeting(meal_type),
        "meals": meals[:2],
        "low_stock": low_stock[:5],
        "expiring": expiring[:5],
        "pantry_count": len(pantry_items),
    }

    api_cache.set(cache_key, result, ttl=1800)
    return result
