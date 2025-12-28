from fastapi import FastAPI, File, UploadFile, HTTPException, Body, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import sqlite3
import json
import os
import re
from groq import Groq
import io
import base64
from dotenv import load_dotenv
from jose import JWTError, jwt
import bcrypt

# Load environment variables
load_dotenv()

app = FastAPI(title="Voxalyze Expense Tracker API")

# JWT Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

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

# Initialize Groq client (primary - faster and free tier available)
groq_api_key = os.getenv("GROQ_API_KEY", "")
if not groq_api_key or groq_api_key == "your_groq_api_key_here":
    print("WARNING: GROQ_API_KEY not set. Please set your API key in .env file")
    print("Get a free API key at: https://console.groq.com/")
groq_client = Groq(api_key=groq_api_key) if groq_api_key and groq_api_key != "your_groq_api_key_here" else None

# Database setup
DB_PATH = "voxalyze.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
    # Create expenses table with user_id
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            store TEXT NOT NULL,
            items TEXT NOT NULL,
            category TEXT,
            amount REAL,
            date TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    
    # Add user_id column if it doesn't exist (migration for existing databases)
    try:
        cursor.execute("ALTER TABLE expenses ADD COLUMN user_id INTEGER")
        conn.commit()
    except sqlite3.OperationalError:
        # Column already exists, ignore
        pass
    
    # Add category column if it doesn't exist (migration for existing databases)
    try:
        cursor.execute("ALTER TABLE expenses ADD COLUMN category TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        # Column already exists, ignore
        pass
    
    conn.commit()
    conn.close()

init_db()

# Authentication helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a hash"""
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get the current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        if user_id_str is None:
            raise credentials_exception
        user_id = int(user_id_str)  # Convert back to int
    except (JWTError, ValueError, TypeError):
        raise credentials_exception
    
    # Verify user exists
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if user is None:
        raise credentials_exception
    
    return {"id": user[0], "username": user[1]}

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
    """Parse amount string to float, handling special cases"""
    try:
        if '.' not in amount_str:
            num = int(amount_str)
            num_digits = len(amount_str)
            if 3 <= num_digits <= 5 and num < 100000:
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

def clean_item_name(item: str) -> str:
    """Clean up item name"""
    item = re.sub(r'\b(got|bought|purchased|the|a|an|some)\b', '', item, flags=re.IGNORECASE)
    item = item.strip()
    return item.title() if item else "Various items"

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
        "Home": ["furniture", "bed", "chair"],
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

def extract_expense_simple(transcript: str):
    """Simple regex-based expense extraction as fallback when Groq is unavailable
    Returns a list of expense dicts if multiple items detected, otherwise a single dict"""
    transcript_lower = transcript.lower()

    # First, try to detect multiple items with individual prices
    # Pattern: "item1 for $X and item2 for $Y"
    multi_item_pattern = r'([a-z\s]+?)\s+for\s+\$?(\d+\.?\d*)\s+and\s+([a-z\s]+?)\s+for\s+\$?(\d+\.?\d*)'
    multi_match = re.search(multi_item_pattern, transcript_lower, re.IGNORECASE)

    if multi_match:
        # Found multiple items with individual prices
        item1 = multi_match.group(1).strip()
        amount1_str = multi_match.group(2)
        item2 = multi_match.group(3).strip()
        amount2_str = multi_match.group(4)

        # Parse amounts
        amount1 = parse_amount(amount1_str)
        amount2 = parse_amount(amount2_str)

        # Extract store (same for both)
        store = extract_store(transcript)
        date = parse_relative_date(transcript)

        # Clean up items
        item1 = clean_item_name(item1)
        item2 = clean_item_name(item2)

        # Categorize each item
        category1 = categorize_item(item1, store)
        category2 = categorize_item(item2, store)

        return [
            {
                "store": store,
                "items": item1,
                "category": category1,
                "amount": amount1,
                "date": date
            },
            {
                "store": store,
                "items": item2,
                "category": category2,
                "amount": amount2,
                "date": date
            }
        ]

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
        "Home": ["furniture", "bed", "chair", "table", "sofa", "couch", "lamp", "decor", "kitchen", "appliance", "refrigerator", "washer", "dryer"],
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
        "date": date
    }

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

@app.get("/")
async def root():
    return {"message": "Voxalyze Expense Tracker API"}

