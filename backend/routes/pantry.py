"""Pantry item CRUD, auto-population, and maintenance routes.

  GET    /pantry                — List pantry items with filters (category,
         stock status, search, expiring-within-N-days) and optional pagination.
  POST   /pantry                — Create a pantry item. Merges quantity if an
         item with the same name already exists.
  POST   /pantry/from-expense   — Auto-populate pantry from a grocery expense.
         Predicts expiration dates via shelf_life module.
  PUT    /pantry/{id}           — Update a pantry item's fields.
  PUT    /pantry/{id}/status    — Quick stock-status toggle (full/low/out).
  DELETE /pantry/{id}           — Delete a single pantry item.
  DELETE /pantry/bulk           — Bulk-delete pantry items by ID list.
  GET    /pantry/stats          — Summary stats: counts by status, expiring
         within 7 days, and breakdown by category.
  POST   /pantry/resync         — Full resync: re-categorizes, deduplicates,
         and refreshes all predicted expiration dates.
"""

# ============================================================================
# PANTRY ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta
from typing import Optional

import math as pantry_math

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import (
    PantryItemCreate,
    PantryItemUpdate,
    BulkPantryDeleteRequest,
    AutoPopulatePantryRequest
)
from shelf_life import predict_expiration
from spell_check import correct_item_name
from routes.pantry_sharing import verify_pantry_group_membership

router = APIRouter()

# Unit words that may appear as a prefix in item names from expense extraction.
# e.g. "bottle of chipotle sauce" or "Bottled Chipotle Sauce"
import re as _re
_UNIT_WORDS = (
    r"lbs?|oz|kg|g|gallons?|gal|liters?|bags?|boxes?|cans?|bottles?|packs?|"
    r"cartons?|jars?|pieces?|pcs?|dozen|bunch(?:es)?|loaf|loaves|slices?|"
    r"cups?|pints?|quarts?|tubs?|rolls?|sticks?|bars?|containers?"
)
_UNIT_PREFIX_RE = _re.compile(
    rf"^({_UNIT_WORDS})\s+(?:of\s+)?(.+)$", _re.IGNORECASE
)
_ADJECTIVE_UNIT_RE = _re.compile(
    r"^(bottled|canned|boxed|bagged|jarred|sliced|packed)\s+(.+)$", _re.IGNORECASE
)
_ADJECTIVE_TO_UNIT = {
    "bottled": "bottle", "canned": "can", "boxed": "box", "bagged": "bag",
    "jarred": "jar", "sliced": "slice", "packed": "pack",
}


def _normalize_item_name(name: str, unit: Optional[str] = None) -> tuple[str, Optional[str], Optional[int]]:
    """Strip unit prefixes from item names, returning (clean_name, unit, quantity).

    Examples:
      "Bottle of Chipotle Sauce" → ("Chipotle Sauce", "bottle", 1)
      "Bottled Chipotle Sauce"   → ("Chipotle Sauce", "bottle", 1)
      "2 lbs chicken"            → ("chicken", "lbs", 2)
      "Chipotle Sauce"           → ("Chipotle Sauce", None, None)
    """
    trimmed = name.strip()

    # Pattern: leading number + unit -- "2 lbs chicken"
    num_unit_match = _re.match(
        rf"^(\d+(?:\.\d+)?)\s+({_UNIT_WORDS})\s+(?:of\s+)?(.+)$", trimmed, _re.IGNORECASE
    )
    if num_unit_match:
        raw = float(num_unit_match.group(1))
        qty = int(raw) if raw == int(raw) else raw
        return num_unit_match.group(3).strip(), num_unit_match.group(2).lower(), qty

    # Pattern: adjective form -- "Bottled Chipotle Sauce"
    adj_match = _ADJECTIVE_UNIT_RE.match(trimmed)
    if adj_match:
        u = _ADJECTIVE_TO_UNIT.get(adj_match.group(1).lower(), adj_match.group(1).lower())
        return adj_match.group(2).strip(), u, 1

    # Pattern: unit prefix without number -- "bottle of chipotle sauce"
    prefix_match = _UNIT_PREFIX_RE.match(trimmed)
    if prefix_match:
        return prefix_match.group(2).strip(), prefix_match.group(1).lower(), 1

    return trimmed, unit, None


