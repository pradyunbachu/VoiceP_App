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
- expense_query: User asks about spending (e.g., "How much did I spend this month?", "What did I spend on groceries?")
- suggestion: User wants shopping suggestions (e.g., "What should I get from the store?", "Give me a shopping list")
- meal_suggestion: User wants meal ideas or recipes based on what they have (e.g., "What can I cook?", "Suggest a meal", "Dinner ideas", "What can I make with what I have?")
- shopping_complete: User indicates they finished shopping and bought items (e.g., "I bought milk and eggs", "Just got back from the store, got bread and butter", "Picked up the groceries")
- general: General questions or greetings (e.g., "Hello", "What can you do?", "Help")

Also determine the sub_intent where applicable:
- For pantry_query: item_quantity, low_stock, out_of_stock, expiring, list_all
- For pantry_add: add_items
- For expense_query: total_spending, by_category, by_store, by_date_range
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

Respond ONLY with a JSON object in this format:
{
  "intent": "one of: expense_input, pantry_query, pantry_add, expense_query, suggestion, meal_suggestion, shopping_complete, general",
  "sub_intent": "sub-intent or null",
  "entities": {
    "item_name": "extracted item name or null",
    "category": "extracted category or null",
    "store": "extracted store or null",
    "time_period": "extracted time period or null",
    "purchased_items": ["list", "of", "items"] or null,
    "pantry_items": ["list", "of", "items"] or null,
    "meal_type": "breakfast, lunch, dinner, snack, or null"
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

    expense_keywords = ["spent", "purchased", "paid", "cost", "$"]
    if any(kw in message_lower for kw in expense_keywords):
        return {"intent": "expense_input", "sub_intent": None, "entities": {}}

    pantry_add_patterns = [
        "i have ", "i already have", "currently i have", "currently have",
        "i've got ", "in my pantry", "in my fridge", "in my kitchen",
        "i currently have", "right now i have", "at home i have"
    ]
    if any(pattern in message_lower for pattern in pantry_add_patterns):
        query_words = ["how many", "how much", "do i have", "?"]
        if not any(qw in message_lower for qw in query_words):
            return {"intent": "pantry_add", "sub_intent": "add_items", "entities": {}}

    pantry_keywords = ["have", "eggs", "milk", "running low", "out of", "expiring", "pantry", "inventory"]
    if "how many" in message_lower or "how much" in message_lower and any(kw in message_lower for kw in pantry_keywords):
        return {"intent": "pantry_query", "sub_intent": "item_quantity", "entities": {}}
    if "running low" in message_lower or "low stock" in message_lower:
        return {"intent": "pantry_query", "sub_intent": "low_stock", "entities": {}}
    if "out of" in message_lower:
        return {"intent": "pantry_query", "sub_intent": "out_of_stock", "entities": {}}
    if "expiring" in message_lower or "expire" in message_lower:
        return {"intent": "pantry_query", "sub_intent": "expiring", "entities": {}}

    if "how much" in message_lower and "spend" in message_lower:
        return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}
    if "spent" in message_lower and ("on" in message_lower or "at" in message_lower):
        if not any(kw in message_lower for kw in ["i spent", "just spent"]):
            return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}

    meal_keywords = ["cook", "recipe", "meal idea", "what can i make", "dinner idea", "suggest a meal", "lunch idea", "breakfast idea", "what can i cook", "what should i cook", "meal suggestion"]
    if any(kw in message_lower for kw in meal_keywords):
        meal_type = detect_meal_type(message)
        return {"intent": "meal_suggestion", "sub_intent": "quick_meals", "entities": {"meal_type": meal_type}}

    suggestion_keywords = ["should i get", "shopping list", "need to buy", "what to buy", "should i buy", "from the store"]
    if any(kw in message_lower for kw in suggestion_keywords):
        return {"intent": "suggestion", "sub_intent": "shopping_list", "entities": {}}

    shopping_complete_keywords = ["i bought", "just bought", "picked up", "got back from the store", "finished shopping", "just got"]
    if any(kw in message_lower for kw in shopping_complete_keywords):
        return {"intent": "shopping_complete", "sub_intent": "items_purchased", "entities": {}}

    return {"intent": "general", "sub_intent": None, "entities": {}}
