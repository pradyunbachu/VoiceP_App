# ============================================================================
# IMPORTS
# ============================================================================
from fastapi import FastAPI, File, UploadFile, HTTPException, Body, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.exceptions import RequestValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import json
import os
import re
from groq import Groq
import httpx
import io
import base64
from dotenv import load_dotenv
import jwt
from jwt import PyJWK
from supabase import create_client, Client

# ============================================================================
# CONFIGURATION & SETUP
# ============================================================================
# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Voxalyze Expense Tracker API")

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

# Supabase JWT Configuration
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")

# Cache for JWKS keys
jwks_cache = {}

def get_jwks_key(kid: str):
    """Fetch and cache JWKS keys from Supabase using httpx"""
    global jwks_cache
    if kid in jwks_cache:
        return jwks_cache[kid]

    if not SUPABASE_URL:
        return None

    jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    try:
        response = httpx.get(jwks_url)
        response.raise_for_status()
        jwks_data = response.json()

        for key_data in jwks_data.get("keys", []):
            key_id = key_data.get("kid")
            if key_id:
                jwks_cache[key_id] = PyJWK.from_dict(key_data).key

        return jwks_cache.get(kid)
    except Exception as e:
        print(f"Error fetching JWKS: {e}")
        return None

# Security
security = HTTPBearer()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Client Initialization
# Initialize Groq client (for expense extraction from transcripts)
groq_api_key = os.getenv("GROQ_API_KEY", "")
if not groq_api_key or groq_api_key == "your_groq_api_key_here":
    print("WARNING: GROQ_API_KEY not set. Please set your API key in .env file")
    print("Get a free API key at: https://console.groq.com/")
groq_client = Groq(api_key=groq_api_key) if groq_api_key and groq_api_key != "your_groq_api_key_here" else None

# Initialize Deepgram API key (for voice transcription)
deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "")
if not deepgram_api_key or deepgram_api_key == "your_deepgram_api_key_here":
    print("WARNING: DEEPGRAM_API_KEY not set. Please set your API key in .env file")
    print("Get a free API key at: https://console.deepgram.com/")
deepgram_available = deepgram_api_key and deepgram_api_key != "your_deepgram_api_key_here"

# Database Configuration - Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: SUPABASE_URL and SUPABASE_KEY not set. Please set them in .env file")
    print("Get your credentials from: https://supabase.com/dashboard")
    supabase: Optional[Client] = None
else:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Supabase client initialized successfully")

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def init_db():
    """
    Supabase initialization check.
    Note: Table creation should be done in Supabase dashboard SQL editor.
    This function just verifies the connection.
    """
    if supabase is None:
        raise Exception("Supabase client not initialized. Please set SUPABASE_URL and SUPABASE_KEY in .env")

    try:
        # Test connection by trying to query profiles table
        response = supabase.table("profiles").select("id").limit(1).execute()
        print("Supabase connection verified successfully")
    except Exception as e:
        print(f"Warning: Could not verify Supabase connection: {e}")
        print("Make sure tables are created in Supabase dashboard")

if supabase:
    init_db()


# ============================================================================
# AUTHENTICATION HELPER FUNCTIONS
# ============================================================================

