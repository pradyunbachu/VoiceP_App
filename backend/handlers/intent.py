# ============================================================================
# INTENT DETECTION
# ============================================================================
from typing import Optional
import json

from config import groq_client

INTENT_DETECTION_PROMPT = """You are an intent classifier for a voice assistant that helps users track expenses and pantry items.

Analyze the user message and classify it into ONE of these intents:
- expense_input: User wants to log a new expense (e.g., "I spent $20 at Walmart", "bought groceries for $50")
- pantry_query: User asks about pantry/inventory (e.g., "How many eggs do I have?", "What's running low?", "What's expiring soon?")
- pantry_add: User wants to add pre-existing items to their pantry WITHOUT logging an expense (e.g., "I have flour, oil, and salt", "Currently I have eggs and milk in my pantry", "I already have rice, beans, and chicken")
- pantry_remove: User wants to remove items from their pantry (e.g., "Remove chicken from my pantry", "Delete eggs from my inventory", "Take out the milk")
- expense_query: User asks about spending (e.g., "How much did I spend this month?", "What did I spend on groceries?")
- suggestion: User wants shopping suggestions (e.g., "What should I get from the store?", "Give me a shopping list")
- meal_suggestion: User wants meal ideas or recipes based on what they have (e.g., "What can I cook?", "Suggest a meal", "Dinner ideas", "What can I make with what I have?")
- shopping_complete: User indicates they finished shopping and bought items (e.g., "I bought milk and eggs", "Just got back from the store, got bread and butter", "Picked up the groceries")
- shopping_list_add: User wants to add items to their shopping list (e.g., "Add milk to my shopping list", "Put eggs on the list", "I need to buy bread and butter")
- budget_set: User wants to set or update a budget (e.g., "Set a $200 budget for groceries", "My food budget is $500 this month", "Budget $300 for eating out")
- store_trip: User indicates they just returned from a specific store and wants items logged to pantry (e.g., "I just got back from Costco", "Just came from Trader Joe's", "Back from the grocery store")
- cooking_deduct: User is cooking a recipe and wants ingredients deducted from pantry (e.g., "I'm cooking the chicken stir-fry", "Making pasta carbonara", "I'm preparing the beef tacos")
- reminder_check: User wants to check on a specific item's expiration or status (e.g., "Remind me to use the avocados", "When do the eggs expire?", "Check on the chicken")
- share_list: User wants to share their shopping list with someone (e.g., "Share my shopping list with Sarah", "Send my list to John", "Share the grocery list with my roommate")
- meal_plan_week: User wants a full weekly meal plan (e.g., "Plan my meals for the week", "Make me a weekly meal plan", "What should I eat this week?")
- budget_meal: User wants meal suggestions under a price limit (e.g., "What can I make under $10?", "Cheap dinner ideas", "Meals under $15")
- mark_subscription: User wants to mark an expense as recurring/subscription (e.g., "Log that as a subscription", "Mark that as recurring", "That's a monthly expense")
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
- shopping_items: list of items to add to shopping list (e.g., ["milk", "eggs"] from "Add milk and eggs to my list")

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
    "shopping_items": ["list", "of", "items"] or null
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

    # --- Shopping list add (check before general shopping keywords) ---
    shopping_list_add_keywords = [
        "add to my shopping list", "add to my list", "add to the list",
        "put on my list", "put on the list", "put on my shopping list",
        "i need to buy", "need to get", "add to grocery list"
    ]
    if any(kw in message_lower for kw in shopping_list_add_keywords):
        return {"intent": "shopping_list_add", "sub_intent": None, "entities": {}}

    # --- Budget set ---
    budget_set_keywords = [
        "set a budget", "set budget", "my budget", "budget for",
        "budget of", "budget is"
    ]
    if any(kw in message_lower for kw in budget_set_keywords) and "$" in message_lower:
        return {"intent": "budget_set", "sub_intent": None, "entities": {}}

    # --- Pantry remove ---
    pantry_remove_keywords = [
        "remove from my pantry", "remove from pantry", "delete from my pantry",
        "delete from pantry", "take out the", "remove the",
        "get rid of", "toss the", "throw out"
    ]
    if any(kw in message_lower for kw in pantry_remove_keywords):
        return {"intent": "pantry_remove", "sub_intent": None, "entities": {}}

    # --- Store trip ---
    store_trip_keywords = [
        "got back from costco", "got back from walmart", "got back from trader",
        "got back from kroger", "got back from target", "got back from aldi",
        "came from costco", "came from walmart", "came from trader",
        "came from the store", "came from the grocery",
        "back from costco", "back from walmart", "back from the store",
        "back from the grocery", "back from trader"
    ]
    if any(kw in message_lower for kw in store_trip_keywords):
        return {"intent": "store_trip", "sub_intent": None, "entities": {}}

    # --- Cooking deduct ---
    cooking_deduct_keywords = [
        "i'm cooking", "im cooking", "i am cooking", "making the",
        "i'm making", "im making", "i am making", "i'm preparing",
        "im preparing", "i am preparing", "cooking the"
    ]
    if any(kw in message_lower for kw in cooking_deduct_keywords):
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
    budget_meal_keywords = [
        "make under $", "cook under $", "meal under $", "meals under $",
        "under $", "cheap dinner", "cheap meal", "cheap lunch",
        "cheap breakfast", "budget meal", "affordable meal"
    ]
    if any(kw in message_lower for kw in budget_meal_keywords):
        return {"intent": "budget_meal", "sub_intent": None, "entities": {}}

    # --- Mark subscription ---
    mark_subscription_keywords = [
        "log that as a subscription", "mark that as recurring",
        "that's a subscription", "thats a subscription",
        "mark as subscription", "monthly expense", "recurring expense",
        "that's a monthly", "thats a monthly", "mark as recurring"
    ]
    if any(kw in message_lower for kw in mark_subscription_keywords):
        return {"intent": "mark_subscription", "sub_intent": None, "entities": {}}

    # --- Expense input ---
    expense_keywords = ["spent", "purchased", "paid", "cost", "$"]
    if any(kw in message_lower for kw in expense_keywords):
        return {"intent": "expense_input", "sub_intent": None, "entities": {}}

    # --- Pantry add ---
    pantry_add_patterns = [
        "i have ", "i already have", "currently i have", "currently have",
        "i've got ", "in my pantry", "in my fridge", "in my kitchen",
        "i currently have", "right now i have", "at home i have"
    ]
    if any(pattern in message_lower for pattern in pantry_add_patterns):
        query_words = ["how many", "how much", "do i have", "?"]
        if not any(qw in message_lower for qw in query_words):
            return {"intent": "pantry_add", "sub_intent": "add_items", "entities": {}}

    # --- Pantry query ---
    pantry_keywords = ["have", "eggs", "milk", "running low", "out of", "expiring", "pantry", "inventory"]
    if "how many" in message_lower or "how much" in message_lower and any(kw in message_lower for kw in pantry_keywords):
        return {"intent": "pantry_query", "sub_intent": "item_quantity", "entities": {}}
    if any(kw in message_lower for kw in ["running low", "low stock", "low on", "am i low", "what am i low"]):
        return {"intent": "pantry_query", "sub_intent": "low_stock", "entities": {}}
    if "out of" in message_lower:
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

    # --- Expense query ---
    if "how much" in message_lower and "spend" in message_lower:
        return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}
    if "spent" in message_lower and ("on" in message_lower or "at" in message_lower):
        if not any(kw in message_lower for kw in ["i spent", "just spent"]):
            return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}

    # --- Meal suggestion ---
    meal_keywords = ["cook", "recipe", "meal idea", "what can i make", "dinner idea", "suggest a meal", "lunch idea", "breakfast idea", "what can i cook", "what should i cook", "meal suggestion"]
    if any(kw in message_lower for kw in meal_keywords):
        meal_type = detect_meal_type(message)
        return {"intent": "meal_suggestion", "sub_intent": "quick_meals", "entities": {"meal_type": meal_type}}

    # --- Shopping suggestion ---
    suggestion_keywords = ["should i get", "shopping list", "need to buy", "what to buy", "should i buy", "from the store"]
    if any(kw in message_lower for kw in suggestion_keywords):
        return {"intent": "suggestion", "sub_intent": "shopping_list", "entities": {}}

    # --- Shopping complete ---
    shopping_complete_keywords = ["i bought", "just bought", "picked up", "got back from the store", "finished shopping", "just got"]
    if any(kw in message_lower for kw in shopping_complete_keywords):
        return {"intent": "shopping_complete", "sub_intent": "items_purchased", "entities": {}}

    return {"intent": "general", "sub_intent": None, "entities": {}}
