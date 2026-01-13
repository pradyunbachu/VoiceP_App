# ============================================================================
# RECURRING EXPENSE SERVICE
# ============================================================================
from datetime import datetime, timedelta
from config import supabase

def process_due_recurring_expenses():
    """Check for recurring expenses that are due and create new entries.

    This function should be called periodically (e.g., on app startup, daily cron job).
    It looks at all recurring expenses and creates new entries for any that are due.
    """
    if supabase is None:
        print("Supabase not configured, skipping recurring expense processing")
        return

    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")

    # Get all recurring expenses (parent expenses only - no parent_recurring_id)
    response = supabase.table("expenses").select("*").eq("is_recurring", 1).is_("parent_recurring_id", "null").execute()
    recurring_expenses = response.data if response.data else []

    created_count = 0

    for expense_dict in recurring_expenses:
        user_id = expense_dict["user_id"]
        recurring_interval = expense_dict.get("recurring_interval", 1)
        recurring_unit = expense_dict.get("recurring_unit", "months")

        # Parse the original expense date
        try:
            original_date = datetime.strptime(expense_dict["date"], "%Y-%m-%d").date()
        except:
            continue

        # Find the most recent occurrence for this recurring expense
        response = supabase.table("expenses").select("date").or_(f"id.eq.{expense_dict['id']},parent_recurring_id.eq.{expense_dict['id']}").order("date", desc=True).limit(1).execute()

        if response.data and response.data[0].get("date"):
            try:
                last_date = datetime.strptime(response.data[0]["date"], "%Y-%m-%d").date()
            except:
                last_date = original_date
        else:
            last_date = original_date

        # Calculate next due date
        if recurring_unit == "days":
            next_due = last_date + timedelta(days=recurring_interval)
        elif recurring_unit == "weeks":
            next_due = last_date + timedelta(weeks=recurring_interval)
        elif recurring_unit == "months":
            month = last_date.month + recurring_interval
            year = last_date.year
            while month > 12:
                month -= 12
                year += 1
            day = min(last_date.day, 28)
            next_due = last_date.replace(year=year, month=month, day=day)
        elif recurring_unit == "years":
            next_due = last_date.replace(year=last_date.year + recurring_interval)
        else:
            continue

        # Create new expense if due date has arrived (today or past)
        while next_due <= today:
            next_due_str = next_due.strftime("%Y-%m-%d")

            # Check if this expense already exists for this date
            check_response = supabase.table("expenses").select("id").eq("user_id", user_id).eq("store", expense_dict["store"]).eq("items", expense_dict["items"]).eq("date", next_due_str).or_(f"id.eq.{expense_dict['id']},parent_recurring_id.eq.{expense_dict['id']}").execute()

            if not check_response.data:
                # Create the new recurring expense entry
                response = supabase.table("expenses").insert({
                    "user_id": user_id,
                    "store": expense_dict["store"],
                    "items": expense_dict["items"],
                    "category": expense_dict.get("category"),
                    "amount": expense_dict["amount"],
                    "date": next_due_str,
                    "created_at": datetime.now().isoformat(),
                    "is_recurring": 1,
                    "recurring_interval": recurring_interval,
                    "recurring_unit": recurring_unit,
                    "parent_recurring_id": expense_dict["id"]
                }).execute()

                if response.data:
                    created_count += 1

            # Calculate next due date for the loop
            if recurring_unit == "days":
                next_due = next_due + timedelta(days=recurring_interval)
            elif recurring_unit == "weeks":
                next_due = next_due + timedelta(weeks=recurring_interval)
            elif recurring_unit == "months":
                month = next_due.month + recurring_interval
                year = next_due.year
                while month > 12:
                    month -= 12
                    year += 1
                day = min(next_due.day, 28)
                next_due = next_due.replace(year=year, month=month, day=day)
            elif recurring_unit == "years":
                next_due = next_due.replace(year=next_due.year + recurring_interval)
            else:
                break

    return created_count
