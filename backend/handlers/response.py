# ============================================================================
# RESPONSE GENERATION
# ============================================================================


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

    elif intent == "pantry_add":
        added_items = data.get("added_items", [])
        added_count = data.get("added_count", 0)
        message = data.get("message")

        if message:
            return message

        if added_count == 0:
            return "I couldn't identify any items to add to your pantry."

        item_names = [item["name"] for item in added_items]
        return f"Added {added_count} item(s) to your pantry: {', '.join(item_names)}"

    elif intent == "meal_suggestion":
        meals = data.get("meals", [])
        message = data.get("message")

        if message:
            return message

        if not meals:
            return "I couldn't generate meal suggestions. Please try again."

        meal_type = data.get("meal_type")
        meal_type_label = meal_type.capitalize() if meal_type else "Meal"

        expiring_items = data.get("expiring_items", [])
        parts = []
        if expiring_items:
            parts.append(f"Using up expiring items: {', '.join(expiring_items)}")
        parts.append(f"Here are 3 {meal_type_label.lower()} ideas based on your {data.get('pantry_count', 0)} pantry items:")
        for i, meal in enumerate(meals, 1):
            time_str = f" ({meal.get('time_minutes', '?')} min)" if meal.get('time_minutes') else ""
            parts.append(f"{i}. {meal['name']}{time_str}")
        return "\n".join(parts)

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
                "- Add to pantry: 'I have flour, oil, and salt'\n"
                "- Track spending: 'How much did I spend this month?'\n"
                "- Get suggestions: 'What should I get from the store?'\n"
                "- Meal ideas: 'What can I cook for breakfast?'")

    return "I'm not sure how to help with that. Try asking about expenses, pantry items, or shopping suggestions."
