# ============================================================================
# CALENDAR ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime
from typing import Optional

from config import supabase
from auth import get_current_user_dependency
from schemas import CalendarEventCreate, CalendarEventUpdate

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# ----------------------------------------------------------------------------
# Calendar Event Endpoints
# ----------------------------------------------------------------------------

@router.get("/calendar")
@limiter.limit("60/minute")
async def get_calendar_events(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """Get calendar events for the current user, optionally filtered by month/year"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    query = supabase.table("calendar_events").select("*").eq("user_id", current_user["id"])

    # Filter by month/year if provided
    if month is not None and year is not None:
        # Get events that fall within the specified month
        start_of_month = f"{year}-{month:02d}-01"
        if month == 12:
            end_of_month = f"{year + 1}-01-01"
        else:
            end_of_month = f"{year}-{month + 1:02d}-01"

        # Get events where start_date falls in the month OR end_date falls in the month
        # or event spans the entire month
        query = query.or_(
            f"start_date.gte.{start_of_month},start_date.lt.{end_of_month},"
            f"end_date.gte.{start_of_month},end_date.lt.{end_of_month},"
            f"and(start_date.lt.{start_of_month},end_date.gte.{end_of_month})"
        )

    query = query.order("start_date", desc=False).order("start_time", desc=False)
    response = query.execute()

    return {"events": response.data or [], "count": len(response.data or [])}


@router.post("/calendar")
@limiter.limit("30/minute")
async def create_calendar_event(
    request: Request,
    event: CalendarEventCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new calendar event"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        event_data = {
            "user_id": current_user["id"],
            "title": event.title,
            "description": event.description,
            "start_date": event.start_date,
            "start_time": event.start_time,
            "end_date": event.end_date or event.start_date,
            "end_time": event.end_time,
            "all_day": event.all_day,
            "color": event.color,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }

        response = supabase.table("calendar_events").insert(event_data).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create event")

        return {
            "event": response.data[0],
            "message": "Event created successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create event: {str(e)}")


@router.put("/calendar/{event_id}")
@limiter.limit("30/minute")
async def update_calendar_event(
    request: Request,
    event_id: int,
    event_update: CalendarEventUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update a calendar event (only if it belongs to the current user)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Check if event exists and belongs to user
    check_response = supabase.table("calendar_events").select("id").eq("id", event_id).eq("user_id", current_user["id"]).execute()
    if not check_response.data:
        raise HTTPException(status_code=404, detail="Event not found")

    # Build update dictionary with only provided fields
    update_data = {}

    if event_update.title is not None:
        update_data["title"] = event_update.title
    if event_update.description is not None:
        update_data["description"] = event_update.description
    if event_update.start_date is not None:
        update_data["start_date"] = event_update.start_date
    if event_update.start_time is not None:
        update_data["start_time"] = event_update.start_time
    if event_update.end_date is not None:
        update_data["end_date"] = event_update.end_date
    if event_update.end_time is not None:
        update_data["end_time"] = event_update.end_time
    if event_update.all_day is not None:
        update_data["all_day"] = event_update.all_day
    if event_update.color is not None:
        update_data["color"] = event_update.color

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.now().isoformat()

    response = supabase.table("calendar_events").update(update_data).eq("id", event_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to update event")

    return {
        "event": response.data[0],
        "message": "Event updated successfully"
    }


@router.delete("/calendar/{event_id}")
@limiter.limit("30/minute")
async def delete_calendar_event(
    request: Request,
    event_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a calendar event"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("calendar_events").delete().eq("id", event_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Event not found")

    return {"message": "Event deleted successfully"}
