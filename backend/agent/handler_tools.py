"""Tool implementations that wrap existing handlers."""
import logging

from config import supabase
from services.expense_persist import persist_expense
from handlers import (
    handle_pantry_query, handle_expense_query, handle_budget_query,
    handle_reminder_check, handle_recall_past_meal,
    handle_pantry_add, handle_pantry_remove, handle_cooking_deduct,
    handle_shopping_list_add, handle_shopping_list_remove,
    handle_meal_suggestion, handle_meal_plan_week, handle_budget_meal,
    handle_suggestion, handle_budget_set, handle_mark_subscription,
    handle_expense_delete, handle_shopping_clear, handle_share_list,
)
from agent.tools import ToolDef, ToolResult, register

logger = logging.getLogger(__name__)


def _spec(name, description, properties=None, required=None):
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object",
                       "properties": properties or {},
                       "required": required or []}}}


# --- read_pantry ---------------------------------------------------------
async def _read_pantry(user_id, args, message):
    sub = args.get("filter") or "list_all"
    data = await handle_pantry_query(user_id, sub, args)
    return ToolResult(data=data, summary="Read pantry")

register(ToolDef(
    name="read_pantry",
    spec=_spec("read_pantry",
               "Read the user's pantry/inventory. Use before suggesting recipes or shopping.",
               {"filter": {"type": "string",
                           "enum": ["list_all", "low_stock", "out_of_stock", "expiring", "item_quantity"],
                           "description": "What to read"},
                "item_name": {"type": "string", "description": "Specific item, if filter=item_quantity"}}),
    fn=_read_pantry, policy="none"))


# --- read_expenses -------------------------------------------------------
async def _read_expenses(user_id, args, message):
    sub = args.get("sub_intent") or "total_spending"
    data = await handle_expense_query(user_id, sub, args)
    return ToolResult(data=data, summary="Read expenses")

register(ToolDef(
    name="read_expenses",
    spec=_spec("read_expenses",
               "Read/aggregate the user's spending.",
               {"sub_intent": {"type": "string",
                               "enum": ["total_spending", "by_category", "by_store", "by_date_range", "spending_comparison"]},
                "time_period": {"type": "string", "description": "today, this week, this month, this year"},
                "category": {"type": "string"}, "store": {"type": "string"}}),
    fn=_read_expenses, policy="none"))


# --- read_budgets --------------------------------------------------------
async def _read_budgets(user_id, args, message):
    data = await handle_budget_query(user_id, None, args)
    return ToolResult(data=data, summary="Read budgets")

register(ToolDef(
    name="read_budgets",
    spec=_spec("read_budgets", "Read the user's budgets and remaining amounts."),
    fn=_read_budgets, policy="none"))


# --- read_shopping_list --------------------------------------------------
async def _read_shopping_list(user_id, args, message):
    items = []
    if supabase is not None:
        resp = (supabase.table("shopping_list").select("*")
                .eq("user_id", user_id).execute())
        items = resp.data or []
    return ToolResult(data={"items": items}, summary="Read shopping list")

register(ToolDef(
    name="read_shopping_list",
    spec=_spec("read_shopping_list", "Read the user's shopping list."),
    fn=_read_shopping_list, policy="none"))


# --- check_reminder ------------------------------------------------------
async def _check_reminder(user_id, args, message):
    data = await handle_reminder_check(user_id, args, message or args.get("item_name", ""))
    return ToolResult(data=data, summary="Checked reminder")

register(ToolDef(
    name="check_reminder",
    spec=_spec("check_reminder", "Check a specific item's expiration/status.",
               {"item_name": {"type": "string"}}, ["item_name"]),
    fn=_check_reminder, policy="none"))


# --- recall_meal ---------------------------------------------------------
async def _recall_meal(user_id, args, message):
    data = await handle_recall_past_meal(user_id, "find_meal", args, message or args.get("query", ""))
    return ToolResult(data=data, summary="Recalled past meal")

register(ToolDef(
    name="recall_meal",
    spec=_spec("recall_meal", "Recall/look up a previously cooked meal.",
               {"query": {"type": "string", "description": "What the user is recalling"}}),
    fn=_recall_meal, policy="none"))


# --- add_pantry_items ----------------------------------------------------
async def _add_pantry_items(user_id, args, message):
    entities = {"pantry_items": args.get("items", [])}
    data = await handle_pantry_add(user_id, entities, message)
    return ToolResult(data=data, summary="Added pantry items", action_type="pantry_add")