async def get_current_user_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get the current authenticated user from Supabase JWT token"""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        token = credentials.credentials
        header = jwt.get_unverified_header(token)
        alg = header.get('alg')

        if alg == "ES256":
            # Use JWKS for ES256 tokens
            kid = header.get('kid')
            signing_key = get_jwks_key(kid)
            if not signing_key:
                raise credentials_exception
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=["ES256"],
                audience="authenticated",
            )
        else:
            # Fallback to HS256 with shared secret
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )

        user_id = payload.get("sub")  # UUID string
        email = payload.get("email")
        if not user_id:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"JWT Error: {e}")
        raise credentials_exception

    # Get username from profiles table
    if supabase is None:
        raise credentials_exception

    try:
        response = supabase.table("profiles").select("username").eq("id", user_id).execute()
        username = response.data[0]["username"] if response.data else (email.split("@")[0] if email else "User")
    except Exception:
        username = email.split("@")[0] if email else "User"

    return {"id": user_id, "username": username, "email": email}
    
# ============================================================================
# TEXT PROCESSING HELPER FUNCTIONS
# ============================================================================

def parse_relative_date(transcript: str) -> str:
    """Parse relative date terms from transcript and return YYYY-MM-DD format"""
    transcript_lower = transcript.lower()
    today = datetime.now()
    
    # Check for relative date terms
    if re.search(r'\byesterday\b', transcript_lower):
        date = today - timedelta(days=1)
    elif re.search(r'\btomorrow\b', transcript_lower):
        date = today + timedelta(days=1)
    elif re.search(r'\btoday\b', transcript_lower):
        date = today
    elif re.search(r'\blast\s+week\b', transcript_lower):
        date = today - timedelta(weeks=1)
    elif re.search(r'\blast\s+month\b', transcript_lower):
        date = today - timedelta(days=30)
    elif re.search(r'\b(\d+)\s+days?\s+ago\b', transcript_lower):
        match = re.search(r'\b(\d+)\s+days?\s+ago\b', transcript_lower)
        if match:
            days_ago = int(match.group(1))
            date = today - timedelta(days=days_ago)
        else:
            date = today
    elif re.search(r'\bin\s+(\d+)\s+days?\b', transcript_lower):
        match = re.search(r'\bin\s+(\d+)\s+days?\b', transcript_lower)
        if match:
            days_ahead = int(match.group(1))
            date = today + timedelta(days=days_ahead)
        else:
            date = today
    else:
        # Default to today if no relative date found
        date = today
    
    return date.strftime("%Y-%m-%d")

def parse_amount(amount_str: str) -> float:
    """Parse amount string to float, handling special cases
    Only applies dollars.cents logic to 4-5 digit numbers (e.g., 2350 -> 23.50)
    Numbers like 700, 800 are clearly whole dollars, not 7.00 or 8.00"""
    try:
        if '.' not in amount_str:
            num = int(amount_str)
            num_digits = len(amount_str)
            # Only apply dollars.cents logic to 4-5 digit numbers
            # 3-digit numbers like 700, 800 are clearly whole dollars
            if 4 <= num_digits <= 5 and num < 100000:
                dollars = num // 100
                cents = num % 100
                return dollars + (cents / 100.0)
            else:
                return float(num)
        else:
            return float(amount_str)
    except:
        return 0.0

def extract_store(transcript: str) -> str:
    """Extract store name from transcript"""
    store = "Unknown Store"
    store_patterns = [
        r'at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+for',
    ]
    for pattern in store_patterns:
        match = re.search(pattern, transcript)
        if match:
            store = match.group(1)
            break
    return store

def clean_item_name(item: str, store: str = "") -> str:
    """Clean up item name - remove common words and store names"""
    # Remove common prefixes and articles (including "N" which is a common LLM mistake for "an")
    item = re.sub(r'\b(i|I|got|bought|purchased|the|a|an|n|some)\b', '', item, flags=re.IGNORECASE)

    # Also remove leading "N " specifically (common Groq mistake: "an iPad" -> "N iPad")
    item = re.sub(r'^n\s+', '', item, flags=re.IGNORECASE)
    
    # Remove store name if it appears in the item
    if store and store != "Unknown Store":
        store_lower = store.lower()
        item = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', item, flags=re.IGNORECASE)
    
    # Remove "from [store]" pattern first
    item = re.sub(r'\bfrom\s+\w+\b', '', item, flags=re.IGNORECASE)
    
    # Remove "at [store]" pattern
    item = re.sub(r'\bat\s+\w+\b', '', item, flags=re.IGNORECASE)
    
    # Clean up extra spaces before removing standalone words
    item = re.sub(r'\s+', ' ', item)
    item = item.strip()
    
    # Remove standalone "from" and "at" words
    item = re.sub(r'\bfrom\b', '', item, flags=re.IGNORECASE)
    item = re.sub(r'\bat\b', '', item, flags=re.IGNORECASE)
    
    # Clean up extra spaces
    item = re.sub(r'\s+', ' ', item)
    item = item.strip()
    
    # If empty after cleaning, return default
    if not item:
        return "Various items"
    
    # Capitalize properly - handle special cases like "iPad", "iPhone", "MacBook"
    item_lower = item.lower()
    special_cases = {
        'ipad': 'iPad',
        'iphone': 'iPhone',
        'macbook': 'MacBook',
        'imac': 'iMac',
        'ipod': 'iPod'
    }
    
    if item_lower in special_cases:
        return special_cases[item_lower]
    
    # For regular items, capitalize first letter of each word
    words = item.split()
    cleaned_words = []
    for word in words:
        word_lower = word.lower()
        if word_lower in special_cases:
            cleaned_words.append(special_cases[word_lower])
        elif word_lower in ['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'n']:
            # Skip these words entirely if they're standalone (including 'n' which is a common LLM mistake for 'an')
            continue
        else:
            cleaned_words.append(word.capitalize())
    
    if cleaned_words:
        item = ' '.join(cleaned_words)
        # Always capitalize first letter
        if item:
            item = item[0].upper() + item[1:] if len(item) > 1 else item.upper()
    else:
        item = "Various items"
    
    return item

def process_due_recurring_expenses():
    """Check for recurring expenses that are due and create new entries.

    This function should be called periodically (e.g., on app startup, daily cron job).
    It looks at all recurring expenses and creates new entries for any that are due.
    """
    if supabase is None:
        print("Supabase not configured, skipping recurring expense processing")
        return
    
    today = datetime.now().date()
    today_str = today.strftime("%Y-%m-%d")

    # Get all recurring expenses (parent expenses only - no parent_recurring_id)
    response = supabase.table("expenses").select("*").eq("is_recurring", 1).is_("parent_recurring_id", "null").execute()
    recurring_expenses = response.data if response.data else []

    created_count = 0

    for expense_dict in recurring_expenses:
        user_id = expense_dict["user_id"]
        recurring_interval = expense_dict.get("recurring_interval", 1)
        recurring_unit = expense_dict.get("recurring_unit", "months")

        # Parse the original expense date
        try:
            original_date = datetime.strptime(expense_dict["date"], "%Y-%m-%d").date()
        except:
            continue

        # Find the most recent occurrence for this recurring expense
        response = supabase.table("expenses").select("date").or_(f"id.eq.{expense_dict['id']},parent_recurring_id.eq.{expense_dict['id']}").order("date", desc=True).limit(1).execute()
        
        if response.data and response.data[0].get("date"):
            try:
                last_date = datetime.strptime(response.data[0]["date"], "%Y-%m-%d").date()
            except:
                last_date = original_date
        else:
            last_date = original_date

        # Calculate next due date
        if recurring_unit == "days":
            next_due = last_date + timedelta(days=recurring_interval)
        elif recurring_unit == "weeks":
            next_due = last_date + timedelta(weeks=recurring_interval)
        elif recurring_unit == "months":
            month = last_date.month + recurring_interval
            year = last_date.year
            while month > 12:
                month -= 12
                year += 1
            day = min(last_date.day, 28)
            next_due = last_date.replace(year=year, month=month, day=day)
        elif recurring_unit == "years":
            next_due = last_date.replace(year=last_date.year + recurring_interval)
        else:
            continue

        # Create new expense if due date has arrived (today or past)
        while next_due <= today:
            next_due_str = next_due.strftime("%Y-%m-%d")

            # Check if this expense already exists for this date
            check_response = supabase.table("expenses").select("id").eq("user_id", user_id).eq("store", expense_dict["store"]).eq("items", expense_dict["items"]).eq("date", next_due_str).or_(f"id.eq.{expense_dict['id']},parent_recurring_id.eq.{expense_dict['id']}").execute()

            if not check_response.data:
                # Create the new recurring expense entry
                response = supabase.table("expenses").insert({
                    "user_id": user_id,
                    "store": expense_dict["store"],
                    "items": expense_dict["items"],
                    "category": expense_dict.get("category"),
                    "amount": expense_dict["amount"],
                    "date": next_due_str,
                    "created_at": datetime.now().isoformat(),
                    "is_recurring": 1,
                    "recurring_interval": recurring_interval,
                    "recurring_unit": recurring_unit,
                    "parent_recurring_id": expense_dict["id"]
                }).execute()
                
                if response.data:
                    created_count += 1

            # Calculate next due date for the loop
            if recurring_unit == "days":
                next_due = next_due + timedelta(days=recurring_interval)
            elif recurring_unit == "weeks":
                next_due = next_due + timedelta(weeks=recurring_interval)
            elif recurring_unit == "months":
                month = next_due.month + recurring_interval
                year = next_due.year
                while month > 12:
                    month -= 12
                    year += 1
                day = min(next_due.day, 28)
                next_due = next_due.replace(year=year, month=month, day=day)
            elif recurring_unit == "years":
                next_due = next_due.replace(year=next_due.year + recurring_interval)
            else:
                break

    return created_count

def detect_recurring(transcript: str) -> dict:
    """Detect if expense is recurring and extract interval/unit"""
    transcript_lower = transcript.lower()

    # Default: not recurring
    result = {
        "is_recurring": False,
        "recurring_interval": None,
        "recurring_unit": None
    }

    # Check for recurring patterns
    recurring_patterns = [
        # "every X weeks/months/days/years"
        (r'every\s+(\d+)\s+(day|week|month|year)s?', lambda m: (int(m.group(1)), m.group(2) + "s")),
        # "biweekly" or "bi-weekly"
        (r'bi[-\s]?weekly', lambda m: (2, "weeks")),
        # "bimonthly" or "bi-monthly"
        (r'bi[-\s]?monthly', lambda m: (2, "months")),
        # "quarterly"
        (r'quarterly', lambda m: (3, "months")),
        # "weekly"
        (r'\bweekly\b', lambda m: (1, "weeks")),
        # "monthly"
        (r'\bmonthly\b', lambda m: (1, "months")),
        # "yearly" or "annually"
        (r'\b(yearly|annually)\b', lambda m: (1, "years")),
        # "daily"
        (r'\bdaily\b', lambda m: (1, "days")),
        # "every week/month/year/day"
        (r'every\s+(week|month|year|day)\b', lambda m: (1, m.group(1) + "s")),
        # "recurring" keyword (default to monthly if no other info)
        (r'\brecurring\b', lambda m: (1, "months")),
        # "subscription" keyword (default to monthly)
        (r'\bsubscription\b', lambda m: (1, "months")),
    ]

    for pattern, extractor in recurring_patterns:
        match = re.search(pattern, transcript_lower)
        if match:
            interval, unit = extractor(match)
            result["is_recurring"] = True
            result["recurring_interval"] = interval
            result["recurring_unit"] = unit
            break

    return result

def categorize_item(item: str, store: str) -> str:
    """Categorize a single item"""
    item_lower = item.lower()
    store_lower = store.lower() if store != "Unknown Store" else ""

    category_keywords = {
        "Electronics": ["laptop", "computer", "macbook", "iphone", "ipad", "phone", "tablet", "tv"],
        "Groceries": ["groceries", "milk", "bread", "eggs", "food", "banana", "candy", "apple"],
        "Clothing": ["shirt", "pants", "jacket", "shoes"],
        "Transportation": ["gas", "gasoline", "fuel"],
        "Dining": ["restaurant", "cafe", "coffee", "lunch", "dinner"],
        "Entertainment": ["movie", "game", "book"],
        "Health": ["pharmacy", "medicine"],
        "Home": ["furniture", "bed", "chair", "rent", "rental", "apartment", "house", "mortgage", "housing"],
        "Utilities": ["electric", "water", "internet"],
    }

    for cat, keywords in category_keywords.items():
        for keyword in keywords:
            if keyword in item_lower:
                return cat

    if any(word in store_lower for word in ["walmart", "target", "kroger"]):
        return "Groceries"
    elif any(word in store_lower for word in ["apple", "best buy"]):
        return "Electronics"

    return "Other"

# ============================================================================
# EXPENSE EXTRACTION FUNCTIONS
# ============================================================================

def validate_expense(expense: dict, today_str: str) -> dict:
    """Validate and normalize expense data"""
    # Required fields
    required = ["store", "items", "category", "amount", "date"]
    for field in required:
        if field not in expense:
            raise ValueError(f"Missing required field: {field}")
    
    # Clean items field
    items = str(expense["items"]).strip()
    if not items:
        raise ValueError("Items field cannot be empty")
    
    # Remove price information and "worth of" patterns FIRST
    items = re.sub(r'\$\d+(?:\.\d+)?\s+worth\s+of\s+', '', items, flags=re.IGNORECASE).strip()
    items = re.sub(r'\$\d+(?:\.\d+)?\s+', '', items).strip()  # Remove any remaining dollar amounts
    items = re.sub(r'worth\s+of\s+', '', items, flags=re.IGNORECASE).strip()
    
    # Remove articles (multiple passes to be thorough)
    for _ in range(3):
        items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE).strip()
    
    # Remove action words
    items = re.sub(r'^(i\s+)?(bought|got|purchased|spent)\s+', '', items, flags=re.IGNORECASE).strip()
    
    # Remove any remaining price patterns
    items = re.sub(r'\s+\$\d+(?:\.\d+)?', '', items).strip()
    items = re.sub(r'\$\d+(?:\.\d+)?\s+', '', items).strip()
    
    # Fix Apple product capitalization
    product_fixes = {
        'ipad': 'iPad', 'iphone': 'iPhone', 'macbook': 'MacBook',
        'imac': 'iMac', 'ipod': 'iPod'
    }
    items_lower = items.lower()
    for product_key, product_value in product_fixes.items():
        if items_lower == product_key:
            items = product_value
            break
        elif items_lower.startswith(product_key + ' '):
            remaining = items[len(product_key):].strip()
            items = product_value + (' ' + remaining.title() if remaining else '')
            break
        elif product_key in items_lower:
            items = re.sub(r'\b' + product_key + r'\b', product_value, items, flags=re.IGNORECASE)
            break
    
    # Capitalize first letter if needed
    if items and items[0].islower():
        items = items[0].upper() + items[1:] if len(items) > 1 else items.upper()
    
    # Validate category
    valid_categories = ["Electronics", "Groceries", "Clothing", "Transportation",
                       "Dining", "Entertainment", "Health", "Home", "Utilities", "Other"]
    category = expense.get("category", "Other")
    if category not in valid_categories:
        category = "Other"

    # Handle recurring expenses - add "Recurring" tag to category
    is_recurring = expense.get("is_recurring", False)
    recurring_interval = expense.get("recurring_interval")
    recurring_unit = expense.get("recurring_unit")

    if is_recurring and "Recurring" not in category:
        category = f"{category}, Recurring"

    # Validate amount
    try:
        amount = float(expense["amount"])
        if amount <= 0:
            raise ValueError("Amount must be positive")
    except (ValueError, TypeError):
        raise ValueError(f"Invalid amount: {expense.get('amount')}")

    # Validate date format
    date = expense.get("date", today_str)
    if not re.match(r'\d{4}-\d{2}-\d{2}', str(date)):
        date = today_str

    return {
        "store": str(expense["store"]).strip(),
        "items": items,
        "category": category,
        "amount": amount,
        "date": date,
        "is_recurring": is_recurring,
        "recurring_interval": recurring_interval,
        "recurring_unit": recurring_unit
    }

def post_process_extraction(expenses: list, transcript: str) -> list:
    """Post-process extracted expenses to fix common issues"""
    cleaned = []
    for exp in expenses:
        # Fix items
        items = exp.get("items", "").strip()
        # Remove common prefixes
        items = re.sub(r'^(i\s+)?(bought|got|purchased|bought an|bought a|bought the)\s+', '', items, flags=re.IGNORECASE)
        # Remove articles
        items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE).strip()
        # Capitalize properly
        if items:
            items = items[0].upper() + items[1:] if len(items) > 1 else items.upper()
        
        exp["items"] = items
        cleaned.append(exp)
    
    return cleaned

def extract_expense_simple(transcript: str):
    """Simple regex-based expense extraction as fallback when Groq is unavailable
    Returns a list of expense dicts if multiple items detected, otherwise a single dict"""
    transcript_lower = transcript.lower()

    # Extract store first (needed for all patterns)
    store = extract_store(transcript)
    date = parse_relative_date(transcript)

    # Detect if expense is recurring
    recurring_info = detect_recurring(transcript)

    # First, try to detect "$X worth of item" pattern (handles any number of items)
    # Pattern: "$17 worth of ice cream, $4 worth of strawberries, and $32 worth of chocolate"
    # Also handles "$X of item" without "worth"
    worth_of_pattern = r'\$(\d+(?:\.\d+)?)\s+(?:worth\s+)?(?:of\s+)?([a-zA-Z][a-zA-Z\s]*?)(?:,|\s+and\s+|\s+at\s+|\s+from\s+|\s+today|$)'
    worth_of_matches = re.findall(worth_of_pattern, transcript, re.IGNORECASE)

    if len(worth_of_matches) >= 2:
        # Found multiple items with "$X worth of item" pattern
        # Combine them into ONE expense with summed amount and comma-separated items
        all_items = []
        total_amount = 0.0

        for amount_str, item in worth_of_matches:
            item = item.strip()
            # Skip if item is empty or just whitespace
            if not item or item.lower() in ['and', 'at', 'from', 'the', 'a', 'an']:
                continue

            amount = parse_amount(amount_str)
            cleaned_item = clean_item_name(item, store)

            all_items.append(cleaned_item)
            total_amount += amount

        if all_items:
            # Combine all items into comma-separated string
            combined_items = ", ".join(all_items)
            # Use the category of the first item (or could detect most common)
            category = categorize_item(all_items[0], store)

            return {
                "store": store,
                "items": combined_items,
                "category": category,
                "amount": total_amount,
                "date": date,
                **recurring_info
            }

    # Try pattern: "item1 for $X and item2 for $Y" or "bought item1 for $X and item2 for $Y"
    multi_item_pattern = r'(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)\s+and\s+(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)'
    multi_match = re.search(multi_item_pattern, transcript_lower, re.IGNORECASE)

    if multi_match:
        # Found multiple items with individual prices - combine into ONE expense
        item1 = multi_match.group(1).strip()
        amount1_str = multi_match.group(2)
        item2 = multi_match.group(3).strip()
        amount2_str = multi_match.group(4)

        # Parse amounts
        amount1 = parse_amount(amount1_str)
        amount2 = parse_amount(amount2_str)

        # Clean up items (pass store name to remove it from item names)
        item1 = clean_item_name(item1, store)
        item2 = clean_item_name(item2, store)

        # Combine items and sum amounts
        combined_items = f"{item1}, {item2}"
        total_amount = amount1 + amount2
        category = categorize_item(item1, store)

        return {
                "store": store,
            "items": combined_items,
            "category": category,
            "amount": total_amount,
            "date": date,
            **recurring_info
        }

    # If no multi-item pattern, extract as single expense
    # Extract amount (look for $XX.XX or XX dollars)
    amount = None
    amount_patterns = [
        r'\$(\d+\.?\d*)',  # $45.50
        r'(\d+\.?\d*)\s*dollars?',  # 45.50 dollars
        r'for\s+(\d+\.?\d*)',  # for 45.50 or for 2350 (will be handled specially)
        r'(\d+\.?\d*)\s*bucks?',  # 45.50 bucks
        r'(\d+)\s*cent',  # 14 cent -> 0.14
        r'(\d+)\s*cents',  # 14 cents -> 0.14
        r'(\d+):(\d+)\s*(\d+)',  # 4:35 15 (misheard $45.50)
        r'(\d+)\s+(\d+)',  # 14 50 (could be $14.50)
    ]
    for pattern in amount_patterns:
        match = re.search(pattern, transcript_lower)
        if match:
            try:
                if 'cent' in pattern:  # Handle cents
                    cents = float(match.group(1))
                    amount = cents / 100.0  # Convert cents to dollars
                    break
                elif ':' in pattern:  # Handle time-like format (4:35 15)
                    # Try to interpret as dollars: 4:35 15 -> 45.50 or 45.15
                    parts = match.groups()
                    if len(parts) == 3:
                        # Could be 4:35 15 -> 45.50 or 4:35 15 -> 45.15
                        # Take first two digits and last two as cents
                        amount = float(f"{parts[0]}{parts[1]}.{parts[2]}")
                    else:
                        amount = float(match.group(1))
                    break
                elif len(match.groups()) == 2:  # Handle "14 50" -> $14.50
                    # Check if second number is 2 digits (likely cents)
                    num1 = float(match.group(1))
                    num2 = float(match.group(2))
                    if num2 < 100:  # Likely cents
                        amount = num1 + (num2 / 100.0)
                    else:
                        amount = num1
                    break
                elif 'for\s+' in pattern:  # Handle "for 2350" -> $23.50
                    num_str = match.group(1)
                    # If it's a whole number (no decimal), check if it should be split
                    if '.' not in num_str:
                        num = int(num_str)
                        num_digits = len(num_str)
                        # If 3-5 digits and reasonable amount, likely dollars.cents format
                        # e.g., 2350 -> 23.50, 350 -> 3.50, 1234 -> 12.34
                        if 3 <= num_digits <= 5 and num < 100000:
                            # Split last 2 digits as cents
                            dollars = num // 100
                            cents = num % 100
                            amount = dollars + (cents / 100.0)
                        else:
                            amount = float(num)
                    else:
                        amount = float(num_str)
                    break
                else:
                    amount = float(match.group(1))
                    break
            except:
                pass
    
    # Extract store (look for "at [Store]" or "from [Store]")
    store = "Unknown Store"
    store_patterns = [
        r'at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',  # at Walmart, at Target
        r'from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',  # from Walmart
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+for',  # Walmart for
    ]
    for pattern in store_patterns:
        match = re.search(pattern, transcript)
        if match:
            store = match.group(1)
            break
    
    # Extract items - improved logic to avoid store names
    items = ""
    
    # First, identify the store name to exclude it from items
    store_lower = store.lower() if store != "Unknown Store" else ""
    
    # Pattern 1: Items after dash (e.g., "groceries - milk, bread, eggs")
    items_match = re.search(r'[-–—]\s*(.+?)(?:\s+for|\s+at|\s+from|\s+\$|$)', transcript, re.IGNORECASE)
    if items_match:
        items = items_match.group(1).strip()
        # Clean up: remove trailing store names or amounts
        items = re.sub(r'\s+(?:at|from|for)\s+.*$', '', items, flags=re.IGNORECASE)
        items = re.sub(r'\s+\$?\d+.*$', '', items)  # Remove trailing amounts
    
    # Pattern 2: Items before "at" or "from" (e.g., "bought laptop MacBook from Apple")
    if not items:
        # Look for "bought [item] from [store]" or "bought [item] at [store]"
        before_store = re.search(r'(?:bought|got|purchased|brought)\s+(?:a|an|the|some)?\s*(.+?)\s+(?:at|from)\s+', transcript, re.IGNORECASE)
        if before_store:
            text = before_store.group(1).strip()
            # Remove articles at the start
            text = re.sub(r'^\s*(a|an|the|some)\s+', '', text, flags=re.IGNORECASE)
            # Remove trailing "for" or amounts
            text = re.sub(r'\s+for\s+.*$', '', text, flags=re.IGNORECASE)
            text = re.sub(r'\s+\$?\d+.*$', '', text)
            # Remove the store name if it appears in the items
            if store_lower:
                text = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', text, flags=re.IGNORECASE)
            text = text.strip()
            if text and len(text) > 2:  # Make sure we have actual content
                items = text.strip()
    
    # Pattern 3: Items after "for" but before store (e.g., "spent $1000 for laptop at Apple")
    if not items:
        after_for = re.search(r'for\s+\$?\d+.*?\s+(.+?)(?:\s+at|\s+from|$)', transcript, re.IGNORECASE)
        if not after_for:
            after_for = re.search(r'for\s+(.+?)(?:\s+at|\s+from|\s+\$|$)', transcript, re.IGNORECASE)
        if after_for:
            text = after_for.group(1).strip()
            # Remove store names and amounts
            text = re.sub(r'\s+(?:at|from)\s+.*$', '', text, flags=re.IGNORECASE)
            text = re.sub(r'\s+\$?\d+.*$', '', text)
            # Remove the store name if it appears
            if store_lower:
                text = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', text, flags=re.IGNORECASE)
            text = text.strip()
            if text and len(text) > 2:
                items = text.strip()
    
    # Pattern 4: Extract item words that are NOT the store name
    if not items:
        # Common item keywords
        item_keywords = ['laptop', 'computer', 'macbook', 'iphone', 'ipad', 'phone', 'tablet', 
                        'groceries', 'food', 'milk', 'bread', 'eggs', 'coffee', 'gas', 'gasoline',
                        'banana', 'bananas', 'book', 'books', 'shirt', 'shirts', 'shoes', 'pants', 'jacket']
        
        # Find item keywords in transcript
        found_items = []
        for keyword in item_keywords:
            if keyword in transcript_lower:
                # Make sure it's not part of the store name
                if store_lower and keyword in store_lower:
                    continue
                # Check if keyword appears before "from" or "at"
                keyword_pos = transcript_lower.find(keyword)
                store_marker_pos = min(
                    transcript_lower.find(' from ', keyword_pos),
                    transcript_lower.find(' at ', keyword_pos)
                )
                if store_marker_pos == -1:
                    store_marker_pos = len(transcript_lower)
                # If keyword is before store marker, it's likely an item
                if keyword_pos < store_marker_pos:
                    found_items.append(keyword)
        
        if found_items:
            # Take the first meaningful item (prefer longer/more specific ones)
            items = max(found_items, key=len).title()
    
    # Final cleanup: remove store name if it somehow got in
    if items and store_lower:
        items_clean = re.sub(r'\b' + re.escape(store_lower) + r'\b', '', items, flags=re.IGNORECASE)
        items_clean = ' '.join(items_clean.split())  # Normalize whitespace
        if items_clean and len(items_clean) > 2:
            items = items_clean.strip()
    
    # Clean up items: remove extra whitespace, capitalize properly
    if items:
        items = ' '.join(items.split())  # Normalize whitespace
        # Don't capitalize if it's already a proper noun (like "MacBook")
        if items.lower() not in ['apple', 'google', 'microsoft', 'amazon', 'walmart', 'target', 'macbook', 'iphone', 'ipad']:
            items = items.title()
    
    # Extract categories based on items and store (can have multiple categories)
    categories = []
    transcript_lower = transcript.lower()
    items_lower = items.lower() if items else ""
    
    # Category mapping based on keywords
    category_keywords = {
        "Electronics": ["laptop", "computer", "macbook", "iphone", "ipad", "phone", "tablet", "tv", "television", "headphones", "speaker", "camera", "gaming", "console", "nintendo", "playstation", "xbox", "electronic", "device"],
        "Groceries": ["groceries", "milk", "bread", "eggs", "food", "banana", "bananas", "apple", "apples", "vegetables", "fruit", "fruits", "meat", "chicken", "beef", "pork", "fish", "dairy", "cheese", "yogurt", "produce"],
        "Clothing": ["shirt", "shirts", "pants", "jacket", "shoes", "sneakers", "dress", "jeans", "sweater", "hoodie", "clothes", "clothing", "apparel"],
        "Transportation": ["gas", "gasoline", "fuel", "uber", "lyft", "taxi", "bus", "train", "flight", "airline", "parking"],
        "Dining": ["restaurant", "cafe", "coffee", "lunch", "dinner", "breakfast", "pizza", "burger", "fast food", "takeout"],
        "Entertainment": ["movie", "cinema", "netflix", "spotify", "game", "games", "book", "books", "magazine", "subscription"],
        "Health": ["pharmacy", "medicine", "prescription", "vitamin", "supplement", "gym", "fitness", "doctor", "hospital"],
        "Home": ["furniture", "bed", "chair", "table", "sofa", "couch", "lamp", "decor", "kitchen", "appliance", "refrigerator", "washer", "dryer", "rent", "rental", "apartment", "house", "mortgage", "housing"],
        "Utilities": ["electric", "electricity", "water", "internet", "phone bill", "cable", "utility"],
        "Other": []
    }
    
    # Check for category matches - can match multiple categories
    matched_categories = set()
    for cat, keywords in category_keywords.items():
        if cat == "Other":
            continue  # Skip "Other" for now
        for keyword in keywords:
            if keyword in transcript_lower or keyword in items_lower:
                matched_categories.add(cat)
                break
    
    # If categories found, use them; otherwise try to infer from store
    if matched_categories:
        categories = sorted(list(matched_categories))  # Sort for consistency
    else:
        store_lower = store.lower() if store != "Unknown Store" else ""
        if any(word in store_lower for word in ["walmart", "target", "kroger", "safeway", "whole foods", "trader joe"]):
            categories = ["Groceries"]
        elif any(word in store_lower for word in ["apple", "best buy", "microcenter", "fry's"]):
            categories = ["Electronics"]
        elif any(word in store_lower for word in ["nike", "adidas", "h&m", "zara", "old navy"]):
            categories = ["Clothing"]
        elif any(word in store_lower for word in ["shell", "chevron", "bp", "exxon", "mobil"]):
            categories = ["Transportation"]
        else:
            categories = ["Other"]
    
    # Join multiple categories with comma
    category = ", ".join(categories) if categories else "Other"
    
    # Parse relative date from transcript (yesterday, tomorrow, etc.)
    date = parse_relative_date(transcript)
    
    return {
        "store": store,
        "items": items if items else "Various items",
        "category": category,
        "amount": amount,
        "date": date,
        **recurring_info
    }

# ============================================================================
# PYDANTIC MODELS (Request/Response Schemas)
# ============================================================================

class ExpenseResponse(BaseModel):
    id: int
    store: str
    items: str
    category: Optional[str]
    amount: Optional[float]
    date: str
    created_at: str

class AnalyticsResponse(BaseModel):
    total_expenses: float
    expense_count: int
    expenses_by_store: dict
    expenses_by_category: dict
    expenses_by_date: List[dict]
    recent_expenses: List[ExpenseResponse]

# ============================================================================
# API ENDPOINTS
# ============================================================================

# ----------------------------------------------------------------------------
# Root & Health Check
# ----------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"message": "Voxalyze Expense Tracker API"}

# ----------------------------------------------------------------------------
# Voice Transcription
# ----------------------------------------------------------------------------

@app.post("/api/transcribe")
@limiter.limit("10/minute")
async def transcribe_audio(
    request: Request,
    audio: UploadFile = File(...),
    current_user: dict = Depends(get_current_user_dependency)
):
    """Transcribe audio file to text using Deepgram API"""
    if not deepgram_available:
        raise HTTPException(
            status_code=503,
            detail="Deepgram API key not configured. Please set DEEPGRAM_API_KEY in .env file. Get a free API key at: https://console.deepgram.com/"
        )
    
    try:
        # Read audio file content
        audio_content = await audio.read()
        
        # Use Deepgram REST API v1 endpoint with nova-2 model
        # Note: flux-general-en requires WebSocket (v2/listen), which is more complex for file uploads
        # nova-2 works reliably with REST API and provides excellent transcription quality
        url = "https://api.deepgram.com/v1/listen"
        headers = {
            "Authorization": f"Token {deepgram_api_key}",
        }
        params = {
            "model": "nova-2",
            "smart_format": "true",
            "punctuate": "true",
        }
        
        # Send audio to Deepgram API using multipart form data
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers=headers,
                params=params,
                files={"audio": (audio.filename or "audio.webm", audio_content, audio.content_type or "audio/webm")}
            )
            response.raise_for_status()
            result = response.json()
        
        # Extract transcript from response (v2 format is the same as v1)
        if result.get("results") and result["results"].get("channels") and len(result["results"]["channels"]) > 0:
            transcript = result["results"]["channels"][0]["alternatives"][0]["transcript"]
            return {"transcript": transcript}
        else:
            raise HTTPException(
                status_code=500,
                detail="No transcript returned from Deepgram API"
            )
            
    except httpx.HTTPStatusError as e:
        print(f"Deepgram API HTTP error: {e.response.status_code} - {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Deepgram API error: {e.response.text}"
        )
    except Exception as e:
        print(f"Deepgram transcription error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(e)}"
        )

# ----------------------------------------------------------------------------
# Request Models
# ----------------------------------------------------------------------------

class TranscriptRequest(BaseModel):
    transcript: str

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

# ----------------------------------------------------------------------------
# Authentication Endpoints (Supabase Auth handles login/register)
# ----------------------------------------------------------------------------

@app.get("/api/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user_dependency)):
    """Get current user information"""
    return current_user

# ----------------------------------------------------------------------------
# Expense Extraction Endpoints
# ----------------------------------------------------------------------------

@app.post("/api/extract-expense-simple")
async def extract_expense_simple_endpoint(request: TranscriptRequest, current_user: dict = Depends(get_current_user_dependency)):
    """Extract expense information using simple regex (no API needed)"""
    transcript = request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")
    
    try:
        expense_data = extract_expense_simple(transcript)
        
        # Save to database with user_id
        if supabase is None:
            raise HTTPException(status_code=500, detail="Database not configured")
        
        response = supabase.table("expenses").insert({
            "user_id": current_user["id"],
            "store": expense_data["store"],
            "items": expense_data["items"],
            "category": expense_data.get("category"),
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "created_at": datetime.now().isoformat()
        }).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save expense")
        
        expense_id = response.data[0]["id"]
        
        return {
            "id": expense_id,
            "store": expense_data["store"],
            "items": expense_data["items"],
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "message": "Expense saved successfully (using simple extraction)"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simple extraction error: {str(e)}")

@app.post("/api/extract-expense")
@limiter.limit("20/minute")
async def extract_expense(request: Request, transcript_request: TranscriptRequest, current_user: dict = Depends(get_current_user_dependency)):
    """Extract expense information from transcript using Groq (primary) or simple extraction (fallback)"""
    transcript = transcript_request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")
    
    # Try Groq first (faster, free tier available)
    if groq_client:
        today_str = datetime.now().strftime("%Y-%m-%d")
        yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            
        # Simplified, structured system prompt
        system_prompt = f"""You extract expense data from voice transcripts into JSON.

