# ============================================================================
# RECEIPT SCANNING ROUTES
# ============================================================================
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from config import supabase
from auth import get_current_user_dependency
from schemas import ReceiptScanRequest, ReceiptScanResponse
from services.receipt_parsing import parse_receipt_with_groq, fallback_receipt_parsing

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/scan-receipt", response_model=ReceiptScanResponse)
@limiter.limit("20/minute")
async def scan_receipt(
    request: Request,
    scan_request: ReceiptScanRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """
    Parse OCR text from a receipt and create an expense.

    The OCR is performed client-side using Tesseract.js, and this endpoint
    receives the extracted text and uses Groq LLM to parse it into
    structured expense data.
    """
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    ocr_text = scan_request.ocr_text.strip()
    if not ocr_text:
        raise HTTPException(status_code=400, detail="OCR text is required")

    if len(ocr_text) < 10:
        raise HTTPException(status_code=400, detail="OCR text too short - receipt may not be readable")

    # Try Groq parsing first, fall back to regex-based parsing
    parsed_data = parse_receipt_with_groq(ocr_text)

    if not parsed_data:
        # Try fallback parsing
        parsed_data = fallback_receipt_parsing(ocr_text)

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
        raise HTTPException(status_code=500, detail=f"Failed to save expense: {str(e)}")
