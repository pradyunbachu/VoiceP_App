"""Pydantic request/response schemas for the Voxal API.

Defines all data models used for request validation and response serialization
across the API. Organized by domain: expenses, budgets, pantry, shopping lists,
chat, insights, and receipt scanning.
"""

# ============================================================================
# PYDANTIC MODELS (Request/Response Schemas)
# ============================================================================
from pydantic import BaseModel, Field
from typing import List, Optional
import json
import os

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
    store: str = Field(max_length=200)
    items: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=100)
    amount: Optional[float] = None
    date: str = Field(max_length=30)
    recurring: Optional[bool] = False
    repeat_interval: Optional[int] = None
    repeat_unit: Optional[str] = Field(default=None, max_length=20)

class ExpenseUpdate(BaseModel):
    store: Optional[str] = Field(default=None, max_length=200)
    items: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=100)
    amount: Optional[float] = None
    date: Optional[str] = Field(default=None, max_length=30)

class BulkDeleteRequest(BaseModel):
    expense_ids: List[int]

class TranscriptRequest(BaseModel):
    transcript: str = Field(max_length=5000)

# ============================================================================
# BUDGET MODELS
# ============================================================================

class BudgetCreate(BaseModel):
    category: str = Field(max_length=100)
    amount: float
    month: int
    year: int
    recurring: Optional[bool] = False
    repeat_interval: Optional[int] = None
    repeat_unit: Optional[str] = Field(default=None, max_length=20)

class BudgetUpdate(BaseModel):
    category: Optional[str] = Field(default=None, max_length=100)
    amount: Optional[float] = None
    month: Optional[int] = None
    year: Optional[int] = None
    recurring: Optional[bool] = None
    repeat_interval: Optional[int] = None
    repeat_unit: Optional[str] = Field(default=None, max_length=20)

# ============================================================================
# PANTRY MODELS
# ============================================================================

# Load categories from shared JSON (source of truth: backend/data/grocery_categories.json)
_data_path = os.path.join(os.path.dirname(__file__), "data", "grocery_categories.json")
with open(_data_path, "r") as _f:
    _grocery_data = json.load(_f)
PANTRY_CATEGORIES = _grocery_data["categories"]

class PantryItemCreate(BaseModel):
    name: str = Field(max_length=200)
    quantity: Optional[float] = 1
    unit: Optional[str] = Field(default=None, max_length=50)
    category: Optional[str] = Field(default="Other", max_length=100)
    expiration_date: Optional[str] = Field(default=None, max_length=30)
    purchase_date: Optional[str] = Field(default=None, max_length=30)
    stock_status: Optional[str] = Field(default="full", max_length=20)
    notes: Optional[str] = Field(default=None, max_length=500)
    expiration_predicted: Optional[bool] = None

class PantryItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    quantity: Optional[float] = None
    unit: Optional[str] = Field(default=None, max_length=50)
    category: Optional[str] = Field(default=None, max_length=100)
    expiration_date: Optional[str] = Field(default=None, max_length=30)
    purchase_date: Optional[str] = Field(default=None, max_length=30)
    stock_status: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=500)
    expiration_predicted: Optional[bool] = None

class BulkPantryDeleteRequest(BaseModel):
    item_ids: List[int]

class AutoPopulatePantryRequest(BaseModel):
    expense_id: int
    items: List[dict]

# ============================================================================
# SHOPPING LIST MODELS
# ============================================================================

class ShoppingListItemCreate(BaseModel):
    name: str = Field(max_length=200)
    quantity: Optional[float] = 1
    unit: Optional[str] = Field(default=None, max_length=50)
    category: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)
    group_id: Optional[int] = None  # If set, adds to a shared group list instead of personal

class ShoppingListItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    quantity: Optional[float] = None
    unit: Optional[str] = Field(default=None, max_length=50)
    category: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None, max_length=500)

class BulkShoppingListDeleteRequest(BaseModel):
    item_ids: List[int]

# ============================================================================
# SHOPPING LIST SHARING MODELS
# ============================================================================

class ShoppingListGroupCreate(BaseModel):
    name: str = Field(max_length=100)

class ShoppingListGroupResponse(BaseModel):
    id: int
    name: str
    owner_id: str
    invite_code: str
    created_at: str
    updated_at: str

class ShoppingListInvite(BaseModel):
    email: str = Field(max_length=254)

class ShoppingListJoinByCode(BaseModel):
    invite_code: str = Field(max_length=100)

# ============================================================================
# PANTRY SHARING MODELS
# ============================================================================

class PantryGroupCreate(BaseModel):
    name: str = Field(max_length=100)

class PantryGroupInvite(BaseModel):
    email: str = Field(max_length=254)

class PantryGroupJoinByCode(BaseModel):
    invite_code: str = Field(max_length=100)

# ============================================================================
# CHAT MODELS
# ============================================================================

class ChatRequest(BaseModel):
    """User message sent to the Voxal chat assistant."""
    message: str = Field(max_length=2000)

class ChatResponse(BaseModel):
    """Structured response from the chat assistant.

    intent/sub_intent indicate what action was taken, response_text is the
    human-readable reply, and data carries any structured payload.
    """
    intent: str
    sub_intent: Optional[str] = None
    response_text: str
    data: Optional[dict] = None

# ============================================================================
# INSIGHTS MODELS
# ============================================================================

class InsightsRequest(BaseModel):
    time_period: str = Field(default="last_30_days", max_length=30)

class SpendingComparisonRequest(BaseModel):
    current_month: Optional[int] = None
    current_year: Optional[int] = None
    compare_month: Optional[int] = None
    compare_year: Optional[int] = None

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
    """Base64-encoded receipt image for OCR-based expense creation."""
    image_base64: str = Field(max_length=10_000_000)  # ~7.5 MB decoded limit

class ReceiptScanResponse(BaseModel):
    store: str
    items: str
    amount: float
    date: Optional[str] = None
    category: str
    expense_id: Optional[int] = None
    message: str

