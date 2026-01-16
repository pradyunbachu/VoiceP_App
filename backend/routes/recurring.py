# ============================================================================
# RECURRING EXPENSE ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import supabase
from auth import get_current_user_dependency
from services.recurring import process_due_recurring_expenses

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

@router.post("/recurring/process")
@limiter.limit("5/minute")
async def process_recurring(request: Request, current_user: dict = Depends(get_current_user_dependency)):
    """Manually trigger processing of due recurring expenses"""
    try:
        created = process_due_recurring_expenses()
        return {
            "message": "Processed recurring expenses",
            "created_count": created
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing recurring expenses: {str(e)}")

@router.get("/recurring")
@limiter.limit("60/minute")
async def get_recurring_expenses(request: Request, current_user: dict = Depends(get_current_user_dependency)):
    """Get all recurring expense templates (parent recurring expenses)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("expenses").select("*").eq("user_id", current_user["id"]).eq("is_recurring", 1).is_("parent_recurring_id", "null").order("date", desc=True).execute()

    recurring = response.data if response.data else []
    return {"recurring_expenses": recurring, "count": len(recurring)}

@router.delete("/recurring/{expense_id}")
@limiter.limit("30/minute")
async def stop_recurring(request: Request, expense_id: int, current_user: dict = Depends(get_current_user_dependency)):
    """Stop a recurring expense (sets is_recurring to 0)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Update the parent expense to stop recurring
    response = supabase.table("expenses").update({"is_recurring": 0}).eq("id", expense_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Recurring expense not found")

    return {"message": "Recurring expense stopped successfully"}
