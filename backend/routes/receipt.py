# ============================================================================
# RECEIPT SCANNING ROUTES
# ============================================================================
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Request

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import ReceiptScanRequest, ReceiptScanResponse
from services.receipt_parsing import parse_receipt_with_vision

router = APIRouter()


@router.post("/scan-receipt", response_model=ReceiptScanResponse)
@limiter.limit("20/minute")
async def scan_receipt(
    request: Request,
    scan_request: ReceiptScanRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """
    Parse a receipt image using Groq Vision API and create an expense.
    """
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    image_base64 = scan_request.image_base64.strip()
    if not image_base64:
        raise HTTPException(status_code=400, detail="Image data is required")

    # Parse receipt using Groq Vision
    parsed_data = parse_receipt_with_vision(image_base64)

    if not parsed_data:
        raise HTTPException(
            status_code=422,
            detail="Could not extract expense data from receipt. Please ensure the receipt image is clear and try again."
        )

    # Use today's date if no date was extracted
    expense_date = parsed_data.get("date") or datetime.now().strftime("%Y-%m-%d")

    # Create expense in database
    try:
        expense_data = {
            "user_id": user_id,
            "store": parsed_data["store"],
            "items": parsed_data["items"],
            "category": parsed_data["category"],
            "amount": parsed_data["amount"],
            "date": expense_date
        }

        result = supabase.table("expenses").insert(expense_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to save expense")

        saved_expense = result.data[0]

        return ReceiptScanResponse(
            store=saved_expense["store"],
            items=saved_expense["items"],
            amount=saved_expense["amount"],
            date=saved_expense["date"],
            category=saved_expense["category"],
            expense_id=saved_expense["id"],
            message="Receipt scanned and expense saved successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving receipt expense: {e}")
        raise HTTPException(status_code=500, detail="Failed to save expense from receipt")
