# ============================================================================
# CHAT ROUTES - Conversational Voice Assistant
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta
from typing import Optional
import json

from config import supabase, groq_client
from auth import get_current_user_dependency
from schemas import ChatRequest, ChatResponse

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# ============================================================================
# INTENT DETECTION AND RESPONSE GENERATION
# ============================================================================

INTENT_DETECTION_PROMPT = """You are an intent classifier for a voice assistant that helps users track expenses and pantry items.

Analyze the user message and classify it into ONE of these intents:
- expense_input: User wants to log a new expense (e.g., "I spent $20 at Walmart", "bought groceries for $50")
- pantry_query: User asks about pantry/inventory (e.g., "How many eggs do I have?", "What's running low?", "What's expiring soon?")
- expense_query: User asks about spending (e.g., "How much did I spend this month?", "What did I spend on groceries?")
- suggestion: User wants shopping suggestions (e.g., "What should I get from the store?", "Give me a shopping list")
- shopping_complete: User indicates they finished shopping and bought items (e.g., "I bought milk and eggs", "Just got back from the store, got bread and butter", "Picked up the groceries")
- general: General questions or greetings (e.g., "Hello", "What can you do?", "Help")

Also determine the sub_intent where applicable:
- For pantry_query: item_quantity, low_stock, out_of_stock, expiring, list_all
- For expense_query: total_spending, by_category, by_store, by_date_range
- For suggestion: shopping_list
- For shopping_complete: items_purchased

Extract any relevant entities:
- item_name: specific item being asked about
- category: expense or pantry category
- store: specific store name
- time_period: today, this week, this month, this year, or specific dates
- purchased_items: list of items the user bought (for shopping_complete intent)

Respond ONLY with a JSON object in this format:
{
  "intent": "one of: expense_input, pantry_query, expense_query, suggestion, shopping_complete, general",
  "sub_intent": "sub-intent or null",
  "entities": {
    "item_name": "extracted item name or null",
    "category": "extracted category or null",
    "store": "extracted store or null",
    "time_period": "extracted time period or null",
    "purchased_items": ["list", "of", "items"] or null
  }
}"""


def detect_intent(message: str) -> dict:
    """Use Groq LLM to detect user intent from message."""
    if not groq_client:
        # Fallback to simple keyword matching
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
        # Remove markdown code blocks if present
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


def simple_intent_detection(message: str) -> dict:
    """Simple keyword-based intent detection as fallback."""
    message_lower = message.lower()

    # Check for expense input patterns
    expense_keywords = ["spent", "bought", "purchased", "paid", "cost", "$"]
    if any(kw in message_lower for kw in expense_keywords):
        return {"intent": "expense_input", "sub_intent": None, "entities": {}}

    # Check for pantry queries
    pantry_keywords = ["have", "eggs", "milk", "running low", "out of", "expiring", "pantry", "inventory"]
    if "how many" in message_lower or "how much" in message_lower and any(kw in message_lower for kw in pantry_keywords):
        return {"intent": "pantry_query", "sub_intent": "item_quantity", "entities": {}}
    if "running low" in message_lower or "low stock" in message_lower:
        return {"intent": "pantry_query", "sub_intent": "low_stock", "entities": {}}
    if "out of" in message_lower:
        return {"intent": "pantry_query", "sub_intent": "out_of_stock", "entities": {}}
    if "expiring" in message_lower or "expire" in message_lower:
        return {"intent": "pantry_query", "sub_intent": "expiring", "entities": {}}

    # Check for expense queries
    if "how much" in message_lower and "spend" in message_lower:
        return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}
    if "spent" in message_lower and ("on" in message_lower or "at" in message_lower):
        if not any(kw in message_lower for kw in ["i spent", "just spent"]):
            return {"intent": "expense_query", "sub_intent": "total_spending", "entities": {}}

    # Check for suggestions
    suggestion_keywords = ["should i get", "shopping list", "need to buy", "what to buy", "should i buy", "from the store"]
    if any(kw in message_lower for kw in suggestion_keywords):
        return {"intent": "suggestion", "sub_intent": "shopping_list", "entities": {}}

    # Check for shopping complete (user bought items)
    shopping_complete_keywords = ["i bought", "just bought", "picked up", "got back from the store", "finished shopping", "just got"]
    if any(kw in message_lower for kw in shopping_complete_keywords):
        return {"intent": "shopping_complete", "sub_intent": "items_purchased", "entities": {}}

    # Default to general
    return {"intent": "general", "sub_intent": None, "entities": {}}


# ============================================================================
# QUERY HANDLERS
# ============================================================================