OUTPUT FORMAT: Always return a JSON array, even for single expenses.

EXPENSE OBJECT STRUCTURE:
{{
  "store": "Store name (capitalize properly)",
  "items": "Product name ONLY (no articles, no action words)",
  "category": "One category from: Electronics, Groceries, Clothing, Transportation, Dining, Entertainment, Health, Home, Utilities, Other",
  "amount": <number>,
  "date": "YYYY-MM-DD",
  "is_recurring": true/false,
  "recurring_interval": <number or null>,
  "recurring_unit": "days" | "weeks" | "months" | "years" | null
}}

CRITICAL RULES:
1. ITEMS FIELD - EXTRACT ONLY PRODUCT NAMES:
   - Extract ACTUAL PRODUCT NAMES, NOT the category name, NOT prices, NOT "worth of"
   - "I got groceries at Target, spent $12 on bananas" → items = "bananas" (NOT "groceries", NOT "$12 worth of bananas")
   - "$13 worth of banana" → items = "banana" (remove "$13 worth of")
   - "$6 worth of ice cream" → items = "ice cream" (remove "$6 worth of")
   - "$13 worth of banana, $6 worth of ice cream, $4 worth of pineapple juice" → items = "banana, ice cream, pineapple juice" (remove ALL prices and "worth of")
   - Remove ALL articles: "an iPad" → "iPad", "a laptop" → "laptop", "the milk" → "milk"
   - Remove action words: "bought", "got", "purchased", "I", "spent", "worth of"
   - Remove price information: "$13", "$6", "$4" should NEVER appear in items field
   - Apple products: "iPad", "iPhone", "MacBook" (exact capitalization)
   - NEVER include: store name, category name, prices, dollar amounts, "worth of" in items field

