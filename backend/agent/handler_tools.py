"""Tool implementations that wrap existing handlers."""
import logging

from config import supabase
from handlers import (
    handle_pantry_query, handle_expense_query, handle_budget_query,
    handle_reminder_check, handle_recall_past_meal,
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
    data = await handle_reminder_check(user_id, args, message or args.get("item", ""))
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
