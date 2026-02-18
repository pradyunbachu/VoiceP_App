"""Shelf life prediction for pantry items.

Estimates expiration dates by matching an item name against a tiered lookup:
  1. Exact match in the shelf-life database
  2. Longest-substring match (e.g. "chicken" matches "organic chicken breast")
  3. Category-level default (e.g. "Meat & Seafood" -> 5 days)
  4. Global fallback (30 days)

Non-food household items (detected via keyword list) return no expiration.
Data is loaded once at module import from JSON files in backend/data/.
"""

# ============================================================================
# SHELF LIFE PREDICTION UTILITY
# ============================================================================
import json
import os
from datetime import datetime, timedelta

_data_path = os.path.join(os.path.dirname(__file__), "data", "shelf_life.json")
with open(_data_path, "r") as _f:
    _shelf_life_data = json.load(_f)

_ITEM_SHELF_LIFE = _shelf_life_data["items"]          # item name -> days
_CATEGORY_DEFAULTS = _shelf_life_data["category_defaults"]  # category -> days

# Pre-sort keys by length descending for longest-substring-first matching
_SORTED_KEYS = sorted(_ITEM_SHELF_LIFE.keys(), key=len, reverse=True)

# Load non-pantry keywords — these items don't expire
_grocery_path = os.path.join(os.path.dirname(__file__), "data", "grocery_categories.json")
with open(_grocery_path, "r") as _gf:
    _NON_PANTRY_KEYWORDS = json.load(_gf).get("non_pantry", [])


def _is_non_pantry(name: str) -> bool:
    """Return True if the item is a non-food household item that doesn't expire."""
    name_lower = name.lower().strip()
    for keyword in _NON_PANTRY_KEYWORDS:
        # Bidirectional check: "trash bags" in "tall trash bags" OR vice-versa
        if keyword in name_lower or name_lower in keyword:
            return True
    return False


def _estimate_days(name: str, category: str | None) -> int:
    """Return estimated shelf life in days for a given item name + category."""
    lower_name = name.lower().strip()

    # 1. Exact match
    if lower_name in _ITEM_SHELF_LIFE:
        return _ITEM_SHELF_LIFE[lower_name]

    # 2. Substring match (longest key first)
    for key in _SORTED_KEYS:
        if key in lower_name:
            return _ITEM_SHELF_LIFE[key]

    # 3. Category fallback
    if category and category in _CATEGORY_DEFAULTS:
        return _CATEGORY_DEFAULTS[category]

    return _CATEGORY_DEFAULTS.get("Other", 30)


def predict_expiration(name: str, category: str | None = None, purchase_date: str | None = None) -> str | None:
    """Return a predicted expiration date string (YYYY-MM-DD), or None for non-food items.

    Args:
        name: Item name (e.g. "organic chicken breast")
        category: Pantry category (e.g. "Meat & Seafood")
        purchase_date: ISO date string for when the item was purchased.
                       Defaults to today if not provided.
    """
    if _is_non_pantry(name):
        return None

    days = _estimate_days(name, category)

    if purchase_date:
        try:
            base = datetime.strptime(purchase_date, "%Y-%m-%d").date()
        except ValueError:
            base = datetime.now().date()
    else:
        base = datetime.now().date()

    return (base + timedelta(days=days)).strftime("%Y-%m-%d")
