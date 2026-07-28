"""Push notification routes.

POST   /notifications/subscribe       — Register a push subscription.
DELETE /notifications/unsubscribe     — Remove a push subscription.
GET    /notifications/vapid-public-key — Get the VAPID public key for the frontend.
POST   /notifications/send-dinner     — Trigger "What's for dinner?" notifications (cron/admin).
POST   /notifications/test            — Send a test notification to the current user.
"""

# ============================================================================
# PUSH NOTIFICATION ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import json

from config import supabase, groq_client, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CLAIMS_EMAIL
from auth import get_current_user_dependency
from rate_limit import limiter
from routes.pantry_sharing import scope_pantry_query

import logging
logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# HELPERS
# ============================================================================

def _send_push(subscription_info: dict, payload: dict) -> bool:
    """Send a push notification. Returns True on success."""
    if not VAPID_PRIVATE_KEY:
        logger.warning("VAPID private key not configured, skipping push")
        return False

    try:
        from pywebpush import webpush, WebPushException

        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
        )
        return True
    except Exception as e:
        error_str = str(e)
        # If subscription is expired/invalid, we should clean it up
        if "410" in error_str or "404" in error_str:
            logger.info("Push subscription expired, should be cleaned up")
        else:
            logger.error("Push notification error: %s", e)
        return False


def _generate_dinner_suggestion(ingredient_list: str, expiring_list: str) -> dict | None:
    """Generate a quick dinner suggestion using Groq."""
    if not groq_client:
        return None

    prompt = f"""Suggest ONE quick dinner recipe using these ingredients.

Available: {ingredient_list}
Expiring soon (PRIORITIZE): {expiring_list}

Return ONLY a JSON object:
{{"name": "Recipe Name", "description": "One enticing sentence about the dish", "time_minutes": 25}}

Keep it practical and appetizing. JSON only."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful dinner suggestion assistant. Respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
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
        logger.error("Dinner suggestion generation error: %s", e)
        return None


# ============================================================================
# SCHEMAS
# ============================================================================

class PushSubscription(BaseModel):
    endpoint: str
    keys: dict  # {p256dh: str, auth: str}
    timezone: Optional[str] = None


class UnsubscribeRequest(BaseModel):
    endpoint: str


# ============================================================================
# GET /notifications/vapid-public-key
# ============================================================================

@router.get("/notifications/vapid-public-key")
async def get_vapid_key():
    """Return the VAPID public key so the frontend can subscribe."""
    if not VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=500, detail="Push notifications not configured")
    return {"public_key": VAPID_PUBLIC_KEY}


# ============================================================================
# POST /notifications/subscribe
# ============================================================================

@router.post("/notifications/subscribe")
@limiter.limit("10/minute")
async def subscribe(
    body: PushSubscription,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Register a push subscription for the current user."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]
    tz = body.timezone or Intl_tz_fallback()

    # Upsert: update if endpoint already exists for this user
    row = {
        "user_id": user_id,
        "endpoint": body.endpoint,
        "p256dh": body.keys.get("p256dh", ""),
        "auth": body.keys.get("auth", ""),
        "timezone": tz,
        "dinner_enabled": True,
    }

    # Try to find existing
    existing = (
        supabase.table("push_subscriptions")
        .select("id")
        .eq("user_id", user_id)
        .eq("endpoint", body.endpoint)
        .execute()
    )

    if existing.data:
        supabase.table("push_subscriptions").update(row).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("push_subscriptions").insert(row).execute()

    return {"status": "subscribed"}


def Intl_tz_fallback() -> str:
    """Return a reasonable default timezone."""
    try:
        return datetime.now().astimezone().tzinfo.key  # type: ignore
    except Exception:
        return "UTC"


# ============================================================================
# DELETE /notifications/unsubscribe
# ============================================================================

@router.delete("/notifications/unsubscribe")
@limiter.limit("10/minute")
async def unsubscribe(
    body: UnsubscribeRequest,
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Remove a push subscription."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    supabase.table("push_subscriptions").delete().eq("user_id", user_id).eq("endpoint", body.endpoint).execute()

    return {"status": "unsubscribed"}


# ============================================================================
# POST /notifications/test — Send a test notification
# ============================================================================

@router.post("/notifications/test")
@limiter.limit("5/minute")
async def test_notification(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency),
):
    """Send a test push notification to the current user."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    subs = (
        supabase.table("push_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )

    if not subs.data:
        raise HTTPException(status_code=400, detail="No push subscriptions found. Enable notifications first.")

    sent = 0
    for sub in subs.data:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {
                "p256dh": sub["p256dh"],
                "auth": sub["auth"],
            },
        }

        payload = {
            "title": "Voxal",
            "body": "Notifications are working! You'll get dinner suggestions daily.",
            "tag": "voxal-test",
            "url": "/",
        }

        if _send_push(subscription_info, payload):
            sent += 1

    return {"sent": sent, "total_subscriptions": len(subs.data)}


