# ============================================================================
# GOOGLE CALENDAR INTEGRATION ROUTES
# ============================================================================
import os
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timedelta
from typing import Optional
import httpx

from config import supabase
from auth import get_current_user_dependency
from schemas import (
    GoogleCalendarAuthUrlResponse,
    GoogleCalendarCallbackRequest,
    GoogleCalendarStatusResponse,
    GoogleCalendarImportRequest,
    GoogleCalendarImportResponse,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

# Google OAuth configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:5173/auth/google-calendar/callback")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Scopes for Google Calendar read-only access
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly", "email"]


def check_google_credentials():
    """Check if Google OAuth credentials are configured"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Google Calendar integration is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )


# ----------------------------------------------------------------------------
# OAuth Endpoints
# ----------------------------------------------------------------------------

@router.get("/google-calendar/auth-url", response_model=GoogleCalendarAuthUrlResponse)
@limiter.limit("30/minute")
async def get_auth_url(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Generate Google OAuth authorization URL"""
    check_google_credentials()

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": current_user["id"],  # Pass user ID as state for security
    }

    query_string = "&".join(f"{k}={v}" for k, v in params.items())
    auth_url = f"{GOOGLE_AUTH_URL}?{query_string}"

    return {"auth_url": auth_url}


@router.post("/google-calendar/callback")
@limiter.limit("10/minute")
async def handle_callback(
    request: Request,
    callback_data: GoogleCalendarCallbackRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Exchange authorization code for tokens and store them"""
    check_google_credentials()

    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Verify state matches current user
    if callback_data.state != current_user["id"]:
        raise HTTPException(status_code=400, detail="Invalid state parameter")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": callback_data.code,
                "grant_type": "authorization_code",
                "redirect_uri": GOOGLE_REDIRECT_URI,
            },
        )

        if token_response.status_code != 200:
            error_detail = token_response.json().get("error_description", "Failed to exchange code for tokens")
            raise HTTPException(status_code=400, detail=error_detail)

        tokens = token_response.json()

        # Get user info to retrieve email
        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )

        google_email = None
        if userinfo_response.status_code == 200:
            userinfo = userinfo_response.json()
            google_email = userinfo.get("email")

    # Calculate token expiry
    expires_in = tokens.get("expires_in", 3600)
    token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)

    # Store or update tokens in database
    token_data = {
        "user_id": current_user["id"],
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "token_expiry": token_expiry.isoformat(),
        "google_email": google_email,
        "connected_at": datetime.utcnow().isoformat(),
    }

    # Upsert: update if exists, insert if not
    existing = supabase.table("google_calendar_tokens").select("id").eq("user_id", current_user["id"]).execute()

    if existing.data:
        # Update existing record
        response = supabase.table("google_calendar_tokens").update(token_data).eq("user_id", current_user["id"]).execute()
    else:
        # Insert new record
        response = supabase.table("google_calendar_tokens").insert(token_data).execute()

    if not response.data:
        raise HTTPException(status_code=500, detail="Failed to store tokens")

    return {
        "message": "Google Calendar connected successfully",
        "google_email": google_email,
    }


@router.get("/google-calendar/status", response_model=GoogleCalendarStatusResponse)
@limiter.limit("60/minute")
async def get_connection_status(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Check if user has connected Google Calendar"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("google_calendar_tokens").select("google_email, connected_at, token_expiry").eq("user_id", current_user["id"]).execute()

    if not response.data:
        return {
            "connected": False,
            "google_email": None,
            "connected_at": None,
        }

    token_data = response.data[0]
    return {
        "connected": True,
        "google_email": token_data.get("google_email"),
        "connected_at": token_data.get("connected_at"),
    }


async def refresh_access_token(user_id: str, refresh_token: str) -> Optional[str]:
    """Refresh an expired access token"""
    check_google_credentials()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )

        if response.status_code != 200:
            return None

        tokens = response.json()
        new_access_token = tokens["access_token"]
        expires_in = tokens.get("expires_in", 3600)
        token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)

        # Update token in database
        supabase.table("google_calendar_tokens").update({
            "access_token": new_access_token,
            "token_expiry": token_expiry.isoformat(),
        }).eq("user_id", user_id).execute()

        return new_access_token


async def get_valid_access_token(user_id: str) -> Optional[str]:
    """Get a valid access token, refreshing if necessary"""
    if supabase is None:
        return None

    response = supabase.table("google_calendar_tokens").select("access_token, refresh_token, token_expiry").eq("user_id", user_id).execute()

    if not response.data:
        return None

    token_data = response.data[0]
    token_expiry = datetime.fromisoformat(token_data["token_expiry"].replace("Z", "+00:00"))

    # Check if token is expired (with 5 minute buffer)
    if datetime.utcnow().replace(tzinfo=token_expiry.tzinfo) > token_expiry - timedelta(minutes=5):
        # Token expired, refresh it
        new_token = await refresh_access_token(user_id, token_data["refresh_token"])
        if new_token:
            return new_token
        return None

    return token_data["access_token"]


@router.post("/google-calendar/import", response_model=GoogleCalendarImportResponse)
@limiter.limit("10/minute")
async def import_events(
    request: Request,
    import_request: GoogleCalendarImportRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Import events from Google Calendar"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    access_token = await get_valid_access_token(current_user["id"])
    if not access_token:
        raise HTTPException(status_code=401, detail="Google Calendar not connected or token expired. Please reconnect.")

    # Calculate time range
    if import_request.time_min:
        time_min = import_request.time_min
    else:
        # Default to start of current month
        now = datetime.utcnow()
        time_min = datetime(now.year, now.month, 1).isoformat() + "Z"

    if import_request.time_max:
        time_max = import_request.time_max
    else:
        # Default to 3 months from now
        now = datetime.utcnow()
        time_max = (now + timedelta(days=90)).isoformat() + "Z"

    # Fetch events from Google Calendar
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
        )

        if response.status_code == 401:
            raise HTTPException(status_code=401, detail="Google Calendar token expired. Please reconnect.")

        if response.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to fetch events from Google Calendar")

        data = response.json()
        google_events = data.get("items", [])

    # Import events into our calendar
    imported_count = 0
    skipped_count = 0

    for event in google_events:
        try:
            # Parse event data
            summary = event.get("summary", "Untitled Event")
            description = event.get("description", "")

            # Handle start/end times
            start = event.get("start", {})
            end = event.get("end", {})

            # Check if all-day event
            if "date" in start:
                # All-day event
                start_date = start["date"]
                end_date = end.get("date", start_date)
                # Adjust end date (Google uses exclusive end date for all-day events)
                end_dt = datetime.strptime(end_date, "%Y-%m-%d") - timedelta(days=1)
                end_date = end_dt.strftime("%Y-%m-%d")
                start_time = None
                end_time = None
                all_day = True
            else:
                # Timed event
                start_datetime = start.get("dateTime", "")
                end_datetime = end.get("dateTime", "")

                # Parse ISO datetime
                start_dt = datetime.fromisoformat(start_datetime.replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(end_datetime.replace("Z", "+00:00"))

                start_date = start_dt.strftime("%Y-%m-%d")
                end_date = end_dt.strftime("%Y-%m-%d")
                start_time = start_dt.strftime("%H:%M")
                end_time = end_dt.strftime("%H:%M")
                all_day = False

            # Check for duplicates (same title and start date/time)
            existing_query = supabase.table("calendar_events").select("id").eq("user_id", current_user["id"]).eq("title", summary).eq("start_date", start_date)

            if start_time:
                existing_query = existing_query.eq("start_time", start_time)

            existing = existing_query.execute()

            if existing.data:
                skipped_count += 1
                continue

            # Create calendar event
            event_data = {
                "user_id": current_user["id"],
                "title": summary[:255] if summary else "Untitled Event",
                "description": description[:1000] if description else None,
                "start_date": start_date,
                "start_time": start_time,
                "end_date": end_date,
                "end_time": end_time,
                "all_day": all_day,
                "color": "#4285f4",  # Google blue
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }

            supabase.table("calendar_events").insert(event_data).execute()
            imported_count += 1

        except Exception as e:
            print(f"Error importing event: {e}")
            skipped_count += 1
            continue

    return {
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "message": f"Imported {imported_count} events, skipped {skipped_count} duplicates",
    }


@router.delete("/google-calendar/disconnect")
@limiter.limit("10/minute")
async def disconnect(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Disconnect Google Calendar (remove stored tokens)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("google_calendar_tokens").delete().eq("user_id", current_user["id"]).execute()

    return {"message": "Google Calendar disconnected successfully"}
