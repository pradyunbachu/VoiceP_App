"""User streak routes.

GET /user/streak — Returns the user's current and longest expense logging
    streaks, total expense count, and last logged date. Streaks are
    calculated from consecutive days with at least one expense entry.
"""

from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timedelta

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from cache import api_cache, make_cache_key
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/user/streak")
@limiter.limit("30/minute")
async def get_user_streak(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Get the user's expense logging streak data."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    cache_key = make_cache_key(user_id, "streak")
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        response = supabase.table("expenses") \
            .select("date") \
            .eq("user_id", user_id) \
            .order("date", desc=True) \
            .execute()

        if not response.data:
            result = {
                "current_streak": 0,
                "longest_streak": 0,
                "total_expenses": 0,
                "last_logged_date": None,
            }
            api_cache.set(cache_key, result, ttl=120)
            return result

        total_expenses = len(response.data)

        # Deduplicate dates and sort descending
        unique_dates = sorted(
            {row["date"] for row in response.data},
            reverse=True,
        )
        date_objects = [datetime.strptime(d, "%Y-%m-%d").date() for d in unique_dates]

        last_logged_date = str(date_objects[0])
        today = datetime.now().date()

        # Current streak: consecutive days ending today or yesterday
        current_streak = 0
        if date_objects[0] >= today - timedelta(days=1):
            current_streak = 1
            for i in range(1, len(date_objects)):
                if date_objects[i] == date_objects[i - 1] - timedelta(days=1):
                    current_streak += 1
                else:
                    break

        # Longest streak: scan all dates for the longest consecutive run
        longest_streak = 1 if date_objects else 0
        run = 1
        for i in range(1, len(date_objects)):
            if date_objects[i] == date_objects[i - 1] - timedelta(days=1):
                run += 1
                if run > longest_streak:
                    longest_streak = run
            else:
                run = 1

        result = {
            "current_streak": current_streak,
            "longest_streak": longest_streak,
            "total_expenses": total_expenses,
            "last_logged_date": last_logged_date,
        }
        api_cache.set(cache_key, result, ttl=120)
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to calculate streak: %s", e)
        raise HTTPException(status_code=500, detail="Failed to calculate streak")
