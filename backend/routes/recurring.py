# ============================================================================
# RECURRING EXPENSE ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends

from config import supabase
from auth import get_current_user_dependency
from services.recurring import process_due_recurring_expenses

router = APIRouter()

@router.post("/recurring/process")
async def process_recurring(current_user: dict = Depends(get_current_user_dependency)):
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
async def get_recurring_expenses(current_user: dict = Depends(get_current_user_dependency)):
    """Get all recurring expense templates (parent recurring expenses)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    response = supabase.table("expenses").select("*").eq("user_id", current_user["id"]).eq("is_recurring", 1).is_("parent_recurring_id", "null").order("date", desc=True).execute()

    recurring = response.data if response.data else []
    return {"recurring_expenses": recurring, "count": len(recurring)}

@router.delete("/recurring/{expense_id}")
async def stop_recurring(expense_id: int, current_user: dict = Depends(get_current_user_dependency)):
    """Stop a recurring expense (sets is_recurring to 0)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    # Update the parent expense to stop recurring
    response = supabase.table("expenses").update({"is_recurring": 0}).eq("id", expense_id).eq("user_id", current_user["id"]).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Recurring expense not found")

    return {"message": "Recurring expense stopped successfully"}
