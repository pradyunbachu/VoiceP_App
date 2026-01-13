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
# ANALYTICS MODELS
# ============================================================================

class AnalyticsResponse(BaseModel):
    total_expenses: float
    expense_count: int
    expenses_by_store: dict
    expenses_by_category: dict
    expenses_by_date: List[dict]
    recent_expenses: List[ExpenseResponse]

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
