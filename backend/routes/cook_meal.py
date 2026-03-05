"""Cook meal routes.

POST /cook-meal  — Record that a recipe was cooked. Deducts pantry
     ingredients, tracks expiring items saved from waste, and logs
     the meal to the cooked_meals table.

GET  /cook-stats  — Weekly food waste prevention summary: meals cooked,
     expiring items saved, and estimated dollar savings.
"""

# ============================================================================
# COOK MEAL ROUTES - Recipe Cooking Tracker + Food Waste Prevention
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from datetime import datetime, timedelta
import re

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from cache import api_cache, make_cache_key

router = APIRouter()

# Estimated dollar value saved per expiring item diverted from waste
_SAVINGS_PER_ITEM = 3.00


# ============================================================================
# HELPERS
# ============================================================================

def _normalize(name: str) -> str:
    """Lowercase and naive singular: strip trailing 's'/'es'."""
    name = name.lower().strip()
    if name.endswith("ies"):
        name = name[:-3] + "y"      # berries → berry
    elif name.endswith("es") and not name.endswith("ss"):
        name = name[:-2]            # tomatoes → tomato
    elif name.endswith("s") and not name.endswith("ss"):
        name = name[:-1]            # lemons → lemon
    return name


# Items that come in bulk containers and only a small portion is used per recipe.
# Deduct a fraction instead of a full unit so they last across many meals.
_BULK_STAPLE_RE = re.compile(
    r"\b("
    r"oil|olive oil|vegetable oil|canola oil|coconut oil|sesame oil|avocado oil"
    r"|salt|pepper|black pepper|seasoning|spice"
    r"|butter|margarine"
    r"|flour|sugar|brown sugar|powdered sugar|baking soda|baking powder|cornstarch|yeast"
    r"|milk|cream|heavy cream|half and half|sour cream"
    r"|soy sauce|fish sauce|hot sauce|sriracha|ketchup|mustard|mayo|mayonnaise"
    r"|vinegar|balsamic|rice vinegar|apple cider vinegar|white vinegar"
    r"|honey|maple syrup|molasses|agave"
    r"|vanilla|vanilla extract|extract"
    r"|garlic powder|onion powder|cumin|paprika|chili powder|oregano|basil|thyme"
    r"|cinnamon|nutmeg|turmeric|cayenne|ginger powder|italian seasoning"
    r"|worcestershire|teriyaki|barbecue sauce|bbq sauce|ranch"
    r"|peanut butter|jam|jelly"
    r"|cocoa powder|chocolate chips"
    r")\b",
    re.IGNORECASE,
)

# How much to deduct per recipe use
_BULK_DEDUCTION = 0.1   # ~10 uses per container
_NORMAL_DEDUCTION = 1


def _get_deduction(item_name: str) -> float:
    """Return how much quantity to deduct for one recipe use."""
    return _BULK_DEDUCTION if _BULK_STAPLE_RE.search(item_name) else _NORMAL_DEDUCTION


def _match_ingredient_to_pantry(ingredient_name: str, pantry_items: list, matched_ids: set) -> dict | None:
    """Find the best pantry match for an ingredient name.

    Strategy (no AI needed — we already have structured data):
    1. Substring match in both directions ("chicken" ↔ "chicken breast")
    2. Fallback: word-overlap (≥50% of ingredient words appear in pantry name)
    """
    norm_ing = _normalize(ingredient_name)
    norm_ing_words = set(re.split(r"\s+", norm_ing))

    best = None
    best_score = 0

    for item in pantry_items:
        if item["id"] in matched_ids:
            continue
        if item.get("stock_status") == "out_of_stock":
            continue

        norm_pantry = _normalize(item["name"])

        # Exact or substring match (highest priority)
        if norm_ing in norm_pantry or norm_pantry in norm_ing:
            return item

        # Word-overlap fallback
        pantry_words = set(re.split(r"\s+", norm_pantry))
        overlap = len(norm_ing_words & pantry_words)
        score = overlap / max(len(norm_ing_words), 1)
        if score >= 0.5 and score > best_score:
            best = item
            best_score = score

    return best


# ============================================================================
# POST /cook-meal — Record a cooked meal
# ============================================================================

class CookMealRequest(BaseModel):
    recipe_name: str
    ingredients: list[dict]  # [{item: str, amount: str}]