async def handle_pantry_query(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Handle pantry-related queries."""
    if supabase is None:
        return {"items": [], "message": "Database not configured"}

    query = supabase.table("pantry_items").select("*").eq("user_id", user_id)

    if sub_intent == "item_quantity":
        item_name = entities.get("item_name")
        if item_name:
            # Search for items matching the name
            response = query.execute()
            items = response.data if response.data else []
            # Filter by item name (case-insensitive partial match)
            matching = [i for i in items if item_name.lower() in i.get("name", "").lower()]
            return {
                "items": matching,
                "count": len(matching),
                "query_type": "item_quantity",
                "searched_item": item_name
            }
        else:
            # Return all items if no specific item mentioned
            response = query.execute()
            items = response.data if response.data else []
            return {"items": items, "count": len(items), "query_type": "list_all"}

    elif sub_intent == "low_stock":
        response = query.eq("stock_status", "low").execute()
        items = response.data if response.data else []
        return {"items": items, "count": len(items), "query_type": "low_stock"}

    elif sub_intent == "out_of_stock":
        response = query.eq("stock_status", "out_of_stock").execute()
        items = response.data if response.data else []
        return {"items": items, "count": len(items), "query_type": "out_of_stock"}

    elif sub_intent == "expiring":
        # Items expiring within 7 days
        response = query.execute()
        items = response.data if response.data else []
        today = datetime.now().date()
        week_from_now = today + timedelta(days=7)
        expiring = []
        for item in items:
            if item.get("expiration_date"):
                try:
                    exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                    if today <= exp_date <= week_from_now:
                        expiring.append(item)
                except:
                    pass
        return {"items": expiring, "count": len(expiring), "query_type": "expiring"}

    else:
        # Default: return all items
        response = query.execute()
        items = response.data if response.data else []
        return {"items": items, "count": len(items), "query_type": "list_all"}


async def handle_expense_query(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Handle expense-related queries."""
    if supabase is None:
        return {"expenses": [], "total": 0, "message": "Database not configured"}

    query = supabase.table("expenses").select("*").eq("user_id", user_id)

    # Apply time period filter
    time_period = entities.get("time_period", "this month")
    today = datetime.now().date()

    if time_period == "today":
        start_date = today.strftime("%Y-%m-%d")
        end_date = start_date
    elif time_period == "this week":
        start_date = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
        end_date = today.strftime("%Y-%m-%d")
    elif time_period == "this year":
        start_date = f"{today.year}-01-01"
        end_date = today.strftime("%Y-%m-%d")
    else:  # this month (default)
        start_date = f"{today.year}-{today.month:02d}-01"
        end_date = today.strftime("%Y-%m-%d")

    query = query.gte("date", start_date).lte("date", end_date)

    # Apply category/store filters
    category = entities.get("category")
    store = entities.get("store")

    if sub_intent == "by_category" and category:
        query = query.ilike("category", f"%{category}%")
    elif sub_intent == "by_store" and store:
        query = query.ilike("store", f"%{store}%")

    response = query.order("date", desc=True).execute()
    expenses = response.data if response.data else []

    # Calculate total
    total = sum(float(e.get("amount", 0) or 0) for e in expenses)

    return {
        "expenses": expenses,
        "count": len(expenses),
        "total": round(total, 2),
        "time_period": time_period,
        "category": category,
        "store": store,
        "query_type": sub_intent or "total_spending"
    }


async def handle_suggestion(user_id: str, sub_intent: str, entities: dict) -> dict:
    """Generate shopping suggestions based on shopping list and pantry status."""
    if supabase is None:
        return {"shopping_list_items": [], "pantry_items": [], "message": "Database not configured"}

    # Get shopping list items
    shopping_response = supabase.table("shopping_list").select("*").eq("user_id", user_id).execute()
    shopping_list_items = shopping_response.data if shopping_response.data else []

    # Format shopping list items
    formatted_shopping_list = []
    for item in shopping_list_items:
        formatted_shopping_list.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "quantity": item.get("quantity"),
            "unit": item.get("unit"),
            "category": item.get("category"),
            "notes": item.get("notes"),
            "source": "shopping_list"
        })

    # Get low and out-of-stock pantry items
    pantry_response = supabase.table("pantry_items").select("*").eq("user_id", user_id).execute()
    pantry_items = pantry_response.data if pantry_response.data else []

    pantry_suggestions = []
    for item in pantry_items:
        status = item.get("stock_status", "full")
        if status in ["low", "out_of_stock"]:
            pantry_suggestions.append({
                "id": item.get("id"),
                "name": item.get("name"),
                "category": item.get("category"),
                "status": status,
                "quantity": item.get("quantity"),
                "unit": item.get("unit"),
                "source": "pantry"
            })

    # Sort pantry suggestions: out_of_stock first, then low
    pantry_suggestions.sort(key=lambda x: 0 if x["status"] == "out_of_stock" else 1)

    return {
        "shopping_list_items": formatted_shopping_list,
        "pantry_items": pantry_suggestions,
        "shopping_list_count": len(formatted_shopping_list),
        "pantry_count": len(pantry_suggestions),
        "total_count": len(formatted_shopping_list) + len(pantry_suggestions),
        "query_type": "shopping_list"
    }