def _can_access_item(current_user_id: str, item_owner_id: str) -> bool:
    """Check if current user can access an item: either they own it,
    or they are a member of a pantry group owned by the item's owner."""
    if current_user_id == item_owner_id:
        return True
    # Check if the item owner has a pantry group that current_user is a member of
    owner_groups = supabase.table("pantry_groups").select("id").eq("owner_id", item_owner_id).execute()
    if not owner_groups.data:
        return False
    group_ids = [g["id"] for g in owner_groups.data]
    for gid in group_ids:
        if verify_pantry_group_membership(current_user_id, gid):
            return True
    return False


def _find_existing_pantry_item(user_id: str, item_name: str):
    """Find an existing pantry item by name (case-insensitive) for the user."""
    response = supabase.table("pantry_items").select("*")\
        .eq("user_id", user_id)\
        .ilike("name", item_name.strip())\
        .limit(1)\
        .execute()
    return response.data[0] if response.data else None


def _merge_pantry_item(existing, add_quantity: float, purchase_date: str = None):
    """Merge a new quantity into an existing pantry item, updating stock status."""
    existing_qty = existing.get("quantity")
    existing_qty = existing_qty if existing_qty is not None else 1
    add_qty = add_quantity if add_quantity is not None else 1
    new_qty = existing_qty + add_qty
    update_data = {
        "quantity": new_qty,
        "stock_status": "full",
        "updated_at": datetime.now().isoformat(),
    }
    if purchase_date:
        update_data["purchase_date"] = purchase_date

    supabase.table("pantry_items").update(update_data)\
        .eq("id", existing["id"]).execute()

    return {**existing, **update_data}