@router.post("/cook-meal")
@limiter.limit("10/minute")
async def cook_meal(
    body: CookMealRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Record that a recipe was cooked: deduct pantry items and track savings."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    # Fetch pantry
    pantry_resp = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_resp.data or []

    if not pantry_items:
        raise HTTPException(status_code=400, detail="No pantry items found")

    # Determine which pantry items are expiring (within 3 days)
    today = datetime.now().date()
    three_days = today + timedelta(days=3)
    expiring_ids: set[int] = set()
    for item in pantry_items:
        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                if today <= exp_date <= three_days:
                    expiring_ids.add(item["id"])
            except (ValueError, KeyError):
                pass

    # Match and deduct ingredients
    matched_ids: set[int] = set()
    deducted: list[dict] = []
    expiring_items_saved = 0

    for ing in body.ingredients:
        ing_name = ing.get("item", "")
        if not ing_name:
            continue

        match = _match_ingredient_to_pantry(ing_name, pantry_items, matched_ids)
        if not match:
            continue

        current_qty = match.get("quantity", 1)
        deduction = _get_deduction(match.get("name", ""))
        new_qty = round(max(0, current_qty - deduction), 2)
        new_status = (
            "out_of_stock" if new_qty == 0
            else "low" if new_qty <= (0.2 if deduction < 1 else 1)
            else "full"
        )

        supabase.table("pantry_items").update({
            "quantity": new_qty,
            "stock_status": new_status,
            "updated_at": datetime.now().isoformat(),
        }).eq("id", match["id"]).execute()

        # Update local copy for subsequent iterations
        match["quantity"] = new_qty
        match["stock_status"] = new_status
        matched_ids.add(match["id"])

        was_expiring = match["id"] in expiring_ids
        if was_expiring:
            expiring_items_saved += 1

        deducted.append({
            "name": match["name"],
            "old_quantity": current_qty,
            "new_quantity": new_qty,
            "new_status": new_status,
            "was_expiring": was_expiring,
        })

    estimated_savings = round(expiring_items_saved * _SAVINGS_PER_ITEM, 2)

    # Record to cooked_meals table
    try:
        supabase.table("cooked_meals").insert({
            "user_id": user_id,
            "recipe_name": body.recipe_name,
            "ingredients_deducted": deducted,
            "expiring_items_saved": expiring_items_saved,
            "estimated_savings": estimated_savings,
        }).execute()
    except Exception as e:
        print(f"Failed to record cooked meal: {e}")
        # Non-fatal — deductions already applied

    # Invalidate related caches
    api_cache.invalidate_prefix(make_cache_key(user_id, "daily_recs"))
    api_cache.invalidate_prefix(make_cache_key(user_id, "cook_stats"))
    api_cache.invalidate_prefix(make_cache_key(user_id, "pantry"))

    return {
        "success": True,
        "recipe_name": body.recipe_name,
        "deducted_items": deducted,
        "deducted_count": len(deducted),
        "expiring_items_saved": expiring_items_saved,
        "estimated_savings": estimated_savings,
    }


# ============================================================================
# GET /cook-stats — Weekly food waste prevention summary
# ============================================================================

@router.get("/cook-stats")
@limiter.limit("30/minute")
async def cook_stats(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Return cooking stats for the last 7 days."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    cache_key = make_cache_key(user_id, "cook_stats")
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    seven_days_ago = (datetime.now() - timedelta(days=7)).isoformat()

    try:
        resp = (
            supabase.table("cooked_meals")
            .select("recipe_name, cooked_at, expiring_items_saved, estimated_savings")
            .eq("user_id", user_id)
            .gte("cooked_at", seven_days_ago)
            .order("cooked_at", desc=True)
            .execute()
        )
        rows = resp.data or []
    except Exception as e:
        print(f"Failed to fetch cook stats: {e}")
        rows = []

    week_meals_cooked = len(rows)
    week_expiring_saved = sum(r.get("expiring_items_saved", 0) for r in rows)
    week_estimated_savings = round(sum(float(r.get("estimated_savings", 0)) for r in rows), 2)
    recent_meals = [
        {"recipe_name": r["recipe_name"], "cooked_at": r["cooked_at"]}
        for r in rows[:5]
    ]

    result = {
        "week_meals_cooked": week_meals_cooked,
        "week_expiring_saved": week_expiring_saved,
        "week_estimated_savings": week_estimated_savings,
        "recent_meals": recent_meals,
    }

    api_cache.set(cache_key, result, ttl=300)  # 5-min cache
    return result