async def handle_shopping_complete(user_id: str, entities: dict, original_message: str) -> dict:
    """Handle when user indicates they finished shopping and bought items."""
    if supabase is None:
        return {"removed_items": [], "message": "Database not configured"}

    purchased_items = entities.get("purchased_items", [])

    # If no items were extracted, try to parse from the original message
    if not purchased_items:
        purchased_items = parse_purchased_items(original_message)

    if not purchased_items:
        return {
            "removed_items": [],
            "removed_count": 0,
            "message": "I couldn't identify which items you bought. Could you list them?",
            "query_type": "shopping_complete"
        }

    # Get all shopping list items for the user
    shopping_response = supabase.table("shopping_list").select("*").eq("user_id", user_id).execute()
    shopping_items = shopping_response.data if shopping_response.data else []

    # Match purchased items against shopping list (fuzzy matching)
    removed_items = []
    removed_ids = []

    for purchased in purchased_items:
        purchased_lower = purchased.lower().strip()
        for shopping_item in shopping_items:
            item_name = shopping_item.get("name", "").lower()
            # Check for partial match (either direction)
            if purchased_lower in item_name or item_name in purchased_lower:
                if shopping_item["id"] not in removed_ids:
                    removed_ids.append(shopping_item["id"])
                    removed_items.append(shopping_item.get("name"))

    # Delete matched items from shopping list
    deleted_count = 0
    for item_id in removed_ids:
        response = supabase.table("shopping_list").delete().eq("id", item_id).eq("user_id", user_id).execute()
        if response.data:
            deleted_count += 1

    return {
        "removed_items": removed_items,
        "removed_count": deleted_count,
        "purchased_items": purchased_items,
        "query_type": "shopping_complete"
    }


def parse_purchased_items(message: str) -> list:
    """Parse item names from a purchase message."""
    message_lower = message.lower()

    # Remove common phrases
    remove_phrases = [
        "i bought", "just bought", "i got", "just got", "picked up",
        "got back from the store", "finished shopping", "from the store",
        "at the store", "today", "yesterday", "and", "some", "a few"
    ]

    cleaned = message_lower
    for phrase in remove_phrases:
        cleaned = cleaned.replace(phrase, " ")

    # Split by common delimiters
    import re
    items = re.split(r'[,;]|\band\b', cleaned)

    # Clean up each item
    parsed_items = []
    for item in items:
        item = item.strip().strip('.')
        # Filter out empty strings and common words
        if item and len(item) > 1 and item not in ["the", "a", "an", "some"]:
            parsed_items.append(item)

    return parsed_items