@router.get("/pantry")
@limiter.limit("60/minute")
async def get_pantry_items(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    category: Optional[str] = None,
    stock_status: Optional[str] = None,
    search: Optional[str] = None,
    expiring_within_days: Optional[int] = None,
    sort_by: Optional[str] = "name",
    sort_order: Optional[str] = "asc",
    page: int = 1,
    page_size: int = 20,
    paginate: bool = False,
    group_id: Optional[int] = None
):
    """Get pantry items for the current user with filtering, sorting, and optional pagination"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # When group_id is provided, verify membership and show the group owner's items
    target_user_id = current_user["id"]
    if group_id is not None:
        if not verify_pantry_group_membership(current_user["id"], group_id):
            raise HTTPException(status_code=403, detail="Not a member of this pantry group")
        # Fetch the group owner's user_id — members see the owner's pantry
        group_resp = supabase.table("pantry_groups").select("owner_id").eq("id", group_id).execute()
        if group_resp.data:
            target_user_id = group_resp.data[0]["owner_id"]

    if paginate:
        query = supabase.table("pantry_items").select("*", count="exact")
    else:
        query = supabase.table("pantry_items").select("*")

    query = query.eq("user_id", target_user_id)

    if category:
        query = query.eq("category", category)

    if stock_status:
        query = query.eq("stock_status", stock_status)

    if search:
        query = query.or_(f"name.ilike.%{search}%,category.ilike.%{search}%,notes.ilike.%{search}%")

    valid_sort_fields = {"name", "category", "expiration_date", "purchase_date", "stock_status", "created_at"}
    sort_field = sort_by if sort_by in valid_sort_fields else "name"
    query = query.order(sort_field, desc=(sort_order.lower() == "desc"))

    # When filtering by expiring_within_days, apply to the FULL dataset first
    # so pagination reflects the filtered count (not all items).
    if expiring_within_days is not None:
        today = datetime.now().date()
        future_date = (today + timedelta(days=expiring_within_days)).date()
        # Fetch all items (no pagination yet) and filter client-side
        response = query.execute()
        all_items = response.data if response.data else []
        items = []
        for item in all_items:
            if item.get("expiration_date"):
                try:
                    exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                    # Only include items expiring in the future window, NOT already expired
                    if today <= exp_date <= future_date:
                        items.append(item)
                except (ValueError, TypeError):
                    pass

        if paginate:
            total_count = len(items)
            total_pages = pantry_math.ceil(total_count / page_size) if page_size > 0 else 1
            start = (page - 1) * page_size
            end = start + page_size
            return {
                "items": items[start:end],
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1,
            }
        return {"items": items, "count": len(items)}

    if paginate:
        start = (page - 1) * page_size
        end = start + page_size - 1
        query = query.range(start, end)

    response = query.execute()
    items = response.data if response.data else []

    if paginate:
        total_count = response.count if response.count is not None else len(items)
        total_pages = pantry_math.ceil(total_count / page_size) if page_size > 0 else 1
        return {
            "items": items,
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        }

    return {"items": items, "count": len(items)}

@router.post("/pantry")
@limiter.limit("30/minute")
async def create_pantry_item(
    request: Request,
    item: PantryItemCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new pantry item, or merge quantity if it already exists."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Normalize unit prefixes out of the name
    item_name = item.name
    item_unit = item.unit
    item_qty = item.quantity
    clean_name, parsed_unit, parsed_qty = _normalize_item_name(item_name, item_unit)
    if clean_name != item_name:
        item_name = clean_name
        if parsed_unit and not item_unit:
            item_unit = parsed_unit
        if parsed_qty is not None and (item_qty is None or item_qty == 1):
            item_qty = parsed_qty

    purchase = item.purchase_date or datetime.now().strftime("%Y-%m-%d")

    # Check for existing item with same name — merge instead of duplicating
    existing = _find_existing_pantry_item(current_user["id"], item_name)
    if existing:
        merged = _merge_pantry_item(existing, item_qty or 1, purchase)
        return {
            "message": f"Updated quantity for {item_name}",
            "merged": True,
            **merged
        }

    now = datetime.now().isoformat()

    expiration_date = item.expiration_date
    expiration_predicted = False
    if not expiration_date:
        expiration_date = predict_expiration(item_name, item.category, purchase)
        expiration_predicted = expiration_date is not None

    response = supabase.table("pantry_items").insert({
        "user_id": current_user["id"],
        "name": item_name,
        "quantity": item_qty or 1,
        "unit": item_unit,
        "category": item.category or "Other",
        "expiration_date": expiration_date,
        "purchase_date": purchase,
        "stock_status": item.stock_status or "full",
        "notes": item.notes,
        "expiration_predicted": expiration_predicted,
        "created_at": now,
        "updated_at": now
    }).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to create pantry item")

    return {
        "message": "Pantry item created successfully",
        "merged": False,
        **response.data[0]
    }

@router.post("/pantry/from-expense")
@limiter.limit("20/minute")
async def auto_populate_pantry_from_expense(
    request: Request,
    populate_request: AutoPopulatePantryRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Auto-populate pantry from a grocery expense"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Verify expense belongs to user
    expense_response = supabase.table("expenses").select("*").eq("id", populate_request.expense_id).eq("user_id", current_user["id"]).execute()
    if not expense_response.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    expense = expense_response.data[0]
    now = datetime.now().isoformat()
    created_items = []

    merged_count = 0
    corrected_count = 0
    for item_data in populate_request.items:
        item_name = item_data.get("name", "Unknown Item")
        item_category = item_data.get("category", "Other")
        item_expiration = item_data.get("expiration_date")
        item_purchase = expense.get("date")
        item_qty = item_data.get("quantity", 1)
        item_unit = item_data.get("unit")

        # Strip unit prefixes from name (e.g. "Bottle of Chipotle Sauce" → "Chipotle Sauce")
        clean_name, parsed_unit, parsed_qty = _normalize_item_name(item_name, item_unit)
        if clean_name != item_name:
            item_name = clean_name
            if parsed_unit and not item_unit:
                item_unit = parsed_unit
            if parsed_qty is not None and item_qty in (1, None):
                item_qty = parsed_qty

        # Spell-correct item name before lookup (fixes OCR typos)
        correction = correct_item_name(item_name)
        if correction["corrected"]:
            item_name = correction["name"]
            corrected_count += 1

        # Check for existing item — merge instead of duplicating
        existing = _find_existing_pantry_item(current_user["id"], item_name)
        if existing:
            merged = _merge_pantry_item(existing, item_qty, item_purchase)
            created_items.append(merged)
            merged_count += 1
            continue

        exp_predicted = False
        if not item_expiration:
            item_expiration = predict_expiration(item_name, item_category, item_purchase)
            exp_predicted = item_expiration is not None

        response = supabase.table("pantry_items").insert({
            "user_id": current_user["id"],
            "name": item_name,
            "quantity": item_qty,
            "unit": item_unit,
            "category": item_category,
            "expiration_date": item_expiration,
            "purchase_date": item_purchase,
            "stock_status": "full",
            "notes": f"Auto-added from {expense.get('store', 'Unknown Store')}",
            "source_expense_id": populate_request.expense_id,
            "expiration_predicted": exp_predicted,
            "created_at": now,
            "updated_at": now
        }).execute()

        if response.data:
            created_items.append(response.data[0])

    new_count = len(created_items) - merged_count
    parts = []
    if new_count > 0:
        parts.append(f"{new_count} new")
    if merged_count > 0:
        parts.append(f"{merged_count} updated")

    return {
        "message": f"{' and '.join(parts)} item(s) added to pantry",
        "items": created_items
    }

@router.post("/pantry/store-trip")
@limiter.limit("20/minute")
async def confirm_store_trip(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Confirm a store trip: add items to pantry and optionally log an expense."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    body = await request.json()
    items = body.get("items", [])
    store = body.get("store", "Store")
    amount = body.get("amount")  # optional

    user_id = current_user["id"]
    now = datetime.now().isoformat()
    today_str = datetime.now().strftime("%Y-%m-%d")

    # Deduplicate items within the batch first (merge same-name items)
    merged_items: dict[str, dict] = {}
    for item_data in items:
        item_name = item_data.get("name", "").strip()
        if not item_name:
            continue
        key = item_name.lower()
        if key in merged_items:
            merged_items[key]["quantity"] += item_data.get("quantity", 1)
        else:
            merged_items[key] = {
                "name": item_name,
                "quantity": item_data.get("quantity", 1),
                "unit": item_data.get("unit"),
                "category": item_data.get("category", "Other"),
            }

    created_items = []
    for item_data in merged_items.values():
        item_name = item_data["name"]
        item_qty = item_data["quantity"]
        item_unit = item_data["unit"]
        item_category = item_data["category"]

        # Check for existing item and merge if found
        existing = _find_existing_pantry_item(user_id, item_name)
        if existing:
            _merge_pantry_item(existing, item_qty, today_str)
            created_items.append({**existing, "quantity": existing.get("quantity", 1) + item_qty})
        else:
            resp = supabase.table("pantry_items").insert({
                "user_id": user_id,
                "name": item_name,
                "quantity": item_qty,
                "unit": item_unit,
                "category": item_category,
                "expiration_date": None,
                "purchase_date": today_str,
                "stock_status": "full",
                "notes": f"Added from {store} trip",
                "created_at": now,
                "updated_at": now
            }).execute()
            if resp.data:
                created_items.append(resp.data[0])

    # Optionally log an expense if the user entered an amount
    expense_id = None
    if amount is not None and amount > 0:
        item_names_str = ", ".join(i.get("name", "") for i in items if i.get("name"))
        expense_resp = supabase.table("expenses").insert({
            "user_id": user_id,
            "store": store,
            "items": item_names_str,
            "category": "Groceries",
            "amount": amount,
            "date": today_str,
            "created_at": now,
        }).execute()
        if expense_resp.data:
            expense_id = expense_resp.data[0]["id"]

    return {
        "message": f"Added {len(created_items)} item(s) to pantry",
        "items": created_items,
        "expense_id": expense_id,
    }


@router.put("/pantry/{item_id}")
@limiter.limit("30/minute")
async def update_pantry_item(
    request: Request,
    item_id: int,
    item_update: PantryItemUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update a pantry item"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Verify the user owns the item or is a group member of the owner's pantry
    check_response = supabase.table("pantry_items").select("id, user_id").eq("id", item_id).execute()
    if not check_response.data:
        raise HTTPException(status_code=404, detail="Pantry item not found")
    if not _can_access_item(current_user["id"], check_response.data[0]["user_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = {}
    if item_update.name is not None:
        update_data["name"] = item_update.name
    if item_update.quantity is not None:
        update_data["quantity"] = item_update.quantity
    if item_update.unit is not None:
        update_data["unit"] = item_update.unit
    if item_update.category is not None:
        update_data["category"] = item_update.category
    if item_update.expiration_date is not None:
        update_data["expiration_date"] = item_update.expiration_date if item_update.expiration_date else None
        # Clear predicted flag when user manually sets an expiration date
        if item_update.expiration_predicted is None:
            update_data["expiration_predicted"] = False
    if item_update.purchase_date is not None:
        update_data["purchase_date"] = item_update.purchase_date if item_update.purchase_date else None
    if item_update.stock_status is not None:
        update_data["stock_status"] = item_update.stock_status
    if item_update.notes is not None:
        update_data["notes"] = item_update.notes
    if item_update.expiration_predicted is not None:
        update_data["expiration_predicted"] = item_update.expiration_predicted

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.now().isoformat()

    supabase.table("pantry_items").update(update_data).eq("id", item_id).execute()

    return {"message": "Pantry item updated successfully"}

@router.put("/pantry/{item_id}/status")
@limiter.limit("60/minute")
async def update_pantry_item_status(
    request: Request,
    item_id: int,
    stock_status: str,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Quick update for stock status only"""
    if stock_status not in ["full", "low", "out_of_stock"]:
        raise HTTPException(status_code=400, detail="Invalid stock status. Must be: full, low, or out_of_stock")

    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    check_response = supabase.table("pantry_items").select("id, user_id").eq("id", item_id).execute()
    if not check_response.data:
        raise HTTPException(status_code=404, detail="Pantry item not found")
    if not _can_access_item(current_user["id"], check_response.data[0]["user_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    supabase.table("pantry_items").update({
        "stock_status": stock_status,
        "updated_at": datetime.now().isoformat()
    }).eq("id", item_id).execute()

    return {"message": f"Status updated to {stock_status}"}

