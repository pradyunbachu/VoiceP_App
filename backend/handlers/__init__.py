# ============================================================================
# HANDLERS MODULE - Re-exports all handler functions
# ============================================================================
from handlers.intent import detect_intent, simple_intent_detection, detect_meal_type
from handlers.pantry_handler import handle_pantry_query, handle_pantry_add, categorize_pantry_item, parse_pantry_items_from_message
from handlers.expense_handler import handle_expense_query
from handlers.suggestion_handler import handle_suggestion, handle_meal_suggestion
from handlers.shopping_handler import handle_shopping_complete, parse_purchased_items
from handlers.response import generate_response