2. MULTIPLE ITEMS WITH INDIVIDUAL PRICES - CRITICAL:
   - When you see MULTIPLE dollar amounts with different items at the SAME store, COMBINE them into ONE expense
   - The "amount" should be the SUM of all individual prices
   - The "items" should list all items separated by commas
   - Look for patterns like: "$X worth of item1, $Y worth of item2, and $Z worth of item3"
   - Example: "$17 worth of ice cream, $4 worth of strawberries, and $32 worth of chocolate at Target"
     → ONE expense: {{"items": "ice cream, strawberries, chocolate", "amount": 53}} (17+4+32=53)
   - Example: "$17 worth of chocolate, $14 worth of bananas, and $7 worth of bread from Target"
     → ONE expense: {{"items": "chocolate, bananas, bread", "amount": 38}} (17+14+7=38)
   - Example: "spent $12 on bananas, $13 on cereal, $14 on strawberries at Walmart"
     → ONE expense: {{"items": "bananas, cereal, strawberries", "amount": 39}} (12+13+14=39)

3. AMOUNTS:
   - If multiple items with individual prices are combined: SUM the amounts
   - Numbers like 700, 800, 900 = whole dollars (700, 800, 900)
   - 4-5 digit numbers like 2350 = 23.50, 1234 = 12.34
   - Always return as number (no $ symbol)