register(ToolDef("add_pantry_items",
    _spec("add_pantry_items", "Add items the user already has to their pantry (no expense).",
          {"items": {"type": "array", "items": {"type": "string"}}}, ["items"]),
    _add_pantry_items, policy="none"))


# --- remove_pantry_items -------------------------------------------------
async def _remove_pantry_items(user_id, args, message):
    items = args.get("items", [])
    if not items:
        # Fall back: let the handler parse the item from the message
        data = await handle_pantry_remove(user_id, {}, message)
        summary = "Removed pantry item(s)"
        return ToolResult(data=data, summary=summary, action_type="pantry_remove")

    results = []
    total_removed = 0
    has_removed_count = False
    for item in items:
        result = await handle_pantry_remove(user_id, {"item_name": item}, message)
        results.append(result)
        if isinstance(result, dict) and "removed_count" in result:
            total_removed += result["removed_count"]
            has_removed_count = True

    aggregated = {"results": results}
    if has_removed_count:
        aggregated["removed_count"] = total_removed
        summary = f"Removed {total_removed} pantry item(s)"
    else:
        summary = f"Removed {len(items)} pantry item(s)"

    return ToolResult(data=aggregated, summary=summary, action_type="pantry_remove")

register(ToolDef("remove_pantry_items",
    _spec("remove_pantry_items", "Remove specific items from the pantry.",
          {"items": {"type": "array", "items": {"type": "string"}}}, ["items"]),
    _remove_pantry_items, policy="none"))


# --- add_to_shopping_list ------------------------------------------------
async def _add_to_shopping_list(user_id, args, message):
    entities = {"shopping_items": args.get("items", [])}
    data = await handle_shopping_list_add(user_id, entities, message)
    return ToolResult(data=data, summary="Added to shopping list", action_type="shopping_add")

register(ToolDef("add_to_shopping_list",
    _spec("add_to_shopping_list", "Add items to the shopping list for future purchase.",
          {"items": {"type": "array", "items": {"type": "string"}}}, ["items"]),
    _add_to_shopping_list, policy="none"))


# --- remove_from_shopping_list -------------------------------------------
async def _remove_from_shopping_list(user_id, args, message):
    entities = {"shopping_items": args.get("items", [])}
    data = await handle_shopping_list_remove(user_id, entities, message)
    return ToolResult(data=data, summary="Removed from shopping list", action_type="shopping_remove")

register(ToolDef("remove_from_shopping_list",
    _spec("remove_from_shopping_list", "Remove specific items from the shopping list.",
          {"items": {"type": "array", "items": {"type": "string"}}}, ["items"]),
    _remove_from_shopping_list, policy="none"))


# --- suggest_meals -------------------------------------------------------
async def _suggest_meals(user_id, args, message):
    entities = {"meal_type": args.get("meal_type")}
    data = await handle_meal_suggestion(user_id, "quick_meals", entities, message)
    return ToolResult(data=data, summary="Suggested meals", action_type="meal_suggestions")

register(ToolDef("suggest_meals",
    _spec("suggest_meals", "Suggest meals/recipes from what the user has.",
          {"meal_type": {"type": ["string", "null"],
                         "description": "optional: breakfast, lunch, dinner, or snack"}}),
    _suggest_meals, policy="none"))


# --- meal_plan_week ------------------------------------------------------
async def _meal_plan_week(user_id, args, message):
    data = await handle_meal_plan_week(user_id, args)
    return ToolResult(data=data, summary="Built a weekly meal plan", action_type="meal_plan")

register(ToolDef("meal_plan_week",
    _spec("meal_plan_week", "Build a full weekly meal plan."),
    _meal_plan_week, policy="none"))


# --- budget_meal ---------------------------------------------------------
async def _budget_meal(user_id, args, message):
    entities = {"price_limit": args.get("price_limit")}
    data = await handle_budget_meal(user_id, entities, message)
    return ToolResult(data=data, summary="Suggested budget meals", action_type="meal_suggestions")

register(ToolDef("budget_meal",
    _spec("budget_meal", "Suggest meals under a price limit.",
          {"price_limit": {"type": "number"}}, ["price_limit"]),
    _budget_meal, policy="none"))


# --- suggest_shopping ----------------------------------------------------
async def _suggest_shopping(user_id, args, message):
    data = await handle_suggestion(user_id, "shopping_list", args)
    return ToolResult(data=data, summary="Suggested shopping items", action_type="shopping_suggestions")

register(ToolDef("suggest_shopping",
    _spec("suggest_shopping", "Suggest what to buy based on what's running low."),
    _suggest_shopping, policy="none"))