# NOTE: /pantry/bulk MUST be registered before /pantry/{item_id} to avoid
# FastAPI treating "bulk" as an int path parameter and returning 422.
@router.delete("/pantry/bulk")
@limiter.limit("10/minute")
async def delete_pantry_items_bulk(
    request: Request,
    bulk_request: BulkPantryDeleteRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete multiple pantry items"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("pantry_items").delete()\
        .in_("id", bulk_request.item_ids)\
        .eq("user_id", current_user["id"])\
        .execute()

    deleted_count = len(response.data) if response.data else 0
    return {"message": f"{deleted_count} item(s) deleted successfully", "deleted_count": deleted_count}

@router.delete("/pantry/{item_id}")
@limiter.limit("30/minute")
async def delete_pantry_item(
    request: Request,
    item_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a single pantry item"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    check_response = supabase.table("pantry_items").select("id, user_id").eq("id", item_id).execute()
    if not check_response.data:
        raise HTTPException(status_code=404, detail="Pantry item not found")
    if not _can_access_item(current_user["id"], check_response.data[0]["user_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    response = supabase.table("pantry_items").delete().eq("id", item_id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Pantry item not found")

    return {"message": "Pantry item deleted successfully"}

@router.get("/pantry/stats")
@limiter.limit("30/minute")
async def get_pantry_stats(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    group_id: Optional[int] = None
):
    """Get pantry statistics"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    target_user_id = current_user["id"]
    if group_id is not None:
        if not verify_pantry_group_membership(current_user["id"], group_id):
            raise HTTPException(status_code=403, detail="Not a member of this pantry group")
        group_resp = supabase.table("pantry_groups").select("owner_id").eq("id", group_id).execute()
        if group_resp.data:
            target_user_id = group_resp.data[0]["owner_id"]

    response = supabase.table("pantry_items").select("*").eq("user_id", target_user_id).execute()
    items = response.data if response.data else []

    total_items = len(items)
    full_stock = sum(1 for item in items if item.get("stock_status") == "full")
    low_stock = sum(1 for item in items if item.get("stock_status") == "low")
    out_of_stock = sum(1 for item in items if item.get("stock_status") == "out_of_stock")

    # Items expiring within 7 days
    today = datetime.now().date()
    week_from_now = today + timedelta(days=7)
    expiring_soon = 0
    for item in items:
        if item.get("expiration_date"):
            try:
                exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                if today <= exp_date <= week_from_now:
                    expiring_soon += 1
            except:
                pass

    # Items by category
    by_category = {}
    for item in items:
        cat = item.get("category", "Other")
        by_category[cat] = by_category.get(cat, 0) + 1

    return {
        "total_items": total_items,
        "full_stock": full_stock,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "expiring_soon": expiring_soon,
        "by_category": by_category
    }


@router.post("/pantry/seed-demo")
@limiter.limit("5/minute")
async def seed_demo_pantry(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Bulk-insert demo pantry items for new users. Idempotent — skips if user already has items."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Check if user already has pantry items — return early if so
    existing = supabase.table("pantry_items").select("id").eq("user_id", current_user["id"]).limit(1).execute()
    if existing.data:
        return {"message": "Pantry already has items, skipping demo seed", "seeded": False}

    today = datetime.now().strftime("%Y-%m-%d")
    now = datetime.now().isoformat()
    user_id = current_user["id"]

    demo_items = [
        # Produce — staggered expiration for realistic alerts
        {"name": "Bananas", "quantity": 2, "category": "Produce", "expiration_date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")},
        {"name": "Spinach", "quantity": 1, "unit": "bag", "category": "Produce", "expiration_date": (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")},
        {"name": "Carrots", "quantity": 6, "category": "Produce"},
        {"name": "Bell Peppers", "quantity": 3, "category": "Produce"},
        {"name": "Onions", "quantity": 4, "category": "Produce"},
        {"name": "Tomatoes", "quantity": 3, "category": "Produce", "expiration_date": (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")},
        # Dairy
        {"name": "Milk", "quantity": 1, "unit": "gal", "category": "Dairy", "stock_status": "low"},
        {"name": "Eggs", "quantity": 12, "category": "Dairy"},
        {"name": "Greek Yogurt", "quantity": 2, "category": "Dairy"},
        {"name": "Cheddar Cheese", "quantity": 1, "unit": "block", "category": "Dairy"},
        # Meat & Seafood
        {"name": "Chicken Breast", "quantity": 2, "unit": "lbs", "category": "Meat & Seafood", "expiration_date": (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")},
        {"name": "Ground Beef", "quantity": 1, "unit": "lb", "category": "Meat & Seafood", "expiration_date": (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")},
        # Grains & Pasta
        {"name": "Rice", "quantity": 2, "unit": "lbs", "category": "Grains & Pasta"},
        {"name": "Pasta", "quantity": 1, "unit": "box", "category": "Grains & Pasta"},
        {"name": "Bread", "quantity": 1, "unit": "loaf", "category": "Grains & Pasta", "expiration_date": (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")},
        # Condiments
        {"name": "Olive Oil", "quantity": 1, "unit": "bottle", "category": "Condiments"},
        {"name": "Soy Sauce", "quantity": 1, "unit": "bottle", "category": "Condiments"},
        # Frozen
        {"name": "Frozen Broccoli", "quantity": 1, "unit": "bag", "category": "Frozen"},
        # Snacks
        {"name": "Granola Bars", "quantity": 6, "category": "Snacks"},
    ]

    created_items = []
    for item in demo_items:
        expiration_date = item.get("expiration_date")
        expiration_predicted = False
        if not expiration_date:
            expiration_date = predict_expiration(item["name"], item["category"], today)
            expiration_predicted = expiration_date is not None

        row = {
            "user_id": user_id,
            "name": item["name"],
            "quantity": item.get("quantity", 1),
            "unit": item.get("unit"),
            "category": item["category"],
            "expiration_date": expiration_date,
            "purchase_date": today,
            "stock_status": item.get("stock_status", "full"),
            "notes": "Demo item",
            "expiration_predicted": expiration_predicted,
            "created_at": now,
            "updated_at": now,
        }
        response = supabase.table("pantry_items").insert(row).execute()
        if response.data:
            created_items.append(response.data[0])

    return {
        "message": f"Seeded {len(created_items)} demo pantry items",
        "seeded": True,
        "count": len(created_items),
    }


@router.post("/pantry/resync")
@limiter.limit("10/minute")
async def resync_pantry(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Full pantry resync: re-categorize, deduplicate, and refresh dates.

    1. Re-categorize — update each item's category from current detection logic.
    2. Deduplicate — merge items with the same (lowercased) name, summing quantities.
    3. Refresh dates — backfill missing purchase/expiration dates and recalculate
       all predicted expirations (shelf life data may have been updated).
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    from shelf_life import _is_non_pantry
    from handlers.pantry_handler import categorize_pantry_item

    response = supabase.table("pantry_items").select("*").eq("user_id", current_user["id"]).execute()
    items = response.data if response.data else []

    recategorized = 0
    merged = 0
    purchase_filled = 0
    expiration_filled = 0
    expiration_cleared = 0
    name_corrected = 0
    now_iso = datetime.now().isoformat()

    # --- Pass 0: Spell-correct item names ---
    for item in items:
        correction = correct_item_name(item["name"])
        if correction["corrected"]:
            supabase.table("pantry_items").update({
                "name": correction["name"],
                "updated_at": now_iso,
            }).eq("id", item["id"]).execute()
            item["name"] = correction["name"]
            name_corrected += 1

    # --- Pass 1: Deduplicate (group by lowercase name, merge quantities) ---
    # Track original quantities so we can detect changes after merging
    original_quantities: dict[int, float] = {item["id"]: (item.get("quantity") or 1) for item in items}
    canonical: dict[str, dict] = {}
    delete_ids: list[str] = []
    for item in items:
        key = item["name"].lower().strip()
        if key not in canonical:
            canonical[key] = item
        else:
            # Merge quantity into canonical, mark duplicate for deletion
            merged += 1
            canonical[key]["quantity"] = (canonical[key].get("quantity") or 1) + (item.get("quantity") or 1)
            delete_ids.append(item["id"])

    # Delete duplicates
    for did in delete_ids:
        supabase.table("pantry_items").delete().eq("id", did).execute()

    # --- Pass 2: Re-categorize + refresh dates on canonical items ---
    for item in canonical.values():
        update_data = {}
        is_non_food = _is_non_pantry(item["name"])
        is_preexisting = "pre-existing" in (item.get("notes") or "")

        # Re-categorize
        detected = categorize_pantry_item(item["name"])
        if detected != "Other" and detected != item.get("category"):
            update_data["category"] = detected
            recategorized += 1

        # Persist merged quantity if this item absorbed duplicates
        orig_qty = original_quantities.get(item["id"])
        if orig_qty is not None and item.get("quantity") != orig_qty:
            update_data["quantity"] = item["quantity"]

        # Backfill purchase_date
        if not item.get("purchase_date") and not is_preexisting:
            created = item.get("created_at")
            if created:
                try:
                    update_data["purchase_date"] = datetime.fromisoformat(created.replace("Z", "+00:00")).strftime("%Y-%m-%d")
                except Exception:
                    update_data["purchase_date"] = datetime.now().strftime("%Y-%m-%d")
            else:
                update_data["purchase_date"] = datetime.now().strftime("%Y-%m-%d")
            purchase_filled += 1

        # Refresh expiration dates
        if is_non_food and item.get("expiration_date"):
            update_data["expiration_date"] = None
            update_data["expiration_predicted"] = False
            expiration_cleared += 1
        elif not is_non_food and item.get("expiration_predicted"):
            purchase = update_data.get("purchase_date") or item.get("purchase_date") or datetime.now().strftime("%Y-%m-%d")
            category = update_data.get("category") or item.get("category")
            predicted = predict_expiration(item["name"], category, purchase)
            if predicted and predicted != item.get("expiration_date"):
                update_data["expiration_date"] = predicted
                expiration_filled += 1
        elif not is_non_food and not item.get("expiration_date") and not is_preexisting:
            purchase = update_data.get("purchase_date") or item.get("purchase_date") or datetime.now().strftime("%Y-%m-%d")
            category = update_data.get("category") or item.get("category")
            predicted = predict_expiration(item["name"], category, purchase)
            if predicted:
                update_data["expiration_date"] = predicted
                update_data["expiration_predicted"] = True
                expiration_filled += 1

        if update_data:
            update_data["updated_at"] = now_iso
            supabase.table("pantry_items").update(update_data).eq("id", item["id"]).execute()

    return {
        "message": "Pantry resync complete",
        "name_corrected": name_corrected,
        "recategorized": recategorized,
        "merged": merged,
        "purchase_filled": purchase_filled,
        "expiration_filled": expiration_filled,
        "expiration_cleared": expiration_cleared
    }