4. DATES:
   - "today" = {today_str}
              - "yesterday" = {yesterday_str}
              - "tomorrow" = {tomorrow_str}
   - If not mentioned, use {today_str}

5. RECURRING EXPENSES - IMPORTANT:
   - Detect if user mentions the expense is recurring/repeating
   - Keywords: "monthly", "weekly", "every week", "every month", "every 2 weeks", "biweekly", "annually", "yearly", "recurring", "subscription"
   - Set is_recurring: true when recurring is mentioned
   - Set recurring_interval: the number (default 1 if not specified)
   - Set recurring_unit: "days", "weeks", "months", or "years"
   - Examples:
     - "monthly" or "every month" → is_recurring: true, recurring_interval: 1, recurring_unit: "months"
     - "weekly" or "every week" → is_recurring: true, recurring_interval: 1, recurring_unit: "weeks"
     - "every 2 weeks" or "biweekly" → is_recurring: true, recurring_interval: 2, recurring_unit: "weeks"
     - "every 3 months" or "quarterly" → is_recurring: true, recurring_interval: 3, recurring_unit: "months"
     - "yearly" or "annually" → is_recurring: true, recurring_interval: 1, recurring_unit: "years"
   - If NOT recurring, set: is_recurring: false, recurring_interval: null, recurring_unit: null

EXAMPLES:
Input: "I bought an iPad from Target for $700"
Output: [{{"store": "Target", "items": "iPad", "category": "Electronics", "amount": 700, "date": "{today_str}"}}]

Input: "got eggs and milk at Walmart for $10"
Output: [{{"store": "Walmart", "items": "eggs and milk", "category": "Groceries", "amount": 10, "date": "{today_str}"}}]

Input: "I got $17 worth of ice cream, $4 worth of strawberries, and $32 worth of chocolate at Target today"
Output: [{{"store": "Target", "items": "ice cream, strawberries, chocolate", "category": "Groceries", "amount": 53, "date": "{today_str}"}}]

Input: "I got groceries at Target, spent $12 on bananas, $13 on cereal, and $14 on strawberries"
Output: [{{"store": "Target", "items": "bananas, cereal, strawberries", "category": "Groceries", "amount": 39, "date": "{today_str}"}}]

Input: "I got $13 worth of banana, $6 worth of ice cream, and $4 worth of pineapple juice at Target"
Output: [{{"store": "Target", "items": "banana, ice cream, pineapple juice", "category": "Groceries", "amount": 23, "date": "{today_str}"}}]

Input: "bought candy for $5 and an iPad for $700 at Target"
Output: [{{"store": "Target", "items": "candy, iPad", "category": "Other", "amount": 705, "date": "{today_str}"}}]

Input: "purchased a MacBook from Apple Store yesterday for $2000"
Output: [{{"store": "Apple Store", "items": "MacBook", "category": "Electronics", "amount": 2000, "date": "{yesterday_str}", "is_recurring": false, "recurring_interval": null, "recurring_unit": null}}]

Input: "I pay $15 monthly for Netflix"
Output: [{{"store": "Netflix", "items": "subscription", "category": "Entertainment", "amount": 15, "date": "{today_str}", "is_recurring": true, "recurring_interval": 1, "recurring_unit": "months"}}]

Input: "my rent is $1500 every month"
Output: [{{"store": "Landlord", "items": "rent", "category": "Home", "amount": 1500, "date": "{today_str}", "is_recurring": true, "recurring_interval": 1, "recurring_unit": "months"}}]

