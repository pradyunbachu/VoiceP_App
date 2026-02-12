# ============================================================================
# VOXAL API - MAIN ENTRY POINT
# ============================================================================
import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from config import supabase
from rate_limit import limiter
from services.recurring import process_due_recurring_expenses
from routes import transcription, expenses, expense_extraction, analytics, budgets, recurring, pantry, chat, shopping_list, shopping_list_sharing, insights, receipt, daily_recs
from middleware.csrf import CSRFMiddleware, get_csrf_token

# ============================================================================
# APPLICATION INITIALIZATION
# ============================================================================

app = FastAPI(title="voxal API")

# Rate limiting setup
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# ============================================================================
# CORS MIDDLEWARE
# ============================================================================

# Get allowed origins from environment
# In production, ALLOWED_ORIGINS must be set explicitly (e.g. "https://yourdomain.com")
# Localhost defaults are only used when ENVIRONMENT is not "production"
_env = os.getenv("ENVIRONMENT", "development")
_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if _origins_env:
    ALLOWED_ORIGINS = [o.strip() for o in _origins_env.split(",") if o.strip()]
elif _env == "production":
    ALLOWED_ORIGINS = []
else:
    ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-CSRF-Token",
        "X-Requested-With",
    ],
    expose_headers=["X-CSRF-Token"],
)

# ============================================================================
# CSRF MIDDLEWARE
# ============================================================================

# Enable CSRF protection (can be disabled for development via env var)
if os.getenv("DISABLE_CSRF", "false").lower() != "true":
    app.add_middleware(CSRFMiddleware)

# ============================================================================
# INCLUDE ROUTERS
# ============================================================================

app.include_router(transcription.router, prefix="/api", tags=["Transcription"])
app.include_router(expenses.router, prefix="/api", tags=["Expenses"])
app.include_router(expense_extraction.router, prefix="/api", tags=["Expense Extraction"])
app.include_router(analytics.router, prefix="/api", tags=["Analytics"])
app.include_router(budgets.router, prefix="/api", tags=["Budgets"])
app.include_router(recurring.router, prefix="/api", tags=["Recurring"])
app.include_router(pantry.router, prefix="/api", tags=["Pantry"])
app.include_router(shopping_list.router, prefix="/api", tags=["Shopping List"])
app.include_router(shopping_list_sharing.router, prefix="/api", tags=["Shopping List Sharing"])
app.include_router(chat.router, prefix="/api", tags=["Chat"])
app.include_router(insights.router, prefix="/api", tags=["Insights"])
app.include_router(receipt.router, prefix="/api", tags=["Receipt"])
app.include_router(daily_recs.router, prefix="/api", tags=["Daily Recs"])

# ============================================================================
# ROOT ENDPOINT
# ============================================================================

@app.get("/")
async def root():
    return {"message": "voxal API"}


@app.get("/api/csrf-token", tags=["Security"])
async def csrf_token_endpoint(request: Request):
    """Get a CSRF token for state-changing requests."""
    return await get_csrf_token(request)

# ============================================================================
# STARTUP EVENT
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Process due recurring expenses on app startup"""
    try:
        created = process_due_recurring_expenses()
        if created and created > 0:
            print(f"Startup: Created {created} recurring expense(s)")
    except Exception as e:
        print(f"Startup recurring check error: {e}")

# ============================================================================
# APPLICATION ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