# ============================================================================
# POST /notifications/send-dinner — Trigger dinner notifications (cron)
# ============================================================================

@router.post("/notifications/send-dinner")
@limiter.limit("2/minute")
async def send_dinner_notifications(
    request: Request,
    api_key: str = Query(None),
):
    """Send 'What's for dinner?' notifications to users whose local time is 4-5pm.

    This endpoint is designed to be called by an external cron job every hour.
    Protect with an API key in production.
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Fetch all subscriptions with dinner notifications enabled
    subs_resp = (
        supabase.table("push_subscriptions")
        .select("*")
        .eq("dinner_enabled", True)
        .execute()
    )
    subscriptions = subs_resp.data or []

    if not subscriptions:
        return {"sent": 0, "skipped": 0, "message": "No subscribers"}

    # Group by user_id to avoid duplicate processing
    user_subs: dict[str, list] = {}
    for sub in subscriptions:
        uid = sub["user_id"]
        if uid not in user_subs:
            user_subs[uid] = []
        user_subs[uid].append(sub)

    sent = 0
    skipped = 0

    for user_id, subs in user_subs.items():
        # Check if it's dinner time (4-5pm) in the user's timezone
        tz_str = subs[0].get("timezone", "UTC")
        try:
            user_now = datetime.now(ZoneInfo(tz_str))
        except Exception:
            user_now = datetime.now(ZoneInfo("UTC"))

        if user_now.hour < 16 or user_now.hour >= 17:
            skipped += len(subs)
            continue

        # Fetch user's PERSONAL pantry (group_id IS NULL) — scope so demo/shared
        # group items never leak into personal dinner notifications.
        # NOTE (deferred): notifying group members about a shared/demo pantry's
        # expiring items is a larger feature; keeping this personal-only for now.
        pantry_resp = scope_pantry_query(
            supabase.table("pantry_items").select("name, stock_status, expiration_date"), user_id, None
        ).execute()
        pantry_items = pantry_resp.data or []

        if not pantry_items:
            skipped += len(subs)
            continue

        available = [i for i in pantry_items if i.get("stock_status") != "out_of_stock"]
        ingredient_list = ", ".join(i["name"] for i in available[:20]) or "none"

        # Find expiring items
        today = datetime.now().date()
        three_days = today + timedelta(days=3)
        expiring_names = []
        for item in pantry_items:
            if item.get("expiration_date"):
                try:
                    exp_date = datetime.strptime(item["expiration_date"], "%Y-%m-%d").date()
                    if today <= exp_date <= three_days:
                        expiring_names.append(item["name"])
                except (ValueError, KeyError):
                    pass
        expiring_list = ", ".join(expiring_names) or "none"

        # Generate a dinner suggestion
        suggestion = _generate_dinner_suggestion(ingredient_list, expiring_list)

        if suggestion:
            title = "What's for dinner?"
            body = f"{suggestion.get('name', 'A tasty meal')} — {suggestion.get('description', 'Ready in no time')}"
            if suggestion.get("time_minutes"):
                body += f" ({suggestion['time_minutes']} min)"
        else:
            title = "What's for dinner?"
            body = "Open Voxal for personalized dinner ideas based on your pantry!"

        payload = {
            "title": title,
            "body": body,
            "tag": "voxal-dinner",
            "url": "/?view=daily-recs",
            "actions": [
                {"action": "open", "title": "See recipe"},
            ],
        }

        # Send to all user's subscriptions
        for sub in subs:
            subscription_info = {
                "endpoint": sub["endpoint"],
                "keys": {
                    "p256dh": sub["p256dh"],
                    "auth": sub["auth"],
                },
            }

            if _send_push(subscription_info, payload):
                sent += 1
            else:
                # Clean up expired subscription
                try:
                    supabase.table("push_subscriptions").delete().eq("id", sub["id"]).execute()
                except Exception:
                    pass

    return {"sent": sent, "skipped": skipped, "total_users": len(user_subs)}