Input: "I pay $50 every 2 weeks for gym membership"
Output: [{{"store": "Gym", "items": "membership", "category": "Health", "amount": 50, "date": "{today_str}", "is_recurring": true, "recurring_interval": 2, "recurring_unit": "weeks"}}]

Input: "spotify subscription is $10 monthly"
Output: [{{"store": "Spotify", "items": "subscription", "category": "Entertainment", "amount": 10, "date": "{today_str}", "is_recurring": true, "recurring_interval": 1, "recurring_unit": "months"}}]

Today is {today_str}."""

        user_prompt = f"""Extract expenses from: "{transcript}"

Return JSON array only, no other text."""

        try:
            # First attempt with structured prompt
            response = groq_client.chat.completions.create(
                model="llama-3.1-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1
            )
            
            # Parse the response
            content = response.choices[0].message.content.strip()
            # Remove markdown code blocks if present
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            expenses_data = json.loads(content)

            # Ensure we have an array
            if not isinstance(expenses_data, list):
                expenses_data = [expenses_data]

            # Post-process and validate expenses
            validated_expenses = []
            for expense_data in expenses_data:
                try:
                    validated = validate_expense(expense_data, today_str)
                    validated_expenses.append(validated)
                except ValueError as e:
                    print(f"Validation error for expense: {e}, skipping...")
                    continue

            if not validated_expenses:
                raise ValueError("No valid expenses extracted")

            # Save to database
            saved_expenses = []
            if supabase is None:
                raise HTTPException(status_code=500, detail="Database not configured")

            for expense in validated_expenses:
                # Handle date parsing
                date_str = expense.get("date", "")
                if date_str and (date_str.lower() in ["yesterday", "tomorrow", "today"] or "ago" in date_str.lower() or "last week" in date_str.lower()):
                    date = parse_relative_date(transcript)
                elif date_str:
                    date = date_str
                else:
                    date = parse_relative_date(transcript)

                # Extract recurring info
                is_recurring = expense.get("is_recurring", False)
                recurring_interval = expense.get("recurring_interval")
                recurring_unit = expense.get("recurring_unit")

                response = supabase.table("expenses").insert({
                    "user_id": current_user["id"],
                    "store": expense["store"],
                    "items": expense["items"],
                    "category": expense["category"],
                    "amount": expense["amount"],
                    "date": date,
                    "created_at": datetime.now().isoformat(),
                    "is_recurring": 1 if is_recurring else 0,
                    "recurring_interval": recurring_interval,
                    "recurring_unit": recurring_unit
                }).execute()

                if not response.data:
                    continue
                
                expense_id = response.data[0]["id"]

                saved_expenses.append({
                    "id": expense_id,
                    "store": expense["store"],
                    "items": expense["items"],
                    "category": expense["category"],
                    "amount": expense["amount"],
                    "date": date,
                    "is_recurring": is_recurring,
                    "recurring_interval": recurring_interval,
                    "recurring_unit": recurring_unit
                })

            print(f"Groq extraction successful: {len(saved_expenses)} expense(s) saved")
            return {
                "expenses": saved_expenses,
                "count": len(saved_expenses),
                "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq)"
            }
            
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            print(f"First Groq extraction attempt failed: {e}, trying simpler prompt...")
            # Retry with simpler prompt
            try:
                simple_prompt = f"""Extract expense from: "{transcript}"

Return JSON array: [{{"store": "...", "items": "...", "category": "...", "amount": <number>, "date": "YYYY-MM-DD"}}]