def generate_response(intent: str, sub_intent: str, data: dict, entities: dict) -> str:
    """Generate a natural language response based on intent and data."""

    if intent == "pantry_query":
        items = data.get("items", [])
        count = data.get("count", 0)
        query_type = data.get("query_type")

        if query_type == "item_quantity":
            searched = data.get("searched_item", "items")
            if count == 0:
                return f"I don't see any {searched} in your pantry."
            elif count == 1:
                item = items[0]
                qty = item.get("quantity", 1)
                unit = item.get("unit", "")
                status = item.get("stock_status", "full")
                return f"You have {qty} {unit} {item['name']} ({status} stock)."
            else:
                item_list = ", ".join([f"{i['name']} ({i.get('quantity', 1)} {i.get('unit', '')})" for i in items])
                return f"I found {count} items matching '{searched}': {item_list}"

        elif query_type == "low_stock":
            if count == 0:
                return "Nothing is running low in your pantry."
            item_names = [i["name"] for i in items]
            return f"Running low ({count} items): {', '.join(item_names)}"

        elif query_type == "out_of_stock":
            if count == 0:
                return "You're not out of anything in your pantry."
            item_names = [i["name"] for i in items]
            return f"Out of stock ({count} items): {', '.join(item_names)}"

        elif query_type == "expiring":
            if count == 0:
                return "Nothing is expiring soon in your pantry."
            item_names = [f"{i['name']} (expires {i['expiration_date']})" for i in items]
            return f"Expiring soon ({count} items): {', '.join(item_names)}"

        else:
            if count == 0:
                return "Your pantry is empty."
            return f"You have {count} items in your pantry."

    elif intent == "expense_query":
        total = data.get("total", 0)
        count = data.get("count", 0)
        time_period = data.get("time_period", "this period")
        category = data.get("category")
        store = data.get("store")

        if category:
            return f"You spent ${total:.2f} on {category} {time_period} ({count} transactions)."
        elif store:
            return f"You spent ${total:.2f} at {store} {time_period} ({count} transactions)."
        else:
            return f"You spent ${total:.2f} {time_period} ({count} transactions)."

    elif intent == "suggestion":
        shopping_list_items = data.get("shopping_list_items", [])
        pantry_items = data.get("pantry_items", [])
        total_count = data.get("total_count", 0)

        if total_count == 0:
            return "Your shopping list is empty and your pantry is fully stocked! No shopping needed right now."

        parts = []

        # Shopping list items
        if shopping_list_items:
            shopping_names = []
            for item in shopping_list_items:
                name = item["name"]
                qty = item.get("quantity")
                unit = item.get("unit")
                if qty and qty != 1:
                    name = f"{name} ({qty} {unit or 'units'})"
                elif unit:
                    name = f"{name} ({unit})"
                shopping_names.append(name)
            parts.append(f"Shopping List:\n- " + "\n- ".join(shopping_names))

        # Pantry items (low/out of stock)
        if pantry_items:
            out_of_stock = [i["name"] for i in pantry_items if i.get("status") == "out_of_stock"]
            low = [i["name"] for i in pantry_items if i.get("status") == "low"]

            pantry_parts = []
            if out_of_stock:
                pantry_parts.append(f"Out of stock: {', '.join(out_of_stock)}")
            if low:
                pantry_parts.append(f"Running low: {', '.join(low)}")

            if pantry_parts:
                parts.append(f"From Pantry:\n" + "\n".join(pantry_parts))

        return "\n\n".join(parts)

    elif intent == "shopping_complete":
        removed_items = data.get("removed_items", [])
        removed_count = data.get("removed_count", 0)
        message = data.get("message")

        if message:
            return message

        if removed_count == 0:
            return "I didn't find any matching items in your shopping list to remove."

        return f"Removed {removed_count} item(s) from your shopping list: {', '.join(removed_items)}"

    elif intent == "general":
        return ("I can help you with:\n"
                "- Log expenses: 'I spent $20 at Walmart'\n"
                "- Check pantry: 'How many eggs do I have?'\n"
                "- Track spending: 'How much did I spend this month?'\n"
                "- Get suggestions: 'What should I get from the store?'")

    return "I'm not sure how to help with that. Try asking about expenses, pantry items, or shopping suggestions."


# ============================================================================
# MAIN CHAT ENDPOINT
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
@limiter.limit("30/minute")
async def chat(
    request: Request,
    chat_request: ChatRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """
    Unified chat endpoint for the conversational voice assistant.
    Detects intent and routes to appropriate handler.
    """
    message = chat_request.message.strip()

    if not message:
        raise HTTPException(status_code=400, detail="Empty message")

    # Step 1: Detect intent
    intent_result = detect_intent(message)
    intent = intent_result.get("intent", "general")
    sub_intent = intent_result.get("sub_intent")
    entities = intent_result.get("entities", {})

    # Step 2: Handle based on intent
    user_id = current_user["id"]
    data = {}

    if intent == "expense_input":
        # Return indication that this should be routed to expense extraction
        return ChatResponse(
            intent=intent,
            sub_intent=sub_intent,
            response_text="",
            data={"route_to_expense": True, "original_message": message}
        )

    elif intent == "pantry_query":
        data = await handle_pantry_query(user_id, sub_intent, entities)

    elif intent == "expense_query":
        data = await handle_expense_query(user_id, sub_intent, entities)

    elif intent == "suggestion":
        data = await handle_suggestion(user_id, sub_intent, entities)

    elif intent == "shopping_complete":
        data = await handle_shopping_complete(user_id, entities, message)

    else:  # general
        pass

    # Step 3: Generate response
    response_text = generate_response(intent, sub_intent, data, entities)

    return ChatResponse(
        intent=intent,
        sub_intent=sub_intent,
        response_text=response_text,
        data=data
    )
