"""Natural-language response generation for the chat assistant.

Takes the resolved intent, sub-intent, handler data payload, and extracted
entities, and produces a human-readable reply string. Each intent branch
formats the data differently — e.g. pantry_query shows item counts and
stock status, expense_query shows dollar totals with transaction counts,
meal_suggestion lists numbered recipe ideas, etc.

Called as the final step of the chat pipeline:
  intent detection → domain handler → generate_response()
"""

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

    elif intent == "pantry_remove":
        message = data.get("message")
        if message:
            return message
        removed = data.get("removed_items", [])
        count = data.get("removed_count", 0)
        if count == 0:
            return "I couldn't find that item in your pantry."
        return f"Removed {count} item(s) from your pantry: {', '.join(removed)}"

    elif intent == "cooking_deduct":
        message = data.get("message")
        if message:
            return message
        recipe = data.get("recipe_name", "your recipe")
        deducted = data.get("deducted_items", [])
        count = data.get("deducted_count", 0)
        if count == 0:
            return f"I couldn't match any pantry items to '{recipe}'."
        item_summaries = []
        for d in deducted:
            item_summaries.append(f"{d['name']} ({d['old_quantity']} -> {d['new_quantity']})")
        return f"Cooking {recipe}! Updated {count} pantry item(s):\n" + "\n".join(f"- {s}" for s in item_summaries)

    elif intent == "expense_query":
        query_type = data.get("query_type")

        if query_type == "spending_comparison":
            message = data.get("message")
            if message:
                return message
            current = data.get("current_total", 0)
            previous = data.get("previous_total", 0)
            diff = data.get("difference", 0)
            pct = data.get("percentage_change", 0)
            direction = "more" if diff > 0 else "less"
            return (f"This month: ${current:.2f} ({data.get('current_count', 0)} transactions)\n"
                    f"Last month: ${previous:.2f} ({data.get('previous_count', 0)} transactions)\n"
                    f"You're spending ${abs(diff):.2f} {direction} ({abs(pct):.1f}% {'increase' if diff > 0 else 'decrease'}).")

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

    elif intent == "store_trip":
        message = data.get("message")
        if message:
            return message
        store = data.get("store", "the store")
        added = data.get("added_items", [])
        count = data.get("added_count", 0)
        amount = data.get("expense_amount")
        skipped = data.get("skipped_items", [])
        skipped_count = data.get("skipped_count", 0)
        parts = []
        if count > 0:
            amount_str = f" (${amount})" if amount else ""
            parts.append(f"Welcome back from {store}{amount_str}! Added {count} item(s) to your pantry: {', '.join(added)}")
        else:
            parts.append(f"Welcome back from {store}! No items to add to your pantry.")
        if skipped_count > 0:
            parts.append(f"Skipped {skipped_count} non-pantry item(s): {', '.join(skipped)}")
        return "\n".join(parts)

    elif intent == "mark_subscription":
        message = data.get("message")
        if message:
            return message
        name = data.get("expense_name", "expense")
        amount = data.get("expense_amount")
        amount_str = f" (${amount})" if amount else ""
        return f"Marked '{name}'{amount_str} as a recurring subscription."

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

        skipped_items = data.get("skipped_items", [])
        skipped_count = data.get("skipped_count", 0)

        if added_count == 0 and skipped_count == 0:
            return "I couldn't identify any items to add to your pantry."

        parts = []
        if added_count > 0:
            item_names = [item["name"] for item in added_items]
            parts.append(f"Added {added_count} item(s) to your pantry: {', '.join(item_names)}")
        if skipped_count > 0:
            parts.append(f"Skipped {skipped_count} non-pantry item(s): {', '.join(skipped_items)}")
        return "\n".join(parts)

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
        pantry_added = data.get("pantry_added", [])
        pantry_added_count = data.get("pantry_added_count", 0)
        message = data.get("message")

        if message:
            return message

        pantry_skipped = data.get("pantry_skipped", [])
        pantry_skipped_count = data.get("pantry_skipped_count", 0)

        parts = []
        if removed_count > 0:
            parts.append(f"Removed {removed_count} item(s) from your shopping list: {', '.join(removed_items)}")
        if pantry_added_count > 0:
            parts.append(f"Added {pantry_added_count} item(s) to your pantry: {', '.join(pantry_added)}")
        if pantry_skipped_count > 0:
            parts.append(f"Skipped {pantry_skipped_count} non-pantry item(s): {', '.join(pantry_skipped)}")

        if not parts:
            return "I didn't find any matching items in your shopping list to remove."

        return "\n".join(parts)

    elif intent == "shopping_list_add":
        message = data.get("message")
        if message:
            return message
        added = data.get("added_items", [])
        count = data.get("added_count", 0)
        if count == 0:
            return "I couldn't identify any items to add to your shopping list."
        item_names = [item["name"] for item in added]
        return f"Added {count} item(s) to your shopping list: {', '.join(item_names)}"

    elif intent == "budget_set":
        message = data.get("message")
        if message:
            return message
        amount = data.get("amount", 0)
        category = data.get("category", "Groceries")
        month_num = data.get("month")
        year = data.get("year", "")
        month_names = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ]
        month_label = month_names[month_num - 1] if month_num and 1 <= month_num <= 12 else ""
        period = f"{month_label} {year}".strip()
        updated = data.get("updated", False)
        if updated:
            old = data.get("old_amount", 0)
            return f"Updated your {category} budget from ${old:.2f} to ${amount:.2f} for {period}."
        return f"Budget set! ${amount:.2f} for {category} for {period}."

    elif intent == "reminder_check":
        message = data.get("message")
        if message:
            return message
        name = data.get("item_name", "item")
        qty = data.get("quantity", 1)
        unit = data.get("unit") or ""
        status = data.get("stock_status", "full")
        exp = data.get("expiration_date")
        days = data.get("days_until_expiry")

        parts = [f"{name}: {qty} {unit} ({status} stock)"]
        if exp and days is not None:
            if days < 0:
                parts.append(f"Expired {abs(days)} day(s) ago! Use it ASAP or discard.")
            elif days == 0:
                parts.append("Expires TODAY! Use it now.")
            elif days <= 3:
                parts.append(f"Expires in {days} day(s) — use it soon!")
            else:
                parts.append(f"Expires on {exp} ({days} days from now).")
        elif not exp:
            parts.append("No expiration date set.")
        return "\n".join(parts)

    elif intent == "share_list":
        message = data.get("message")
        if message:
            return message
        target = data.get("shared_with", "user")
        return f"Shopping list shared with {target}! They can now view and edit the list."

    elif intent == "meal_plan_week":
        message = data.get("message")
        if message:
            return message
        meal_plan = data.get("meal_plan", [])
        if not meal_plan:
            return "I couldn't generate a weekly meal plan. Please try again."
        expiring = data.get("expiring_items", [])
        parts = []
        if expiring:
            parts.append(f"Prioritizing expiring items: {', '.join(expiring)}")
        parts.append(f"Here's your 7-day meal plan based on {data.get('pantry_count', 0)} pantry items:\n")
        for day in meal_plan:
            day_name = day.get("day", "Day")
            b = day.get("breakfast", {}).get("name", "—")
            l = day.get("lunch", {}).get("name", "—")
            d = day.get("dinner", {}).get("name", "—")
            parts.append(f"{day_name}: {b} / {l} / {d}")
        return "\n".join(parts)

    elif intent == "budget_meal":
        message = data.get("message")
        if message:
            return message
        meals = data.get("meals", [])
        limit = data.get("price_limit", 10)
        if not meals:
            return "I couldn't generate budget meal suggestions. Please try again."
        parts = [f"Here are 3 meals you can make for under ${limit:.2f}:"]
        for i, meal in enumerate(meals, 1):
            cost = meal.get("estimated_cost") or meal.get("buy_cost_estimate", "?")
            cost_str = f"${cost:.2f}" if isinstance(cost, (int, float)) else f"${cost}"
            parts.append(f"{i}. {meal['name']} (~{cost_str})")
            on_hand = meal.get("ingredients_on_hand", [])
            to_buy = meal.get("ingredients_to_buy", [])
            if on_hand:
                parts.append(f"   Have: {', '.join(on_hand)}")
            if to_buy:
                parts.append(f"   Need: {', '.join(to_buy)}")
        return "\n".join(parts)

    elif intent == "expense_delete":
        message = data.get("message")
        if message:
            return message
        deleted = data.get("deleted_expense", {})
        store = deleted.get("store", "Unknown")
        amount = deleted.get("amount")
        items = deleted.get("items", "")
        date = deleted.get("date", "")
        amount_str = f"${amount:.2f}" if amount else ""
        parts = [f"Deleted expense: {store} {amount_str}"]
        if items:
            parts.append(f"Items: {items}")
        if date:
            parts.append(f"Date: {date}")
        return "\n".join(parts)

    elif intent == "budget_query":
        message = data.get("message")
        if message:
            return message
        budgets = data.get("budgets", [])
        if not budgets:
            return "You don't have any budgets set for this month."
        parts = [f"Budget status for this month ({len(budgets)} budget{'s' if len(budgets) != 1 else ''}):"]
        for b in budgets:
            cat = b.get("category", "General")
            amount = b.get("amount", 0)
            spent = b.get("actual_spending", 0)
            remaining = b.get("remaining", 0)
            pct = b.get("percentage_used", 0)
            status = "Over budget!" if remaining < 0 else "On track"
            parts.append(f"- {cat}: ${spent:.2f} / ${amount:.2f} ({pct:.0f}% used) — {status}")
        return "\n".join(parts)

    elif intent == "shopping_list_remove":
        message = data.get("message")
        if message:
            return message
        removed = data.get("removed_items", [])
        count = data.get("removed_count", 0)
        if count == 0:
            return "I couldn't find those items in your shopping list."
        return f"Removed {count} item(s) from your shopping list: {', '.join(removed)}"

    elif intent == "shopping_clear":
        message = data.get("message")
        if message:
            return message
        count = data.get("cleared_count", 0)
        if count == 0:
            return "Your shopping list is already empty."
        return f"Shopping list cleared! Removed {count} item(s)."

    elif intent == "general":
        return ("I can help you with:\n"
                "- Log expenses: 'I spent $20 at Walmart'\n"
                "- Delete expenses: 'Delete my last expense'\n"
                "- Check pantry: 'How many eggs do I have?'\n"
                "- Add to pantry: 'I have flour, oil, and salt'\n"
                "- Remove from pantry: 'Remove chicken from my pantry'\n"
                "- Track spending: 'How much did I spend this month?'\n"
                "- Compare spending: 'How does this month compare?'\n"
                "- Check budget: 'What's my grocery budget?'\n"
                "- Set budget: 'Set a $200 budget for groceries'\n"
                "- Get suggestions: 'What should I get from the store?'\n"
                "- Meal ideas: 'What can I cook for breakfast?'\n"
                "- Add to shopping list: 'Add milk to my shopping list'\n"
                "- Remove from list: 'Remove milk from my shopping list'\n"
                "- Clear list: 'Clear my shopping list'\n"
                "- Store trip: 'I just got back from Costco'\n"
                "- Cook & deduct: 'I'm cooking the chicken stir-fry'\n"
                "- Check items: 'Remind me to use the avocados'\n"
                "- Share list: 'Share my shopping list with Sarah'\n"
                "- Weekly plan: 'Plan my meals for the week'\n"
                "- Budget meals: 'What can I make under $10?'\n"
                "- Subscriptions: 'Log that as a subscription'")

    return "I'm not sure how to help with that. Try asking about expenses, pantry items, or shopping suggestions."
