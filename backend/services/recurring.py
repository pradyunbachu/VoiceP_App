"""Recurring expense materialization service.

Called on app startup (via lifespan) and on-demand via POST /recurring/process.

process_due_recurring_expenses() scans all parent recurring expenses
(is_recurring=1, parent_recurring_id IS NULL), calculates the next due date
from the most recent occurrence, and creates new child expense rows for every
period that has elapsed. Supports daily, weekly, monthly, and yearly intervals.

Duplicate detection prevents double-creation if the function runs multiple
times on the same day.
"""

# ============================================================================
# RECURRING EXPENSE SERVICE
# ============================================================================
import calendar
from datetime import datetime, timedelta
from config import supabase
import logging

logger = logging.getLogger(__name__)

# Safety limit: max number of catch-up entries per recurring expense per run
MAX_CATCHUP_ITERATIONS = 52

def process_due_recurring_expenses(user_id=None):
    """Check for recurring expenses that are due and create new entries.

    This function should be called periodically (e.g., on app startup, daily cron job).
    It looks at all recurring expenses and creates new entries for any that are due.
    When user_id is provided, only processes that user's recurring expenses.
    """
    if supabase is None:
        logger.warning("Supabase not configured, skipping recurring expense processing")
        return

    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")

    # Get recurring expenses (parent expenses only - no parent_recurring_id)
    query = supabase.table("expenses").select("*").eq("is_recurring", 1).is_("parent_recurring_id", "null")
    if user_id:
        query = query.eq("user_id", user_id)
    response = query.execute()
    recurring_expenses = response.data if response.data else []

    created_count = 0

    for expense_dict in recurring_expenses:
        expense_user_id = expense_dict["user_id"]
        recurring_interval = expense_dict.get("recurring_interval", 1)
        recurring_unit = expense_dict.get("recurring_unit", "months")

        # Guard: skip invalid intervals to prevent infinite loops
        if not recurring_interval or recurring_interval <= 0:
            continue

        # Parse the original expense date
        try:
            original_date = datetime.strptime(expense_dict["date"], "%Y-%m-%d").date()
        except (ValueError, TypeError, KeyError):
            continue

        # Remember the original day-of-month for monthly recurrence to avoid drift
        original_day = original_date.day

        # Find the most recent occurrence for this recurring expense
        recent_response = supabase.table("expenses").select("date").or_(f"id.eq.{expense_dict['id']},parent_recurring_id.eq.{expense_dict['id']}").order("date", desc=True).limit(1).execute()

        if recent_response.data and recent_response.data[0].get("date"):
            try:
                last_date = datetime.strptime(recent_response.data[0]["date"], "%Y-%m-%d").date()
            except (ValueError, TypeError):
                last_date = original_date
        else:
            last_date = original_date

        # Calculate next due date
        next_due = _advance_date(last_date, recurring_interval, recurring_unit, original_day)
        if next_due is None:
            continue

        # Create new expense if due date has arrived (today or past)
        iterations = 0
        while next_due <= today and iterations < MAX_CATCHUP_ITERATIONS:
            iterations += 1
            next_due_str = next_due.strftime("%Y-%m-%d")

            # Check if this expense already exists for this date
            check_response = supabase.table("expenses").select("id").eq("user_id", expense_user_id).eq("store", expense_dict["store"]).eq("items", expense_dict["items"]).eq("date", next_due_str).or_(f"id.eq.{expense_dict['id']},parent_recurring_id.eq.{expense_dict['id']}").execute()

            if not check_response.data:
                # Create the new recurring expense entry
                try:
                    insert_response = supabase.table("expenses").insert({
                        "user_id": expense_user_id,
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

                    if insert_response.data:
                        created_count += 1
                except Exception as e:
                    logger.error("Error creating recurring expense: %s", e)

            # Advance to next due date
            next_due = _advance_date(next_due, recurring_interval, recurring_unit, original_day)
            if next_due is None:
                break

    return created_count


def _advance_date(from_date, interval, unit, original_day=None):
    """Advance a date by the given recurring interval.

    For monthly recurrence, uses original_day to avoid permanent drift
    (e.g., Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
    For yearly recurrence, handles Feb 29 -> Feb 28 gracefully.
    """
    if unit == "days":
        return from_date + timedelta(days=interval)
    elif unit == "weeks":
        return from_date + timedelta(weeks=interval)
    elif unit == "months":
        month = from_date.month + interval
        year = from_date.year
        while month > 12:
            month -= 12
            year += 1
        # Use the original day-of-month, clamped to the target month's max
        target_day = original_day if original_day else from_date.day
        max_day = calendar.monthrange(year, month)[1]
        day = min(target_day, max_day)
        return from_date.replace(year=year, month=month, day=day)
    elif unit == "years":
        target_year = from_date.year + interval
        # Handle Feb 29 -> Feb 28 for non-leap years
        if from_date.month == 2 and from_date.day == 29:
            max_day = calendar.monthrange(target_year, 2)[1]
            return from_date.replace(year=target_year, day=max_day)
        return from_date.replace(year=target_year)
    else:
        return None