# --- set_budget ----------------------------------------------------------
async def _set_budget(user_id, args, message):
    entities = {"budget_amount": args.get("amount"),
                "category": args.get("category"),
                "budget_month": args.get("month")}
    data = await handle_budget_set(user_id, entities, message)
    return ToolResult(data=data, summary="Set budget", action_type="budget_set")

register(ToolDef("set_budget",
    _spec("set_budget", "Set or update a spending budget for a category.",
          {"category": {"type": "string"}, "amount": {"type": "number"},
           "month": {"type": "string"}}, ["category", "amount"]),
    _set_budget, policy="none"))


# --- mark_recurring ------------------------------------------------------
async def _mark_recurring(user_id, args, message):
    data = await handle_mark_subscription(user_id, args)
    return ToolResult(data=data, summary="Marked as recurring", action_type="mark_recurring")

register(ToolDef("mark_recurring",
    _spec("mark_recurring", "Tag the most recent / referenced expense as recurring."),
    _mark_recurring, policy="none"))


# --- cook_deduct ---------------------------------------------------------
async def _cook_deduct(user_id, args, message):
    entities = {"recipe_name": args.get("recipe")}
    data = await handle_cooking_deduct(user_id, entities, message)
    return ToolResult(data=data, summary="Deducted recipe ingredients", action_type="cook_deduct")

register(ToolDef("cook_deduct",
    _spec("cook_deduct", "Deduct a recipe's ingredients from the pantry (user is cooking now).",
          {"recipe": {"type": "string"}}, ["recipe"]),
    _cook_deduct, policy="none"))


# --- log_expense ---------------------------------------------------------
async def _log_expense(user_id, args, message):
    saved = persist_expense(
        user_id,
        store=args.get("store", "Unknown Store"),
        amount=args.get("amount"),
        items=args.get("items", ""),
        category=args.get("category", "Other"),
        date=args.get("date"),
        is_recurring=bool(args.get("recurring", False)),
        recurring_interval=args.get("recurring_interval"),
        recurring_unit=args.get("recurring_unit"),
    )
    amt = saved.get("amount")
    summary = f"Logged ${amt} at {saved.get('store')}" if amt is not None else f"Logged expense at {saved.get('store')}"
    return ToolResult(data=saved, summary=summary, action_type="expense_logged")

register(ToolDef("log_expense",
    _spec("log_expense", "Log a NEW expense the user reports having spent.",
          {"store": {"type": "string"}, "amount": {"type": "number"},
           "items": {"type": "string", "description": "comma-separated item names"},
           "category": {"type": "string"},
           "date": {"type": "string", "description": "YYYY-MM-DD"},
           "recurring": {"type": "boolean", "description": "true if this repeats (subscription, rent, etc.)"},
           "recurring_interval": {"type": "number", "description": "interval count, e.g. 1 or 2 (only if recurring)"},
           "recurring_unit": {"type": "string", "enum": ["days", "weeks", "months", "years"],
                              "description": "interval unit (only if recurring)"}},
          ["store", "amount"]),
    _log_expense, policy="threshold", threshold_field="amount", threshold=100.0))


# --- delete_expense (confirm) -------------------------------------------
async def _delete_expense(user_id, args, message):
    entities = {"delete_item_name": args.get("ref"), "delete_amount": args.get("amount")}
    data = await handle_expense_delete(user_id, entities, message or args.get("ref", ""))
    return ToolResult(data=data, summary="Deleted expense", action_type="expense_deleted")

register(ToolDef("delete_expense",
    _spec("delete_expense", "Delete an existing expense the user referenced.",
          {"ref": {"type": "string", "description": "store/description of the expense"},
           "amount": {"type": "number"}}),
    _delete_expense, policy="always"))


# --- clear_shopping_list (confirm) --------------------------------------
async def _clear_shopping_list(user_id, args, message):
    data = await handle_shopping_clear(user_id)
    return ToolResult(data=data, summary="Cleared shopping list", action_type="shopping_cleared")

register(ToolDef("clear_shopping_list",
    _spec("clear_shopping_list", "Remove ALL items from the shopping list."),
    _clear_shopping_list, policy="always"))


# --- share_list (confirm) -----------------------------------------------
async def _share_list(user_id, args, message):
    entities = {"share_target": args.get("target")}
    data = await handle_share_list(user_id, entities, message or "")
    return ToolResult(data=data, summary=f"Shared list with {args.get('target', 'them')}",
                      action_type="list_shared")

register(ToolDef("share_list",
    _spec("share_list", "Share the shopping list with another person.",
          {"target": {"type": "string", "description": "name or email"}}, ["target"]),
    _share_list, policy="always"))
