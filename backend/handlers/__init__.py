# ============================================================================
# HANDLERS MODULE - Re-exports all handler functions
# ============================================================================
from handlers.intent import detect_intent, simple_intent_detection, detect_meal_type
from handlers.pantry_handler import handle_pantry_query, handle_pantry_add, handle_pantry_remove, handle_cooking_deduct, categorize_pantry_item, parse_pantry_items_from_message
from handlers.expense_handler import handle_expense_query, handle_store_trip, handle_mark_subscription
from handlers.suggestion_handler import handle_suggestion, handle_meal_suggestion, handle_reminder_check, handle_meal_plan_week, handle_budget_meal
from handlers.shopping_handler import handle_shopping_complete, handle_shopping_list_add, parse_purchased_items, parse_shopping_items_from_message
from handlers.budget_handler import handle_budget_set, handle_share_list
from handlers.response import generate_response
