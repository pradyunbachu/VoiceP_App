# ============================================================================
# VOICEP API - MAIN ENTRY POINT
# ============================================================================
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import supabase
from services.recurring import process_due_recurring_expenses
from routes import transcription, expenses, analytics, budgets, recurring, pantry

# ============================================================================
# APPLICATION INITIALIZATION
# ============================================================================

app = FastAPI(title="VoiceP Expense Tracker API")

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# INCLUDE ROUTERS
# ============================================================================

app.include_router(transcription.router, prefix="/api", tags=["Transcription"])
app.include_router(expenses.router, prefix="/api", tags=["Expenses"])
app.include_router(analytics.router, prefix="/api", tags=["Analytics"])
app.include_router(budgets.router, prefix="/api", tags=["Budgets"])
app.include_router(recurring.router, prefix="/api", tags=["Recurring"])
app.include_router(pantry.router, prefix="/api", tags=["Pantry"])

# ============================================================================
# ROOT ENDPOINT
# ============================================================================

@app.get("/")
async def root():
    return {"message": "VoiceP Expense Tracker API"}

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
