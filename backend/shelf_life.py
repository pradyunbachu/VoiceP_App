# ============================================================================
# SHELF LIFE PREDICTION UTILITY
# ============================================================================
import json
import os
from datetime import datetime, timedelta

_data_path = os.path.join(os.path.dirname(__file__), "data", "shelf_life.json")
with open(_data_path, "r") as _f:
    _shelf_life_data = json.load(_f)

_ITEM_SHELF_LIFE = _shelf_life_data["items"]
_CATEGORY_DEFAULTS = _shelf_life_data["category_defaults"]

# Pre-sort keys by length descending for longest-substring-first matching
_SORTED_KEYS = sorted(_ITEM_SHELF_LIFE.keys(), key=len, reverse=True)


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


def predict_expiration(name: str, category: str | None = None, purchase_date: str | None = None) -> str:
    """Return a predicted expiration date string (YYYY-MM-DD).

    Args:
        name: Item name (e.g. "organic chicken breast")
        category: Pantry category (e.g. "Meat & Seafood")
        purchase_date: ISO date string for when the item was purchased.
                       Defaults to today if not provided.
    """
    days = _estimate_days(name, category)

    if purchase_date:
        try:
            base = datetime.strptime(purchase_date, "%Y-%m-%d").date()
        except ValueError:
            base = datetime.now().date()
    else:
        base = datetime.now().date()

    return (base + timedelta(days=days)).strftime("%Y-%m-%d")
