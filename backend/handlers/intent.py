"""Intent detection for the Voxal chat assistant.

Classifies a user's natural-language message into one of ~18 intents
(expense_input, pantry_query, meal_suggestion, budget_set, etc.) plus
optional sub-intents and extracted entities (item names, amounts, dates).

Two strategies:
  1. LLM-based (detect_intent) — Sends the message to Groq with a detailed
     system prompt containing disambiguation rules and examples.
  2. Keyword-based (simple_intent_detection) — Rule-based fallback using
     ordered keyword/phrase matching. Used when Groq is unavailable or fails.

The intent dict is consumed by the chat route (routes/chat.py), which
dispatches to the appropriate domain handler.
"""

# ============================================================================
# INTENT DETECTION
# ============================================================================
from typing import Optional
import json

from config import groq_client

INTENT_DETECTION_PROMPT = """You are an intent classifier for a voice assistant that helps users track expenses and pantry items.

Analyze the user message and classify it into ONE of these intents:
- expense_input: User wants to log a new expense (e.g., "I spent $20 at Walmart", "bought groceries for $50"). IMPORTANT: If the user mentions specific dollar amounts or prices alongside items (e.g., "I bought carrots for $34", "I bought milk for $5 and eggs for $3"), this is ALWAYS expense_input, NOT shopping_complete.
- pantry_query: User asks about pantry/inventory (e.g., "How many eggs do I have?", "What's running low?", "What's expiring soon?")
- pantry_add: User wants to add pre-existing items to their pantry WITHOUT logging an expense (e.g., "I have flour, oil, and salt", "Currently I have eggs and milk in my pantry", "I already have rice, beans, and chicken"). The user must be LISTING specific food items they have. "I have no idea what to cook" or "I have a question" are NOT pantry_add — they are general.
- pantry_remove: User wants to remove items from their PANTRY (e.g., "Remove chicken from my pantry", "Delete eggs from my inventory", "Take out the milk"). This is ONLY for pantry items. If the user says "remove X from my shopping list", that is NOT pantry_remove — it's a shopping list operation (general).
- expense_query: User asks about spending (e.g., "How much did I spend this month?", "What did I spend on groceries?")
- suggestion: User wants shopping suggestions based on what they're running low on (e.g., "What should I get from the store?", "Give me a shopping list", "What groceries do I need?"). This is NOT for viewing/showing their existing shopping list — "Show my shopping list" is general.
- meal_suggestion: User wants meal ideas or recipes based on what they have (e.g., "What can I cook?", "Suggest a meal", "Dinner ideas", "What can I make with what I have?", "What should I eat for dinner?", "What should I have for lunch?"). Any forward-looking request for food ideas is meal_suggestion.
- shopping_complete: User indicates they finished shopping and bought items WITHOUT mentioning prices (e.g., "I bought milk and eggs", "Just got back from the store, got bread and butter", "Picked up the groceries"). If the user mentions dollar amounts or prices, classify as expense_input instead.
- shopping_list_add: User wants to add items to their shopping list for FUTURE purchase (e.g., "Add milk to my shopping list", "Put eggs on the list", "I need to buy bread and butter"). If dollar amounts are mentioned (e.g., "I need to buy eggs for $3"), this is expense_input instead — the user is reporting a purchase, not planning one.
- budget_set: User wants to SET or UPDATE a budget amount (e.g., "Set a $200 budget for groceries", "My food budget is $500 this month", "Budget $300 for eating out"). NOT for asking about budget status — "How much budget do I have left?" or "Am I over budget?" are expense_query, not budget_set.
- store_trip: User indicates they just returned from a specific store and wants items logged to pantry (e.g., "I just got back from Costco", "Just came from Trader Joe's", "Back from the grocery store"). If they also mention prices/dollar amounts for specific items, classify as expense_input instead.
- cooking_deduct: User is CURRENTLY cooking or ABOUT TO cook a recipe and wants ingredients deducted from pantry (e.g., "I'm cooking the chicken stir-fry", "Making pasta carbonara", "I'm preparing the beef tacos"). Must be present tense — past tense like "I cooked chicken yesterday" is NOT cooking_deduct.
- reminder_check: User wants to check on a specific item's expiration or status (e.g., "Remind me to use the avocados", "When do the eggs expire?", "Check on the chicken")
- share_list: User wants to share their shopping list with someone (e.g., "Share my shopping list with Sarah", "Send my list to John", "Share the grocery list with my roommate")
- meal_plan_week: User wants a full weekly meal plan (e.g., "Plan my meals for the week", "Make me a weekly meal plan", "What should I eat this week?")
- budget_meal: User wants meal SUGGESTIONS under a price limit (e.g., "What can I make under $10?", "Cheap dinner ideas", "Meals under $15"). Must be a forward-looking request for ideas. "I got dinner under $10" (past tense, reporting what happened) is expense_input, NOT budget_meal.
- mark_subscription: User wants to explicitly TAG or MARK a specific expense as recurring/subscription (e.g., "Log that as a subscription", "Mark that as recurring", "That's a monthly expense"). Must be an explicit tagging action. "My monthly expenses are too high" is NOT mark_subscription — that's expense_query or general.
- expense_delete: User wants to DELETE or REMOVE an existing expense (e.g., "Delete my last expense", "Remove the $15 Walmart expense", "Undo that expense"). Must be about removing a previously logged expense. "I spent $20" is expense_input, NOT expense_delete.
- budget_query: User wants to CHECK or VIEW their budget status (e.g., "What's my grocery budget?", "How much budget do I have left?", "Am I over budget?", "Show my budgets"). NOT for setting a budget — "Set a $200 budget" is budget_set.
- shopping_list_remove: User wants to REMOVE specific items from their shopping list (e.g., "Remove milk from my shopping list", "Take eggs off my list", "Delete bread from my shopping list"). Must mention specific items AND shopping list.
- shopping_clear: User wants to CLEAR or EMPTY their entire shopping list (e.g., "Clear my shopping list", "Empty my shopping list", "Delete everything from my shopping list"). No specific items needed — this removes ALL items.
- general: General questions or greetings (e.g., "Hello", "What can you do?", "Help")

Also determine the sub_intent where applicable:
- For pantry_query: item_quantity, low_stock, out_of_stock, expiring, list_all
- For pantry_add: add_items
- For expense_query: total_spending, by_category, by_store, by_date_range, spending_comparison
- For suggestion: shopping_list
- For meal_suggestion: quick_meals, use_expiring
- For shopping_complete: items_purchased

Extract any relevant entities:
- item_name: specific item being asked about
- category: expense or pantry category
- store: specific store name
- time_period: today, this week, this month, this year, or specific dates
- purchased_items: list of items the user bought (for shopping_complete intent)
- pantry_items: list of items the user already has (for pantry_add intent)
- meal_type: "breakfast", "lunch", "dinner", or "snack" if specified by the user (for meal_suggestion intent). Infer from context like "morning meal" = breakfast, "what should I cook tonight" = dinner.
- budget_amount: dollar amount for budget (e.g., 200 from "Set a $200 budget")
- budget_month: month for the budget if specified (e.g., "March", "next month")
- recipe_name: name of the recipe/dish being cooked (e.g., "chicken stir-fry" from "I'm cooking the chicken stir-fry")
- share_target: name or email of person to share with (e.g., "Sarah" from "Share my list with Sarah")
- price_limit: maximum price for budget meals (e.g., 10 from "What can I make under $10?")
- shopping_items: list of items to add to or remove from shopping list (e.g., ["milk", "eggs"] from "Add milk and eggs to my list")
- delete_item_name: name/description of the expense to delete (e.g., "Walmart" from "delete the Walmart expense")
- delete_amount: dollar amount of the expense to delete (e.g., 15 from "remove the $15 expense")

DISAMBIGUATION RULES (apply these when intents overlap):
1. Dollar amounts + items → expense_input (not shopping_complete, store_trip, or shopping_list_add)
2. Question about past spending ("how much did I spend?") → expense_query (not expense_input)
3. "I bought X" WITHOUT prices → shopping_complete; WITH prices → expense_input
4. Returning from a store WITHOUT prices → store_trip; WITH prices → expense_input
5. "I have X" listing specific food items → pantry_add; "I have no idea / a question" → general
6. "do I have X?" / "how many X?" → pantry_query (not pantry_add)
7. "remove X from my pantry" → pantry_remove; "remove X from my shopping list" → shopping_list_remove (not pantry_remove)
8. "Set a $200 budget" → budget_set; "What's my budget?" / "How much budget left?" / "Am I over budget?" → budget_query; "I spent from my budget" → expense_query
9. "I'm cooking/making [food]" → cooking_deduct; "I'm making a list/plans" → general (not cooking_deduct)
10. "Mark that as recurring" / "that's a subscription" → mark_subscription; "my monthly expenses are high" → expense_query
11. "What can I make under $10?" (forward-looking suggestion) → budget_meal; "I got dinner under $10" (past event) → expense_input
12. "I need to buy eggs" (no price) → shopping_list_add; "I need to buy eggs for $3" (has price) → expense_input
13. "What's in my pantry?" / "Show my pantry" → pantry_query (list_all); NOT general
14. "What should I eat?" / "What should I have for dinner?" → meal_suggestion (not general)
15. "Show my shopping list" → general (not suggestion); "Clear my shopping list" → shopping_clear (not general)
16. "I'm out of eggs" → pantry_query (out_of_stock); "I'm out of ideas/time/money" → general (not pantry_query)
17. "Delete my last expense" / "Remove the $15 expense" → expense_delete (not expense_query or general)
18. "What's my budget?" / "How much budget do I have left?" / "Am I over budget?" → budget_query (not budget_set or expense_query)
19. "Remove milk from my shopping list" → shopping_list_remove (not pantry_remove or general)
20. "Clear my shopping list" / "Empty my shopping list" → shopping_clear (not general)

Respond ONLY with a JSON object in this format:
{
  "intent": "one of the intents listed above",
  "sub_intent": "sub-intent or null",
  "entities": {
    "item_name": "extracted item name or null",
    "category": "extracted category or null",
    "store": "extracted store or null",
    "time_period": "extracted time period or null",
    "purchased_items": ["list", "of", "items"] or null,
    "pantry_items": ["list", "of", "items"] or null,
    "meal_type": "breakfast, lunch, dinner, snack, or null",
    "budget_amount": "number or null",
    "budget_month": "month name or null",
    "recipe_name": "recipe name or null",
    "share_target": "person name or null",
    "price_limit": "number or null",
    "shopping_items": ["list", "of", "items"] or null,
    "delete_item_name": "name of expense to delete or null",
    "delete_amount": "number or null"
  }
}"""