If multiple items with different prices, return array of objects.
Today is {today_str}. Remove articles (a, an, the) from items."""

                response = groq_client.chat.completions.create(
                    model="llama-3.1-70b-versatile",
                    messages=[{"role": "user", "content": simple_prompt}],
                    temperature=0.1
                )
                
                content = response.choices[0].message.content.strip()
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                
                expenses_data = json.loads(content)
                if not isinstance(expenses_data, list):
                    expenses_data = [expenses_data]

                # Validate and save
                validated_expenses = []
                for expense_data in expenses_data:
                    try:
                        validated = validate_expense(expense_data, today_str)
                        validated_expenses.append(validated)
                    except ValueError:
                        continue

                if validated_expenses:
                    saved_expenses = []
                    if supabase is None:
                        raise HTTPException(status_code=500, detail="Database not configured")
                    
                    for expense in validated_expenses:
                        date = expense.get("date", today_str)
                        if not re.match(r'\d{4}-\d{2}-\d{2}', str(date)):
                            date = parse_relative_date(transcript)

                        # Extract recurring info
                        is_recurring = expense.get("is_recurring", False)
                        recurring_interval = expense.get("recurring_interval")
                        recurring_unit = expense.get("recurring_unit")

                        response = supabase.table("expenses").insert({
                            "user_id": current_user["id"],
                            "store": expense["store"],
                            "items": expense["items"],
                            "category": expense["category"],
                            "amount": expense["amount"],
                            "date": date,
                            "created_at": datetime.now().isoformat(),
                            "is_recurring": 1 if is_recurring else 0,
                            "recurring_interval": recurring_interval,
                            "recurring_unit": recurring_unit
                        }).execute()

                        if not response.data:
                            continue
                        
                        expense_id = response.data[0]["id"]

                        saved_expenses.append({
                            "id": expense_id,
                            "store": expense["store"],
                            "items": expense["items"],
                            "category": expense["category"],
                            "amount": expense["amount"],
                            "date": date,
                            "is_recurring": is_recurring,
                            "recurring_interval": recurring_interval,
                            "recurring_unit": recurring_unit
                        })

                    return {
                        "expenses": saved_expenses,
                        "count": len(saved_expenses),
                        "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq - retry)"
                    }
            except Exception as retry_error:
                print(f"Retry also failed: {retry_error}")
                # Fall through to simple extraction
        except Exception as e:
            print(f"Groq error: {str(e)}")
            import traceback
            traceback.print_exc()
            # Fall through to simple extraction
    
    # Fallback to simple extraction if Groq fails or unavailable
    print("Using simple extraction (Groq unavailable or failed)")
    expenses_data = extract_expense_simple(transcript)
    print(f"Simple extraction result: {expenses_data}")

    # Ensure we have a list
    if not isinstance(expenses_data, list):
        expenses_data = [expenses_data]

    # Save to database with user_id
    saved_expenses = []
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    for expense_data in expenses_data:
        # Extract recurring info
        is_recurring = expense_data.get("is_recurring", False)
        recurring_interval = expense_data.get("recurring_interval")
        recurring_unit = expense_data.get("recurring_unit")

        response = supabase.table("expenses").insert({
            "user_id": current_user["id"],
            "store": expense_data["store"],
            "items": expense_data["items"],
            "category": expense_data.get("category"),
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "created_at": datetime.now().isoformat(),
            "is_recurring": 1 if is_recurring else 0,
            "recurring_interval": recurring_interval,
            "recurring_unit": recurring_unit
        }).execute()

        if not response.data:
            continue
        
        expense_id = response.data[0]["id"]

        saved_expenses.append({
            "id": expense_id,
            "store": expense_data["store"],
            "items": expense_data["items"],
            "category": expense_data.get("category"),
            "amount": expense_data["amount"],
            "date": expense_data["date"],
            "is_recurring": is_recurring,
            "recurring_interval": recurring_interval,
            "recurring_unit": recurring_unit
        })

    return {
        "expenses": saved_expenses,
        "count": len(saved_expenses),
        "message": f"{len(saved_expenses)} expense(s) saved successfully (using simple extraction - Groq unavailable)"
    }

# ----------------------------------------------------------------------------
# Expense Management Endpoints
# ----------------------------------------------------------------------------

@app.post("/api/expenses")
async def create_expense(
    expense: ExpenseCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new expense"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        response = supabase.table("expenses").insert({
            "user_id": current_user["id"],
            "store": expense.store,
            "items": expense.items or "Various items",
            "category": expense.category,
            "amount": expense.amount,
            "date": expense.date,
            "created_at": datetime.now().isoformat()
        }).execute()

        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to create expense")

        expense_id = response.data[0]["id"]

        return {
            "id": expense_id,
            "store": expense.store,
            "items": expense.items or "Various items",
            "category": expense.category,
            "amount": expense.amount,
            "date": expense.date,
            "message": "Expense created successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create expense: {str(e)}")

@app.get("/api/expenses")
async def get_expenses(
    current_user: dict = Depends(get_current_user_dependency),
    search: Optional[str] = None,
    category: Optional[str] = None,
    store: Optional[str] = None,
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: Optional[str] = "date",
    sort_order: Optional[str] = "desc",
    recurring: Optional[bool] = None
):
    """
    Get expenses for the current user with search, filtering, and sorting

    Query Parameters:
    - search: Search in store, items, or category fields
    - category: Filter by category (exact match)
    - store: Filter by store name (exact match)
    - min_amount: Minimum amount filter
    - max_amount: Maximum amount filter
    - start_date: Start date filter (YYYY-MM-DD)
    - end_date: End date filter (YYYY-MM-DD)
    - sort_by: Sort field (date, amount, store, created_at)
    - sort_order: Sort direction (asc, desc)
    - recurring: Filter by recurring status (true/false)
    """
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    # Start building query
    query = supabase.table("expenses").select("*").eq("user_id", current_user["id"])
    
    # Search filter (searches in store, items, and category)
    if search:
        # Supabase doesn't support OR in filters easily, so we'll filter client-side for search
        # For now, search in store field
        query = query.ilike("store", f"%{search}%")
    
    # Category filter
    if category:
        query = query.ilike("category", f"%{category}%")
    
    # Store filter
    if store:
        query = query.ilike("store", f"%{store}%")
    
    # Amount filters
    if min_amount is not None:
        query = query.gte("amount", min_amount)
    
    if max_amount is not None:
        query = query.lte("amount", max_amount)
    
    # Date filters
    if start_date:
        query = query.gte("date", start_date)

    if end_date:
        query = query.lte("date", end_date)

    # Recurring filter
    if recurring is not None:
        query = query.eq("is_recurring", 1 if recurring else 0)

    # Sorting
    valid_sort_fields = {"date", "amount", "store", "created_at"}
    sort_field = sort_by if sort_by in valid_sort_fields else "date"
    sort_direction = "desc" if sort_order.lower() == "desc" else "asc"
    query = query.order(sort_field, desc=(sort_direction == "desc"))
    
    response = query.execute()
    expenses = response.data
    
    # Apply search filter to items and category if search was provided
    if search:
        search_lower = search.lower()
        expenses = [
            exp for exp in expenses
            if search_lower in exp.get("store", "").lower() or
               search_lower in exp.get("items", "").lower() or
               search_lower in exp.get("category", "").lower()
        ]
    
    return {"expenses": expenses, "count": len(expenses)}

# ----------------------------------------------------------------------------
# Analytics Endpoint
# ----------------------------------------------------------------------------

@app.get("/api/analytics")
async def get_analytics(
    current_user: dict = Depends(get_current_user_dependency),
    category: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Get analytics data for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    query = supabase.table("expenses").select("*").eq("user_id", current_user["id"])
    
    # Apply filters
    if category:
        query = query.ilike("category", f"%{category}%")
    
    if start_date:
        query = query.gte("date", start_date)
    
    if end_date:
        query = query.lte("date", end_date)
    
    if month and year:
        # Filter by month and year
        start = f"{year}-{month:02d}-01"
        if month == 12:
            end = f"{year}-12-31"
        else:
            from datetime import datetime as dt
            next_month = dt(year, month + 1, 1)
            from datetime import timedelta
            last_day = (next_month - timedelta(days=1)).day
            end = f"{year}-{month:02d}-{last_day:02d}"
        query = query.gte("date", start).lte("date", end)
    elif year:
        query = query.gte("date", f"{year}-01-01").lte("date", f"{year}-12-31")
    
    response = query.execute()
    expenses = response.data
    
    # Calculate analytics
    # Handle None/NULL amounts from database
    total_expenses = sum(float(exp.get("amount") or 0) if exp.get("amount") is not None else 0 for exp in expenses)
    expense_count = len(expenses)
    
    # Expenses by store
    expenses_by_store = {}
    for exp in expenses:
        store = exp["store"]
        amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
        expenses_by_store[store] = expenses_by_store.get(store, 0) + amount
    
    # Expenses by category (handle multiple categories per expense)
    expenses_by_category = {}
    for exp in expenses:
        categories_str = exp.get("category") or "Other"
        amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
        
        # Split multiple categories (comma-separated)
        categories = [cat.strip() for cat in categories_str.split(",")] if categories_str else ["Other"]
        
        # Distribute amount evenly across categories, or you could use the full amount for each
        # Using full amount for each category (so if $100 is Electronics, Groceries, both get $100)
        for category in categories:
            if category:
                expenses_by_category[category] = expenses_by_category.get(category, 0) + amount
    
    # Expenses by date
    expenses_by_date = {}
    for exp in expenses:
        date = exp["date"]
        amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
        expenses_by_date[date] = expenses_by_date.get(date, 0) + amount
    
    expenses_by_date_list = [{"date": date, "amount": amount} for date, amount in sorted(expenses_by_date.items())]
    
    # Recent expenses (last 10)
    recent_expenses = expenses[:10]
    
    return {
        "total_expenses": total_expenses,
        "expense_count": expense_count,
        "expenses_by_store": expenses_by_store,
        "expenses_by_category": expenses_by_category,
        "expenses_by_date": expenses_by_date_list,
        "recent_expenses": recent_expenses
    }

# ----------------------------------------------------------------------------
# Expense Update & Delete Endpoints
# ----------------------------------------------------------------------------

@app.put("/api/expenses/{expense_id}")
async def update_expense(
    expense_id: int,
    expense_update: ExpenseUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update an expense (only if it belongs to the current user)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    # Check if expense exists and belongs to user
    response = supabase.table("expenses").select("id").eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Build update dictionary
    update_data = {}
    
    if expense_update.store is not None:
        update_data["store"] = expense_update.store
    
    if expense_update.items is not None:
        update_data["items"] = expense_update.items
    
    if expense_update.category is not None:
        update_data["category"] = expense_update.category
    
    if expense_update.amount is not None:
        update_data["amount"] = expense_update.amount
    
    if expense_update.date is not None:
        update_data["date"] = expense_update.date
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    supabase.table("expenses").update(update_data).eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    
    return {"message": "Expense updated successfully"}

@app.delete("/api/expenses/bulk")
async def delete_expenses_bulk(
    request: BulkDeleteRequest,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete multiple expenses by their IDs"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    if not request.expense_ids:
        raise HTTPException(status_code=400, detail="No expense IDs provided")

    # Delete expenses that belong to the user
    deleted_count = 0
    for expense_id in request.expense_ids:
        response = supabase.table("expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()
        if response.data:
            deleted_count += 1
    
    return {"message": f"{deleted_count} expense(s) deleted successfully", "deleted_count": deleted_count}

@app.delete("/api/expenses/{expense_id}")
async def delete_expense(expense_id: int, current_user: dict = Depends(get_current_user_dependency)):
    """Delete an expense (only if it belongs to the current user)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    response = supabase.table("expenses").delete().eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted successfully"}

@app.delete("/api/expenses")
async def delete_all_expenses(current_user: dict = Depends(get_current_user_dependency)):
    """Delete all expenses for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    response = supabase.table("expenses").delete().eq("user_id", current_user["id"]).execute()
    deleted = len(response.data) if response.data else 0

    return {"message": f"All expenses deleted successfully ({deleted} expenses removed)"}

# ----------------------------------------------------------------------------
# Budget Management Endpoints
# ----------------------------------------------------------------------------

@app.get("/api/budgets")
async def get_budgets(
    current_user: dict = Depends(get_current_user_dependency),
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """Get budgets for the current user"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    query = supabase.table("budgets").select("*").eq("user_id", current_user["id"])
    
    if month and year:
        query = query.eq("month", month).eq("year", year).order("category")
    elif year:
        query = query.eq("year", year).order("month").order("category")
    else:
        now = datetime.now()
        query = query.eq("month", now.month).eq("year", now.year).order("category")
    
    response = query.execute()
    budgets = response.data
    return {"budgets": budgets, "count": len(budgets)}

