# ============================================================================
# PYDANTIC MODELS (Request/Response Schemas)
# ============================================================================
from pydantic import BaseModel
from typing import List, Optional

# ============================================================================
# EXPENSE MODELS
# ============================================================================

class ExpenseResponse(BaseModel):
    id: int
    store: str
    items: str
    category: Optional[str]
    amount: Optional[float]
    date: str
    created_at: str

class ExpenseCreate(BaseModel):
    store: str
    items: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    date: str
    recurring: Optional[bool] = False
    repeat_interval: Optional[int] = None
    repeat_unit: Optional[str] = None

class ExpenseUpdate(BaseModel):
    store: Optional[str] = None
    items: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None

class BulkDeleteRequest(BaseModel):
    expense_ids: List[int]

class TranscriptRequest(BaseModel):
    transcript: str

# ============================================================================
# BUDGET MODELS
# ============================================================================

class BudgetCreate(BaseModel):
    category: str
    amount: float
    month: int
    year: int
    recurring: Optional[bool] = False
    repeat_interval: Optional[int] = None
    repeat_unit: Optional[str] = None  # "weeks", "months", "years"

class BudgetUpdate(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    month: Optional[int] = None
    year: Optional[int] = None
    recurring: Optional[bool] = None
    repeat_interval: Optional[int] = None
    repeat_unit: Optional[str] = None

# ============================================================================
# PANTRY MODELS
# ============================================================================

PANTRY_CATEGORIES = [
    "Dairy", "Produce", "Meat & Seafood", "Bakery", "Frozen",
    "Canned Goods", "Snacks", "Beverages", "Condiments", "Grains & Pasta", "Other"
]

class PantryItemCreate(BaseModel):
    name: str
    quantity: Optional[float] = 1
    unit: Optional[str] = None
    category: Optional[str] = "Other"
    expiration_date: Optional[str] = None
    purchase_date: Optional[str] = None
    stock_status: Optional[str] = "full"
    notes: Optional[str] = None

class PantryItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expiration_date: Optional[str] = None
    purchase_date: Optional[str] = None
    stock_status: Optional[str] = None
    notes: Optional[str] = None

class BulkPantryDeleteRequest(BaseModel):
    item_ids: List[int]

class AutoPopulatePantryRequest(BaseModel):
    expense_id: int
    items: List[dict]

# ============================================================================
# SHOPPING LIST MODELS
# ============================================================================

class ShoppingListItemCreate(BaseModel):
    name: str
    quantity: Optional[float] = 1
    unit: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None

class ShoppingListItemUpdate(BaseModel):
    name: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None

class BulkShoppingListDeleteRequest(BaseModel):
    item_ids: List[int]

# ============================================================================
# CHAT MODELS
# ============================================================================

class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    intent: str
    sub_intent: Optional[str] = None
    response_text: str
    data: Optional[dict] = None

# ============================================================================
# INSIGHTS MODELS
# ============================================================================

class InsightsRequest(BaseModel):
    time_period: str = "last_30_days"  # last_7_days, last_30_days, last_90_days

class InsightsResponse(BaseModel):
    period: dict
    summary: dict
    comparisons: dict
    top_categories: List[dict]
    top_stores: List[dict]
    budget_status: Optional[List[dict]] = None
    ai_insights: Optional[dict] = None
    generated_at: str

# ============================================================================
# RECEIPT SCANNING MODELS
# ============================================================================

class ReceiptScanRequest(BaseModel):
    ocr_text: str

class ReceiptScanResponse(BaseModel):
    store: str
    items: str
    amount: float
    date: Optional[str] = None
    category: str
    expense_id: Optional[int] = None
    message: str

# ============================================================================
# CALENDAR MODELS
# ============================================================================

class CalendarEventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_date: Optional[str] = None  # YYYY-MM-DD
    end_time: Optional[str] = None  # HH:MM
    all_day: Optional[bool] = False
    color: Optional[str] = "#3b82f6"

class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    start_time: Optional[str] = None
    end_date: Optional[str] = None
    end_time: Optional[str] = None
    all_day: Optional[bool] = None
    color: Optional[str] = None

class CalendarEventResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    start_date: str
    start_time: Optional[str]
    end_date: Optional[str]
    end_time: Optional[str]
    all_day: bool
    color: str
    created_at: str
    updated_at: str

class CalendarEventsListResponse(BaseModel):
    events: List[CalendarEventResponse]
    count: int
