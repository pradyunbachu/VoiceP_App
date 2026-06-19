"""Persist a structured expense (no LLM) — mirrors the extract-expense insert."""
from datetime import datetime

from config import supabase
from cache import api_cache


def persist_expense(user_id, *, store, amount, items="", category="Other",
                    date=None, is_recurring=False,
                    recurring_interval=None, recurring_unit=None):
    if supabase is None:
        raise RuntimeError("Database not configured")
    date = date or datetime.now().strftime("%Y-%m-%d")
    # Only carry interval/unit when the expense is actually recurring.
    interval = recurring_interval if is_recurring else None
    unit = recurring_unit if is_recurring else None
    resp = supabase.table("expenses").insert({
        "user_id": user_id,
        "store": store,
        "items": items or "",
        "category": category or "Other",
        "amount": amount,
        "date": date,
        "created_at": datetime.now().isoformat(),
        "is_recurring": 1 if is_recurring else 0,
        "recurring_interval": interval,
        "recurring_unit": unit,
    }).execute()
    if not resp.data:
        raise RuntimeError("Failed to save expense")
    saved = resp.data[0]
    api_cache.invalidate_prefix(f"analytics:{user_id}")
    api_cache.invalidate_prefix(f"insights:{user_id}")
    api_cache.invalidate_prefix(f"streak:{user_id}")
    return {"id": saved["id"], "store": store, "items": items or "",
            "category": category or "Other", "amount": amount, "date": date,
            "is_recurring": bool(is_recurring),
            "recurring_interval": interval, "recurring_unit": unit}