@app.post("/api/budgets")
async def create_budget(
    budget: BudgetCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new budget"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    try:
        # Determine if recurring
        is_recurring = budget.recurring and budget.repeat_interval and budget.repeat_unit
        recurring_int = 1 if is_recurring else 0
        
        # Check if budget already exists
        response = supabase.table("budgets").select("id").eq("user_id", current_user["id"]).eq("category", budget.category).eq("month", budget.month).eq("year", budget.year).execute()
        if response.data:
            raise HTTPException(status_code=400, detail="Budget already exists for this category, month, and year")
        
        # Create budgets
        now = datetime.now().isoformat()
        created_budgets = []
        current_date = datetime(budget.year, budget.month, 1)
        
        # Calculate how many periods to create
        if is_recurring:
            if budget.repeat_unit == "weeks":
                total_periods = min(52 // budget.repeat_interval if budget.repeat_interval > 0 else 12, 60)
            elif budget.repeat_unit == "months":
                total_periods = min(12 // budget.repeat_interval if budget.repeat_interval > 0 else 12, 60)
            elif budget.repeat_unit == "years":
                total_periods = min(5 // budget.repeat_interval if budget.repeat_interval > 0 else 5, 60)
            else:
                total_periods = 12
        else:
            total_periods = 1
        
        for i in range(total_periods):
            if i > 0:
                if budget.repeat_unit == "weeks":
                    next_date = current_date + timedelta(weeks=budget.repeat_interval * i)
                    next_month = next_date.month
                    next_year = next_date.year
                elif budget.repeat_unit == "months":
                    next_month = budget.month + (budget.repeat_interval * i)
                    next_year = budget.year
                    while next_month > 12:
                        next_month -= 12
                        next_year += 1
                elif budget.repeat_unit == "years":
                    next_month = budget.month
                    next_year = budget.year + (budget.repeat_interval * i)
                else:
                    break
            else:
                next_month = budget.month
                next_year = budget.year
            
            # Check if already exists
            check_response = supabase.table("budgets").select("id").eq("user_id", current_user["id"]).eq("category", budget.category).eq("month", next_month).eq("year", next_year).execute()
            if check_response.data:
                continue
            
            response = supabase.table("budgets").insert({
                "user_id": current_user["id"],
                "category": budget.category,
                "amount": budget.amount,
                "month": next_month,
                "year": next_year,
                "recurring": recurring_int,
                "repeat_interval": budget.repeat_interval,
                "repeat_unit": budget.repeat_unit,
                "created_at": now,
                "updated_at": now
            }).execute()
            
            if response.data:
                created_budgets.append(response.data[0]["id"])
        
        message = f"{len(created_budgets)} budget(s) created successfully"
        if is_recurring:
            message += f" (recurring every {budget.repeat_interval} {budget.repeat_unit})"
        
        return {
            "id": created_budgets[0] if created_budgets else None,
            "category": budget.category,
            "amount": budget.amount,
            "month": budget.month,
            "year": budget.year,
            "recurring": is_recurring,
            "repeat_interval": budget.repeat_interval,
            "repeat_unit": budget.repeat_unit,
            "message": message
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create budget: {str(e)}")

@app.put("/api/budgets/{budget_id}")
async def update_budget(
    budget_id: int,
    budget_update: BudgetUpdate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Update a budget"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    # Check if budget exists
    response = supabase.table("budgets").select("*").eq("id", budget_id).eq("user_id", current_user["id"]).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    existing_dict = response.data[0]
    
    # Build update data
    update_data = {}
    
    if budget_update.category is not None:
        update_data["category"] = budget_update.category
    
    if budget_update.amount is not None:
        update_data["amount"] = budget_update.amount
    
    if budget_update.month is not None:
        update_data["month"] = budget_update.month
    
    if budget_update.year is not None:
        update_data["year"] = budget_update.year
    
    # Handle recurring fields
    if budget_update.repeat_interval is not None:
        update_data["repeat_interval"] = budget_update.repeat_interval
    
    if budget_update.repeat_unit is not None:
        update_data["repeat_unit"] = budget_update.repeat_unit
    
    # Set recurring flag based on whether repeat_interval and repeat_unit are provided
    if budget_update.recurring is not None:
        update_data["recurring"] = 1 if budget_update.recurring else 0
    elif budget_update.repeat_interval is not None or budget_update.repeat_unit is not None:
        # Auto-determine recurring status
        final_repeat_interval = budget_update.repeat_interval if budget_update.repeat_interval is not None else existing_dict.get("repeat_interval")
        final_repeat_unit = budget_update.repeat_unit if budget_update.repeat_unit is not None else existing_dict.get("repeat_unit")
        is_recurring = (final_repeat_interval is not None and final_repeat_interval != 0) and (final_repeat_unit is not None and final_repeat_unit != "")
        update_data["recurring"] = 1 if is_recurring else 0
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields provided to update")
    
    # Check for conflicts if changing category/month/year
    new_category = budget_update.category if budget_update.category is not None else existing_dict["category"]
    new_month = budget_update.month if budget_update.month is not None else existing_dict["month"]
    new_year = budget_update.year if budget_update.year is not None else existing_dict["year"]
    
    if (budget_update.category is not None or budget_update.month is not None or budget_update.year is not None):
        check_response = supabase.table("budgets").select("id").eq("user_id", current_user["id"]).eq("category", new_category).eq("month", new_month).eq("year", new_year).neq("id", budget_id).execute()
        if check_response.data:
            raise HTTPException(status_code=400, detail="Budget already exists for this category, month, and year")
    
    update_data["updated_at"] = datetime.now().isoformat()
    
    supabase.table("budgets").update(update_data).eq("id", budget_id).eq("user_id", current_user["id"]).execute()
    
    return {"message": "Budget updated successfully"}

@app.delete("/api/budgets/{budget_id}")
async def delete_budget(
    budget_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a budget"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    response = supabase.table("budgets").delete().eq("id", budget_id).eq("user_id", current_user["id"]).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    return {"message": "Budget deleted successfully"}

@app.get("/api/budgets/check")
async def check_budgets(
    current_user: dict = Depends(get_current_user_dependency),
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """Get budgets with actual spending"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    # Get budgets
    query = supabase.table("budgets").select("*").eq("user_id", current_user["id"])
    
    if month and year:
        query = query.eq("month", month).eq("year", year).order("category")
    elif year:
        query = query.eq("year", year).order("month").order("category")
    else:
        query = query.order("year", desc=True).order("month", desc=True).order("category")
    
    response = query.execute()
    budgets = response.data if response.data else []
    
    # Calculate spending for each budget
    budget_status = []
    for budget in budgets:
        start_date = f"{budget['year']}-{budget['month']:02d}-01"
        if budget['month'] == 12:
            end_date = f"{budget['year']}-12-31"
        else:
            next_month = datetime(budget['year'], budget['month'] + 1, 1)
            last_day = (next_month - timedelta(days=1)).day
            end_date = f"{budget['year']}-{budget['month']:02d}-{last_day:02d}"
        
        # Get expenses for this period - use case-insensitive category matching
        # Also handle comma-separated categories (e.g., "Home, Utilities")
        budget_category = budget["category"].strip()
        
        # First try exact match (case-insensitive)
        # Note: Supabase doesn't have direct LOWER(TRIM()) support, so we'll fetch and filter
        expense_query = supabase.table("expenses").select("amount, category").eq("user_id", current_user["id"]).gte("date", start_date).lte("date", end_date).execute()
        
        expenses = expense_query.data if expense_query.data else []
        actual_spending = 0
        
        # Filter and sum expenses matching the budget category (case-insensitive)
        for exp in expenses:
            exp_category = (exp.get("category") or "").strip()
            if exp_category.lower() == budget_category.lower():
                amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
                actual_spending += amount
        
        # If no exact match, try pattern matching for comma-separated categories
        if actual_spending == 0:
            for exp in expenses:
                exp_category = (exp.get("category") or "").strip().lower()
                budget_cat_lower = budget_category.lower()
                # Check if budget category appears in expense category
                if (exp_category.startswith(budget_cat_lower + ",") or 
                    f", {budget_cat_lower}," in exp_category or
                    exp_category.endswith(f", {budget_cat_lower}")):
                    amount = float(exp.get("amount") or 0) if exp.get("amount") is not None else 0
                    actual_spending += amount
        
        percentage_used = (actual_spending / budget["amount"] * 100) if budget["amount"] > 0 else 0
        remaining = budget["amount"] - actual_spending
        
        alert_level = "ok"
        if percentage_used >= 100:
            alert_level = "exceeded"
        elif percentage_used >= 90:
            alert_level = "warning"
        elif percentage_used >= 75:
            alert_level = "caution"
        
        budget_status.append({
            **budget,
            "actual_spending": actual_spending,
            "remaining": remaining,
            "percentage_used": round(percentage_used, 2),
            "alert_level": alert_level
        })
    
    return {"budgets": budget_status}

# ----------------------------------------------------------------------------
# Recurring Expenses Endpoints
# ----------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event():
    """Process due recurring expenses on app startup"""
    try:
        created = process_due_recurring_expenses()
        if created > 0:
            print(f"Startup: Created {created} recurring expense(s)")
    except Exception as e:
        print(f"Startup recurring check error: {e}")

@app.post("/api/recurring/process")
async def process_recurring(current_user: dict = Depends(get_current_user_dependency)):
    """Manually trigger processing of due recurring expenses"""
    try:
        created = process_due_recurring_expenses()
        return {
            "message": f"Processed recurring expenses",
            "created_count": created
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing recurring expenses: {str(e)}")

@app.get("/api/recurring")
async def get_recurring_expenses(current_user: dict = Depends(get_current_user_dependency)):
    """Get all recurring expense templates (parent recurring expenses)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    response = supabase.table("expenses").select("*").eq("user_id", current_user["id"]).eq("is_recurring", 1).is_("parent_recurring_id", "null").order("date", desc=True).execute()
    
    recurring = response.data if response.data else []
    return {"recurring_expenses": recurring, "count": len(recurring)}

@app.delete("/api/recurring/{expense_id}")
async def stop_recurring(expense_id: int, current_user: dict = Depends(get_current_user_dependency)):
    """Stop a recurring expense (sets is_recurring to 0)"""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")
    
    # Update the parent expense to stop recurring
    response = supabase.table("expenses").update({"is_recurring": 0}).eq("id", expense_id).eq("user_id", current_user["id"]).execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Recurring expense not found")

    return {"message": "Recurring expense stopped successfully"}

# ============================================================================
# APPLICATION ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