@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio file to text - Note: Frontend uses Web Speech API for free transcription"""
    raise HTTPException(
        status_code=501, 
        detail="Backend transcription not available. Please use Web Speech API in the browser (already implemented in frontend)."
    )

class TranscriptRequest(BaseModel):
    transcript: str

class UserRegister(BaseModel):
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

# Authentication endpoints
@app.post("/api/register")
async def register(user_data: UserRegister):
    """Register a new user"""
    # Validate username
    if not user_data.username or len(user_data.username.strip()) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    
    # Validate password
    if not user_data.password or len(user_data.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if username already exists
    cursor.execute("SELECT id FROM users WHERE username = ?", (user_data.username,))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Username already exists")
    
    # Create user
    password_hash = get_password_hash(user_data.password)
    cursor.execute("""
        INSERT INTO users (username, password_hash, created_at)
        VALUES (?, ?, ?)
    """, (user_data.username, password_hash, datetime.now().isoformat()))
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Create access token (sub must be a string per JWT spec)
    access_token = create_access_token(data={"sub": str(user_id)})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user_id, "username": user_data.username}
    }

@app.post("/api/login")
async def login(user_data: UserLogin):
    """Login and get access token"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get user
    cursor.execute("SELECT id, username, password_hash FROM users WHERE username = ?", (user_data.username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    user_id, username, password_hash = user
    
    # Verify password
    if not verify_password(user_data.password, password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # Create access token (sub must be a string per JWT spec)
    access_token = create_access_token(data={"sub": str(user_id)})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user_id, "username": username}
    }

@app.get("/api/me")
async def get_current_user_info(current_user: dict = Depends(get_current_user_dependency)):
    """Get current user information"""
    return current_user

@app.post("/api/extract-expense-simple")
async def extract_expense_simple_endpoint(request: TranscriptRequest, current_user: dict = Depends(get_current_user_dependency)):
    """Extract expense information using simple regex (no API needed)"""
    transcript = request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")
    
    try:
        expense_data = extract_expense_simple(transcript)
        
        # Save to database with user_id
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO expenses (user_id, store, items, category, amount, date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (current_user["id"], expense_data["store"], expense_data["items"], expense_data.get("category"), expense_data["amount"], 
              expense_data["date"], datetime.now().isoformat()))
        expense_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
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
async def extract_expense(request: TranscriptRequest, current_user: dict = Depends(get_current_user_dependency)):
    """Extract expense information from transcript using Groq (primary) or simple extraction (fallback)"""
    transcript = request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")
    
    print(f"Processing transcript: {transcript}")
    
    # Try Groq first (faster, free tier available)
    if groq_client:
        print("Using Groq for extraction")
        try:
            today_str = datetime.now().strftime("%Y-%m-%d")
            yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            tomorrow_str = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            
            prompt = f"""Extract expense information from the following voice transcript.
            CRITICAL: If the transcript mentions MULTIPLE items with DIFFERENT prices, return a JSON ARRAY of expense objects.
            If it's a single purchase or multiple items with one total price, return a JSON ARRAY with one object.

            Each expense object should have:
            - store: The name of the store/merchant where the purchase was made (e.g., "Walmart", "Apple", "Target")
            - items: The actual items/products purchased. CRITICAL RULES:
              1. Extract the PRODUCT, not the store name
              2. If transcript says "bought a laptop MacBook from Apple", items = "laptop" or "MacBook", store = "Apple"
              3. If transcript says "groceries at Walmart", items = "groceries", store = "Walmart"
              4. If transcript says "bought apple from Apple", items = "apple" (the fruit), store = "Apple" (the store)
              5. The item is what was purchased, the store is where it was bought
            - category: Categorize the expense. Available categories: "Electronics", "Groceries", "Clothing", "Transportation", "Dining", "Entertainment", "Health", "Home", "Utilities", "Other"
            - amount: Total amount spent as a number (e.g., 45.50 for $45.50). IMPORTANT: If someone says a number like "2350" after "for", interpret it as dollars and cents: "2350" = 23.50, "350" = 3.50, "1234" = 12.34. Only interpret large numbers (6+ digits) as whole dollar amounts.
            - date: Date of purchase in YYYY-MM-DD format. IMPORTANT: Handle relative dates correctly:
              - "yesterday" = {yesterday_str}
              - "tomorrow" = {tomorrow_str}
              - "today" = {today_str}
              - "last week" = date from 7 days ago
              - "X days ago" = date from X days ago
              - "in X days" = date X days from now
              - If no date mentioned, use today's date ({today_str})
            
            Transcript: "{transcript}"
            
            Return only valid JSON array, no additional text. Examples:
            - "bought a laptop MacBook from Apple for $800" → [{{"store": "Apple", "items": "MacBook", "category": "Electronics", "amount": 800, "date": "{today_str}"}}]
            - "groceries at Walmart for $45.50 yesterday" → [{{"store": "Walmart", "items": "groceries", "category": "Groceries", "amount": 45.50, "date": "{yesterday_str}"}}]
            - "I went to Target and got candy for $5 and an iPad for $700" → [{{"store": "Target", "items": "candy", "category": "Groceries", "amount": 5, "date": "{today_str}"}}, {{"store": "Target", "items": "iPad", "category": "Electronics", "amount": 700, "date": "{today_str}"}}]
            - "bought milk for $3 at Walmart and a laptop for $800 at Best Buy" → [{{"store": "Walmart", "items": "milk", "category": "Groceries", "amount": 3, "date": "{today_str}"}}, {{"store": "Best Buy", "items": "laptop", "category": "Electronics", "amount": 800, "date": "{today_str}"}}]
            - "bought candy for 2350" → [{{"store": "Unknown Store", "items": "candy", "category": "Groceries", "amount": 23.50, "date": "{today_str}"}}]"""
            
            response = groq_client.chat.completions.create(
                model="llama-3.1-70b-versatile",  # Fast and accurate Groq model
                messages=[
                    {"role": "system", "content": f"You are a helpful assistant that extracts expense information from voice transcripts. CRITICAL: Always return a JSON ARRAY of expense objects. If transcript mentions MULTIPLE items with DIFFERENT prices, create SEPARATE expense objects. Each object has keys: store, items, category, amount, date. RULES: 1) The 'items' field must contain the PRODUCT/ITEM purchased (like 'laptop', 'MacBook', 'milk', 'candy'), NEVER the store name. 2) The 'store' field contains where the purchase was made. 3) Each expense should have ONE category from: Electronics, Groceries, Clothing, Transportation, Dining, Entertainment, Health, Home, Utilities, Other. 4) If transcript says 'I got candy for $5 and an iPad for $700 at Target', create TWO separate expense objects: one for candy ($5, Groceries), one for iPad ($700, Electronics). 5) For amounts: If someone says '2350' after 'for', interpret as $23.50. '350' = $3.50, '1234' = $12.34. Only 6+ digit numbers are whole dollars. 6) For dates: 'yesterday' = {(datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')}, 'tomorrow' = {(datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')}, 'today' = {datetime.now().strftime('%Y-%m-%d')}. Today is {datetime.now().strftime('%Y-%m-%d')}."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2  # Lower temperature for more consistent extraction
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

            # Process and save each expense
            saved_expenses = []
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            for expense_data in expenses_data:
                # Validate and set defaults
                store = expense_data.get("store", "Unknown Store")
                items = expense_data.get("items", "")
                category = expense_data.get("category")
                amount = expense_data.get("amount")
                # If Groq didn't extract date or extracted a relative date term, parse it
                date_str = expense_data.get("date", "")
                if date_str and (date_str.lower() in ["yesterday", "tomorrow", "today"] or "ago" in date_str.lower() or "last week" in date_str.lower()):
                    date = parse_relative_date(transcript)
                elif date_str:
                    date = date_str  # Use the date Groq provided
                else:
                    date = parse_relative_date(transcript)  # Parse from transcript or default to today

                # Save to database with user_id
                cursor.execute("""
                    INSERT INTO expenses (user_id, store, items, category, amount, date, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (current_user["id"], store, items, category, amount, date, datetime.now().isoformat()))
                expense_id = cursor.lastrowid

                saved_expenses.append({
                    "id": expense_id,
                    "store": store,
                    "items": items,
                    "category": category,
                    "amount": amount,
                    "date": date
                })

            conn.commit()
            conn.close()

            print(f"Groq extraction successful: {len(saved_expenses)} expense(s) saved")
            return {
                "expenses": saved_expenses,
                "count": len(saved_expenses),
                "message": f"{len(saved_expenses)} expense(s) saved successfully (using Groq)"
            }
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
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    for expense_data in expenses_data:
        cursor.execute("""
            INSERT INTO expenses (user_id, store, items, category, amount, date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (current_user["id"], expense_data["store"], expense_data["items"], expense_data.get("category"), expense_data["amount"],
              expense_data["date"], datetime.now().isoformat()))
        expense_id = cursor.lastrowid

        saved_expenses.append({
            "id": expense_id,
            "store": expense_data["store"],
            "items": expense_data["items"],
            "category": expense_data.get("category"),
            "amount": expense_data["amount"],
            "date": expense_data["date"]
        })

    conn.commit()
    conn.close()

    return {
        "expenses": saved_expenses,
        "count": len(saved_expenses),
        "message": f"{len(saved_expenses)} expense(s) saved successfully (using simple extraction - Groq unavailable)"
    }

@app.get("/api/expenses")
async def get_expenses(current_user: dict = Depends(get_current_user_dependency)):
    """Get all expenses for the current user"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expenses WHERE user_id = ? ORDER BY created_at DESC", (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    
    expenses = [dict(row) for row in rows]
    return {"expenses": expenses}

@app.get("/api/db-viewer")
async def db_viewer():
    """View database contents in a simple HTML format"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get schema
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'")
    schema = cursor.fetchone()
    
    # Get all expenses
    cursor.execute("SELECT * FROM expenses ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    expenses = [dict(row) for row in rows]
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Voxalyze Database Viewer</title>
        <style>
            body {{
                font-family: 'Ubuntu', monospace;
                background: #0a0a0a;
                color: #e0e0e0;
                padding: 2rem;
                max-width: 1200px;
                margin: 0 auto;
            }}
            h1 {{ color: #00d4ff; }}
            h2 {{ color: #7b2ff7; margin-top: 2rem; }}
            table {{
                width: 100%;
                border-collapse: collapse;
                margin: 1rem 0;
                background: rgba(26, 26, 26, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }}
            th, td {{
                padding: 0.75rem;
                text-align: left;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            }}
            th {{
                background: rgba(0, 212, 255, 0.2);
                color: #00d4ff;
                font-weight: bold;
            }}
            tr:hover {{
                background: rgba(255, 255, 255, 0.05);
            }}
            .schema {{
                background: rgba(20, 20, 20, 0.6);
                padding: 1rem;
                border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                font-family: monospace;
                white-space: pre-wrap;
            }}
        </style>
    </head>
    <body>
        <h1>🎤 Voxalyze Database Viewer</h1>
        
        <h2>Schema</h2>
        <div class="schema">{schema[0] if schema else 'No schema found'}</div>
        
        <h2>Expenses ({len(expenses)} total)</h2>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Store</th>
                    <th>Items</th>
                    <th>Amount</th>
                    <th>Date</th>
                    <th>Created At</th>
                </tr>
            </thead>
            <tbody>
    """
    
    for exp in expenses:
        html += f"""
                <tr>
                    <td>{exp.get('id', '')}</td>
                    <td>{exp.get('store', '')}</td>
                    <td>{exp.get('items', '')}</td>
                    <td>${exp.get('amount', 0) or 0:.2f}</td>
                    <td>{exp.get('date', '')}</td>
                    <td>{exp.get('created_at', '')}</td>
                </tr>
        """
    
    html += """
            </tbody>
        </table>
    </body>
    </html>
    """
    
    from fastapi.responses import HTMLResponse
    return HTMLResponse(content=html)

@app.get("/api/analytics")
async def get_analytics(current_user: dict = Depends(get_current_user_dependency)):
    """Get analytics data for the current user"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expenses WHERE user_id = ?", (current_user["id"],))
    rows = cursor.fetchall()
    conn.close()
    
    expenses = [dict(row) for row in rows]
    
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

@app.delete("/api/expenses/{expense_id}")
async def delete_expense(expense_id: int, current_user: dict = Depends(get_current_user_dependency)):
    """Delete an expense (only if it belongs to the current user)"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expenses WHERE id = ? AND user_id = ?", (expense_id, current_user["id"]))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted successfully"}

@app.delete("/api/expenses")
async def delete_all_expenses(current_user: dict = Depends(get_current_user_dependency)):
    """Delete all expenses for the current user"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expenses WHERE user_id = ?", (current_user["id"],))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    
    return {"message": f"All expenses deleted successfully ({deleted} expenses removed)"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