def detect_intent(message: str) -> dict:
    """Use Groq LLM to detect user intent from message."""
    if not groq_client:
        return simple_intent_detection(message)

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": INTENT_DETECTION_PROMPT},
                {"role": "user", "content": message}
            ],
            temperature=0.1
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
        print(f"Intent detection error: {e}")
        return simple_intent_detection(message)


def detect_meal_type(message: str) -> Optional[str]:
    """Detect meal type from user message."""
    message_lower = message.lower()
    if any(kw in message_lower for kw in ["breakfast", "morning meal", "morning"]):
        return "breakfast"
    if any(kw in message_lower for kw in ["lunch", "afternoon meal", "midday"]):
        return "lunch"
    if any(kw in message_lower for kw in ["dinner", "supper", "tonight", "evening meal", "evening"]):
        return "dinner"
    if any(kw in message_lower for kw in ["snack", "snacking"]):
        return "snack"
    return None


def simple_intent_detection(message: str) -> dict:
    """Simple keyword-based intent detection as fallback."""
    message_lower = message.lower()

    # --- Shopping clear (check before shopping list add/remove) ---
    shopping_clear_keywords = [
        "clear my shopping list", "clear the shopping list", "empty my shopping list",
        "empty the shopping list", "delete everything from my shopping list",
        "remove everything from my shopping list", "clear my list",
        "wipe my shopping list", "reset my shopping list"
    ]
    if any(kw in message_lower for kw in shopping_clear_keywords):
        return {"intent": "shopping_clear", "sub_intent": None, "entities": {}}

    # --- Shopping list remove (check before shopping list add) ---
    shopping_list_remove_keywords = [
        "remove from my shopping list", "remove from my list",
        "remove from the shopping list", "remove from the list",
        "delete from my shopping list", "delete from my list",
        "take off my shopping list", "take off my list",
        "take off the list", "take off the shopping list",
        "from my shopping list", "from my list", "off my list",
        "off my shopping list"
    ]
    # Must mention "remove/delete/take" AND "list" — avoid matching pantry_remove
    shopping_list_remove_verbs = ["remove", "delete", "take off", "take out"]
    shopping_list_context = ["shopping list", "my list", "the list", "grocery list"]
    has_remove_verb = any(v in message_lower for v in shopping_list_remove_verbs)
    has_list_context = any(c in message_lower for c in shopping_list_context)
    if has_remove_verb and has_list_context:
        return {"intent": "shopping_list_remove", "sub_intent": None, "entities": {}}

    # --- Expense delete (check before expense keywords) ---
    expense_delete_keywords = [
        "delete my last expense", "delete the last expense", "remove my last expense",
        "delete that expense", "remove that expense", "undo that expense",
        "undo my last expense", "delete the expense", "remove the expense",
        "cancel that expense", "delete expense"
    ]
    expense_delete_verbs = ["delete", "remove", "undo", "cancel"]
    expense_delete_nouns = ["expense", "transaction", "purchase"]
    has_delete_verb = any(v in message_lower for v in expense_delete_verbs)
    has_expense_noun = any(n in message_lower for n in expense_delete_nouns)
    if any(kw in message_lower for kw in expense_delete_keywords):
        return {"intent": "expense_delete", "sub_intent": None, "entities": {}}
    if has_delete_verb and has_expense_noun:
        # Avoid matching "delete from my pantry" or "remove from my shopping list"
        if "pantry" not in message_lower and "shopping list" not in message_lower and "list" not in message_lower:
            return {"intent": "expense_delete", "sub_intent": None, "entities": {}}

    # --- Budget query (check before budget set) ---
    budget_query_keywords = [
        "what's my budget", "whats my budget", "what is my budget",
        "how much budget", "budget left", "budget remaining",
        "am i over budget", "am i under budget", "show my budget",
        "show my budgets", "check my budget", "budget status",
        "how much do i have left in my budget", "how much is left in my budget"
    ]
    if any(kw in message_lower for kw in budget_query_keywords):
        return {"intent": "budget_query", "sub_intent": None, "entities": {}}

    # --- Shopping list add (check before general shopping keywords) ---
    # If dollar amounts are present, it's an expense, not a shopping list add
    shopping_list_add_keywords = [
        "add to my shopping list", "add to my list", "add to the list",
        "put on my list", "put on the list", "put on my shopping list",
        "i need to buy", "need to get", "add to grocery list",
        # Flexible patterns: user puts item name between verb and "list"
        # e.g. "add milk to my shopping list" → "to my shopping list" still matches
        "to my shopping list", "to my grocery list", "on my shopping list"
    ]
    if any(kw in message_lower for kw in shopping_list_add_keywords) and "$" not in message_lower:
        return {"intent": "shopping_list_add", "sub_intent": None, "entities": {}}

    # --- Budget set ---
    # Only match when user is SETTING a budget, not mentioning one in passing
    # "Set a $200 budget" ✓ but "I spent $50 from my budget" ✗
    budget_set_keywords = [
        "set a budget", "set budget", "set my budget",
        "budget of $", "budget is $", "budget for",
    ]
    budget_query_exclusions = ["how much", "what's left", "left in my budget", "spent", "from my budget", "over budget", "under budget"]
    if any(kw in message_lower for kw in budget_set_keywords) and "$" in message_lower:
        if not any(ex in message_lower for ex in budget_query_exclusions):
            return {"intent": "budget_set", "sub_intent": None, "entities": {}}

    # --- Pantry remove ---
    # Skip if user mentions "shopping list" — they want to modify their shopping list, not pantry
    pantry_remove_keywords = [
        "remove from my pantry", "remove from pantry", "delete from my pantry",
        "delete from pantry", "from my pantry", "from my fridge",
        "remove the", "get rid of", "toss the", "throw out"
    ]
    pantry_remove_exclusions = ["shopping list", "my list", "the list", "grocery list"]
    if any(kw in message_lower for kw in pantry_remove_keywords):
        if not any(ex in message_lower for ex in pantry_remove_exclusions):
            return {"intent": "pantry_remove", "sub_intent": None, "entities": {}}

    # --- Store trip ---
    # Build store trip keywords dynamically for all common grocery stores
    _store_names = [
        "costco", "walmart", "trader joe", "trader joe's", "kroger", "target", "aldi",
        "safeway", "publix", "heb", "h-e-b", "winco", "sprouts", "whole foods",
        "sam's club", "sams club", "wegmans", "meijer", "food lion", "stop and shop",
        "giant", "shoprite", "albertsons", "vons", "ralphs", "piggly wiggly",
        "the store", "the grocery", "the grocery store", "the supermarket"
    ]
    store_trip_keywords = []
    for store in _store_names:
        store_trip_keywords.extend([
            f"got back from {store}", f"came from {store}", f"back from {store}",
            f"just left {store}", f"just came from {store}"
        ])
    if any(kw in message_lower for kw in store_trip_keywords):
        return {"intent": "store_trip", "sub_intent": None, "entities": {}}

    # --- Cooking deduct ---
    # Exclude non-food contexts: "I'm making a list", "I'm making plans"
    cooking_deduct_keywords = [
        "i'm cooking", "im cooking", "i am cooking", "making the",
        "i'm making", "im making", "i am making", "i'm preparing",
        "im preparing", "i am preparing", "cooking the"
    ]
    cooking_deduct_exclusions = ["a list", "a plan", "plans", "a shopping", "a budget", "a note", "a reservation", "an order"]
    if any(kw in message_lower for kw in cooking_deduct_keywords):
        if not any(ex in message_lower for ex in cooking_deduct_exclusions):
            return {"intent": "cooking_deduct", "sub_intent": None, "entities": {}}

    # --- Reminder check ---
    reminder_check_keywords = [
        "remind me to use", "when does the", "when do the",
        "check on the", "when does my", "when do my",
        "remind me about the"
    ]
    if any(kw in message_lower for kw in reminder_check_keywords):
        return {"intent": "reminder_check", "sub_intent": None, "entities": {}}

    # --- Share list ---
    share_list_keywords = [
        "share my shopping list", "share my list", "share the list",
        "send my list", "share grocery list", "share the shopping list"
    ]
    if any(kw in message_lower for kw in share_list_keywords):
        return {"intent": "share_list", "sub_intent": None, "entities": {}}

    # --- Meal plan week ---
    meal_plan_week_keywords = [
        "plan my meals for the week", "weekly meal plan", "meal plan for the week",
        "plan meals for the week", "what should i eat this week",
        "plan my week", "meals for the week"
    ]
    if any(kw in message_lower for kw in meal_plan_week_keywords):
        return {"intent": "meal_plan_week", "sub_intent": None, "entities": {}}

    # --- Budget meal ---
    # Exclude past-tense: "I got dinner under $10" is an expense, not a meal request
    budget_meal_keywords = [
        "make under $", "cook under $", "meal under $", "meals under $",
        "cheap dinner", "cheap meal", "cheap lunch",
        "cheap breakfast", "budget meal", "affordable meal"
    ]
    budget_meal_with_under = "under $" in message_lower
    budget_meal_past_tense = any(kw in message_lower for kw in ["i got", "i had", "i ate", "i spent", "i bought", "i paid"])
    if any(kw in message_lower for kw in budget_meal_keywords):
        return {"intent": "budget_meal", "sub_intent": None, "entities": {}}
    if budget_meal_with_under and not budget_meal_past_tense:
        return {"intent": "budget_meal", "sub_intent": None, "entities": {}}

    # --- Mark subscription ---
    # Only match explicit tagging actions, not general mentions of "monthly expenses"
    mark_subscription_keywords = [
        "log that as a subscription", "mark that as recurring",
        "that's a subscription", "thats a subscription",
        "mark as subscription", "mark as recurring",
        "that's a monthly", "thats a monthly",
        "log as recurring", "set as recurring", "it's a subscription", "its a subscription"
    ]
    if any(kw in message_lower for kw in mark_subscription_keywords):
        return {"intent": "mark_subscription", "sub_intent": None, "entities": {}}

    # --- Expense input ---
    # Check for expense queries FIRST so "how much have I spent" doesn't get
    # caught as expense_input by the "$" / "spent" keywords below.
    if "how much" in message_lower and "spend" in message_lower:
        return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}
    if "how much" in message_lower and "spent" in message_lower:
        return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}
    if ("what did i spend" in message_lower or "what have i spent" in message_lower
            or "where did i spend" in message_lower):
        return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}

    # Note: "cost" removed — it's a substring of "costco" which caused false matches
    expense_keywords = ["spent", "purchased", "paid", "$"]
    if any(kw in message_lower for kw in expense_keywords):
        return {"intent": "expense_input", "sub_intent": None, "entities": {}}

    # --- Pantry query (list_all) — must come BEFORE pantry_add ---
    # "What's in my pantry?" would otherwise match pantry_add via "in my pantry"
    pantry_list_patterns = [
        "what's in my pantry", "whats in my pantry", "what is in my pantry",
        "show my pantry", "show me my pantry", "list my pantry",
        "what's in my fridge", "whats in my fridge", "what is in my fridge",
        "show my fridge", "show me my fridge", "what do i have in my pantry",
        "what do i have in my fridge", "what's in my kitchen", "whats in my kitchen"
    ]
    if any(p in message_lower for p in pantry_list_patterns):
        return {"intent": "pantry_query", "sub_intent": "list_all", "entities": {}}

    # --- Pantry add ---
    # Exclude non-inventory phrases: "I have no idea", "I have a question", etc.
    pantry_add_patterns = [
        "i have ", "i already have", "currently i have", "currently have",
        "i've got ", "in my pantry", "in my fridge", "in my kitchen",
        "i currently have", "right now i have", "at home i have"
    ]
    pantry_add_query_words = ["how many", "how much", "do i have", "?", "what's in", "whats in", "what is in", "show my", "show me my"]
    pantry_add_exclusions = [
        "no idea", "a question", "no clue", "a problem", "a feeling",
        "an issue", "to go", "to leave", "to check", "enough", "too much",
        "too many", "no more", "nothing", "should i have", "what should i have"
    ]
    if any(pattern in message_lower for pattern in pantry_add_patterns):
        if not any(qw in message_lower for qw in pantry_add_query_words):
            if not any(ex in message_lower for ex in pantry_add_exclusions):
                return {"intent": "pantry_add", "sub_intent": "add_items", "entities": {}}

    pantry_keywords = ["have", "eggs", "milk", "running low", "out of", "expiring", "pantry", "inventory"]
    if ("how many" in message_lower or "how much" in message_lower) and any(kw in message_lower for kw in pantry_keywords):
        return {"intent": "pantry_query", "sub_intent": "item_quantity", "entities": {}}
    if any(kw in message_lower for kw in ["running low", "low stock", "low on", "am i low", "what am i low"]):
        return {"intent": "pantry_query", "sub_intent": "low_stock", "entities": {}}
    out_of_stock_exclusions = ["out of ideas", "out of time", "out of money", "out of luck", "out of here", "out of town", "out of order"]
    if "out of" in message_lower:
        if not any(ex in message_lower for ex in out_of_stock_exclusions):
            return {"intent": "pantry_query", "sub_intent": "out_of_stock", "entities": {}}
    if any(kw in message_lower for kw in ["expiring", "expire", "expiring soon", "goes bad", "going bad", "about to expire", "shelf life"]):
        return {"intent": "pantry_query", "sub_intent": "expiring", "entities": {}}

    # --- Spending comparison ---
    comparison_keywords = [
        "compare", "comparison", "compared to last", "vs last",
        "how does this month compare", "versus last month",
        "spending trend", "more or less"
    ]
    if any(kw in message_lower for kw in comparison_keywords):
        return {"intent": "expense_query", "sub_intent": "spending_comparison", "entities": {}}

    # --- Expense query (additional patterns not caught above) ---
    if "spent" in message_lower and ("on" in message_lower or "at" in message_lower):
        if not any(kw in message_lower for kw in ["i spent", "just spent"]):
            return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}

    # --- Meal suggestion ---
    # Use specific phrases to avoid substring issues ("cook" matches "cooker", "overcooked")
    meal_keywords = [
        "what can i cook", "what should i cook", "what can i make",
        "what should i eat", "what should i have for",
        "recipe", "meal idea", "dinner idea", "lunch idea", "breakfast idea",
        "suggest a meal", "meal suggestion", "dinner suggestion", "lunch suggestion",
        "what to cook", "what to eat", "what to make for dinner",
        "what to make for lunch", "what to make for breakfast",
        "ideas for dinner", "ideas for lunch", "ideas for breakfast",
        "i want to cook", "help me cook", "what can i prepare"
    ]
    if any(kw in message_lower for kw in meal_keywords):
        meal_type = detect_meal_type(message)
        return {"intent": "meal_suggestion", "sub_intent": "quick_meals", "entities": {"meal_type": meal_type}}

    # --- Shopping suggestion ---
    # Removed bare "shopping list" — too broad, matches "show/clear/delete my shopping list"
    suggestion_keywords = [
        "should i get", "what to buy", "should i buy",
        "what do i need from the store", "what should i get from the store",
        "give me a shopping list", "suggest what to buy", "what groceries do i need"
    ]
    if any(kw in message_lower for kw in suggestion_keywords):
        return {"intent": "suggestion", "sub_intent": "shopping_list", "entities": {}}

    # --- Shopping complete (only if no dollar amounts — otherwise expense_input already caught it above) ---
    shopping_complete_keywords = ["i bought", "just bought", "picked up", "finished shopping"]
    if any(kw in message_lower for kw in shopping_complete_keywords):
        return {"intent": "shopping_complete", "sub_intent": "items_purchased", "entities": {}}

    return {"intent": "general", "sub_intent": None, "entities": {}}
