# ============================================================================
# IMPORTS
# ============================================================================
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
import httpx
import io
import base64
from dotenv import load_dotenv
from jose import JWTError, jwt
import bcrypt

# ============================================================================
# CONFIGURATION & SETUP
# ============================================================================
# Load environment variables
load_dotenv()

# Initialize FastAPI app
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

# Database Configuration
DB_PATH = "voxalyze.db"

# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check existing table structure
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    table_exists = cursor.fetchone()
    
    if table_exists:
        # Table exists, check columns
        cursor.execute("PRAGMA table_info(users)")
        columns = {row[1]: row for row in cursor.fetchall()}
        
        has_email = 'email' in columns
        has_google_id = 'google_id' in columns
        
        # If table needs migration (missing email or has google_id)
        if not has_email or has_google_id:
            # Create new table with correct schema
            cursor.execute("""
                CREATE TABLE users_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            
            # Migrate existing data
            if has_email:
                # Email column exists, just copy data
                cursor.execute("""
                    INSERT INTO users_new (id, username, email, password_hash, created_at)
                    SELECT id, username, email, password_hash, created_at
                    FROM users
                    WHERE password_hash IS NOT NULL
                """)
            else:
                # No email column, add placeholder emails
                cursor.execute("""
                    INSERT INTO users_new (id, username, email, password_hash, created_at)
                    SELECT id, username, username || '@example.com', password_hash, created_at
                    FROM users
                    WHERE password_hash IS NOT NULL
                """)
            
            # Replace old table with new one
            cursor.execute("DROP TABLE users")
            cursor.execute("ALTER TABLE users_new RENAME TO users")
            conn.commit()
    else:
        # Table doesn't exist, create it with email column
        cursor.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
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
    
    # Create budgets table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            recurring INTEGER DEFAULT 0,
            repeat_interval INTEGER DEFAULT NULL,
            repeat_unit TEXT DEFAULT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, category, month, year)
        )
    """)
    
    # Add recurring column if it doesn't exist (migration for existing databases)
    try:
        cursor.execute("ALTER TABLE budgets ADD COLUMN recurring INTEGER DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError:
        # Column already exists, ignore
        pass
    
    # Add repeat_interval and repeat_unit columns if they don't exist
    try:
        cursor.execute("ALTER TABLE budgets ADD COLUMN repeat_interval INTEGER DEFAULT NULL")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    
    try:
        cursor.execute("ALTER TABLE budgets ADD COLUMN repeat_unit TEXT DEFAULT NULL")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    
    conn.commit()
    conn.close()

init_db()

# ============================================================================
# AUTHENTICATION HELPER FUNCTIONS
# ============================================================================

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
    cursor.execute("SELECT id, username, email FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if user is None:
        raise credentials_exception
    
    return {"id": user[0], "username": user[1], "email": user[2] if len(user) > 2 else None}

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

def extract_expense_simple(transcript: str):
    """Simple regex-based expense extraction as fallback when Groq is unavailable
    Returns a list of expense dicts if multiple items detected, otherwise a single dict"""
    transcript_lower = transcript.lower()

    # First, try to detect multiple items with individual prices
    # Pattern: "item1 for $X and item2 for $Y" or "bought item1 for $X and item2 for $Y"
    # More flexible pattern to catch variations like "I bought eggs from Walmart for $7 and I bought an iPad from Walmart for $700"
    multi_item_pattern = r'(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)\s+and\s+(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)'
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

        # Clean up items (pass store name to remove it from item names)
        item1 = clean_item_name(item1, store)
        item2 = clean_item_name(item2, store)

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
        "date": date
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
async def transcribe_audio(audio: UploadFile = File(...)):
    """Transcribe audio file to text using Deepgram API"""
    if not deepgram_available:
        raise HTTPException(
            status_code=503,
            detail="Deepgram API key not configured. Please set DEEPGRAM_API_KEY in .env file. Get a free API key at: https://console.deepgram.com/"
        )
    
    try:
        # Read audio file content
        audio_content = await audio.read()
        
        # Use Deepgram REST API directly
        url = "https://api.deepgram.com/v1/listen"
        headers = {
            "Authorization": f"Token {deepgram_api_key}",
        }
        params = {
            "model": "flux-general-en",
            "smart_format": "true",
            "punctuate": "true",
        }
        
        # Send audio to Deepgram API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers=headers,
                params=params,
                files={"audio": (audio.filename or "audio.webm", audio_content, audio.content_type or "audio/webm")}
            )
            response.raise_for_status()
            result = response.json()
        
        # Extract transcript from response
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

class UserRegister(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class ExpenseUpdate(BaseModel):
    store: Optional[str] = None
    items: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None

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
# Authentication Endpoints
# ----------------------------------------------------------------------------

@app.post("/api/register")
async def register(user_data: UserRegister):
    """Register a new user"""
    import re
    
    # Validate username
    if not user_data.username or len(user_data.username.strip()) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    
    # Validate email
    if not user_data.email or not user_data.email.strip():
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Basic email validation
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, user_data.email):
        raise HTTPException(status_code=400, detail="Invalid email format")
    
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
    
    # Check if email already exists
    cursor.execute("SELECT id FROM users WHERE email = ?", (user_data.email.lower().strip(),))
    if cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    password_hash = get_password_hash(user_data.password)
    cursor.execute("""
        INSERT INTO users (username, email, password_hash, created_at)
        VALUES (?, ?, ?, ?)
    """, (user_data.username, user_data.email.lower().strip(), password_hash, datetime.now().isoformat()))
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Create access token (sub must be a string per JWT spec)
    access_token = create_access_token(data={"sub": str(user_id)})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user_id, "username": user_data.username, "email": user_data.email}
    }

@app.post("/api/login")
async def login(user_data: UserLogin):
    """Login and get access token"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get user (including email)
    cursor.execute("SELECT id, username, email, password_hash FROM users WHERE username = ?", (user_data.username,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    user_id, username, email, password_hash = user
    
    # Verify password
    if not verify_password(user_data.password, password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # Create access token (sub must be a string per JWT spec)
    access_token = create_access_token(data={"sub": str(user_id)})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": user_id, "username": username, "email": email}
    }

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
            - items: The actual items/products purchased. CRITICAL RULES FOR ARTICLE REMOVAL:
              1. Extract ONLY the PRODUCT name, not the store name
              2. ALWAYS remove ALL articles (a, an, the) from the beginning of product names - DO NOT convert 'an' to 'n' or 'N'
              3. Examples of correct article removal:
                 - "an iPad" → items = "iPad" (NOT "an iPad", NOT "N iPad", NOT "n iPad")
                 - "an egg" → items = "egg" (NOT "N egg")
                 - "an apple" → items = "apple" (NOT "N apple")
                 - "an umbrella" → items = "umbrella" (NOT "N umbrella")
                 - "a laptop" → items = "laptop" (NOT "a laptop")
                 - "the milk" → items = "milk" (NOT "the milk")
              4. Remove action words (I, bought, got, purchased) from the item name
              5. The item is what was purchased, the store is where it was bought
              6. For Apple products, use proper capitalization: "iPad", "iPhone", "MacBook", "iMac", "iPod"
            - category: Categorize the expense. Available categories: "Electronics", "Groceries", "Clothing", "Transportation", "Dining", "Entertainment", "Health", "Home", "Utilities", "Other"
             - amount: Total amount spent as a number (e.g., 45.50 for $45.50). IMPORTANT: Only apply dollars.cents interpretation to 4-5 digit numbers like "2350" = 23.50, "1234" = 12.34. Numbers like "700", "800", "900" are whole dollars (700, 800, 900), NOT 7.00, 8.00, 9.00. Only 6+ digit numbers are definitely whole dollar amounts.
            - date: Date of purchase in YYYY-MM-DD format. IMPORTANT: Handle relative dates correctly:
              - "yesterday" = {yesterday_str}
              - "tomorrow" = {tomorrow_str}
              - "today" = {today_str}
              - "last week" = date from 7 days ago
              - "X days ago" = date from X days ago
              - "in X days" = date X days from now
              - If no date mentioned, use today's date ({today_str})
            
            Transcript: "{transcript}"
            
            Return only valid JSON array, no additional text. Examples (note article removal):
            - "bought a laptop MacBook from Apple for $800" → [{{"store": "Apple", "items": "MacBook", "category": "Electronics", "amount": 800, "date": "{today_str}"}}]
            - "I bought an iPad from Target for $700" → [{{"store": "Target", "items": "iPad", "category": "Electronics", "amount": 700, "date": "{today_str}"}}]
            - "I bought an egg from Walmart for $2" → [{{"store": "Walmart", "items": "egg", "category": "Groceries", "amount": 2, "date": "{today_str}"}}]
            - "I got an apple from the grocery store for $1" → [{{"store": "grocery store", "items": "apple", "category": "Groceries", "amount": 1, "date": "{today_str}"}}]
            - "I purchased an umbrella at Target for $15" → [{{"store": "Target", "items": "umbrella", "category": "Other", "amount": 15, "date": "{today_str}"}}]
            - "bought the milk at Walmart for $4" → [{{"store": "Walmart", "items": "milk", "category": "Groceries", "amount": 4, "date": "{today_str}"}}]
            - "I went to Target and got candy for $5 and an iPad for $700" → [{{"store": "Target", "items": "candy", "category": "Groceries", "amount": 5, "date": "{today_str}"}}, {{"store": "Target", "items": "iPad", "category": "Electronics", "amount": 700, "date": "{today_str}"}}]
            - "bought an orange and an apple at Walmart for $3" → [{{"store": "Walmart", "items": "orange and apple", "category": "Groceries", "amount": 3, "date": "{today_str}"}}]"""
            
            response = groq_client.chat.completions.create(
                model="llama-3.1-70b-versatile",  # Fast and accurate Groq model
                messages=[
                     {"role": "system", "content": f"You are a helpful assistant that extracts expense information from voice transcripts. CRITICAL: Always return a JSON ARRAY of expense objects. If transcript mentions MULTIPLE items with DIFFERENT prices, create SEPARATE expense objects. Each object has keys: store, items, category, amount, date.\n\nRULES:\n1) CRITICAL ARTICLE REMOVAL: The 'items' field must contain ONLY the PRODUCT/ITEM name. You MUST completely remove ALL articles (a, an, the) from the beginning of product names. NEVER include articles or convert them to letters.\n   - 'an iPad' → extract as 'iPad' (NOT 'an iPad', NOT 'N iPad', NOT 'n iPad')\n   - 'an egg' → extract as 'egg' (NOT 'an egg', NOT 'N egg')\n   - 'an apple' → extract as 'apple' (NOT 'an apple', NOT 'N apple')\n   - 'an umbrella' → extract as 'umbrella' (NOT 'N umbrella')\n   - 'a laptop' → extract as 'laptop' (NOT 'a laptop')\n   - 'the milk' → extract as 'milk' (NOT 'the milk')\n   - The article 'an' should be COMPLETELY REMOVED and NEVER converted to the letter 'n' or 'N'.\n\n2) NEVER include action words (I, bought, got, purchased) or store names in the items field.\n\n3) For Apple products, use EXACT capitalization: 'iPad', 'iPhone', 'MacBook', 'iMac', 'iPod'. NEVER write 'Ipad', 'Iphone', etc.\n\n4) The 'store' field contains where the purchase was made.\n\n5) Each expense should have ONE category from: Electronics, Groceries, Clothing, Transportation, Dining, Entertainment, Health, Home, Utilities, Other.\n\n6) If transcript mentions MULTIPLE items with DIFFERENT prices, create SEPARATE expense objects.\n   Example: 'I bought eggs from Walmart for $7 and I bought an iPad from Walmart for $700'\n   → Two objects: items='eggs', amount=7 AND items='iPad', amount=700\n\n7) For amounts: Only apply dollars.cents interpretation to 4-5 digit numbers like '2350' = 23.50, '1234' = 12.34. Numbers like '700', '800', '900' are whole dollars (700, 800, 900), NOT 7.00, 8.00, 9.00.\n\n8) For dates: 'yesterday' = {(datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')}, 'tomorrow' = {(datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')}, 'today' = {datetime.now().strftime('%Y-%m-%d')}. Today is {datetime.now().strftime('%Y-%m-%d')}."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1  # Even lower temperature for more consistent extraction
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
                
                # Clean up items: remove articles and fix capitalization
                # This is a safety net in case the LLM doesn't properly remove articles
                if items:
                    items_original = items
                    print(f"DEBUG: Starting cleanup for items: '{items}'")

                    # STEP 1: Remove ALL leading articles (a, an, the, N, n)
                    # Use case-insensitive matching and be very aggressive
                    # This catches: "N iPad", "n ipad", "An iPad", "an ipad", "A laptop", "the milk", etc.
                    items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE).strip()
                    print(f"DEBUG: After first article removal: '{items}'")

                    # STEP 2: Do multiple passes to ensure complete removal
                    for _ in range(3):
                        items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE).strip()
                    print(f"DEBUG: After multiple passes: '{items}'")

                    # STEP 3: Apply proper capitalization for Apple products
                    items_lower = items.lower()

                    # Define product capitalization fixes
                    product_fixes = {
                        'ipad': 'iPad',
                        'iphone': 'iPhone',
                        'macbook': 'MacBook',
                        'imac': 'iMac',
                        'ipod': 'iPod',
                    }

                    # Check for exact matches or products with modifiers (e.g., "iPad Pro")
                    for product_key, product_value in product_fixes.items():
                        # Exact match (e.g., "ipad" -> "iPad")
                        if items_lower == product_key:
                            items = product_value
                            break
                        # Match with additional words (e.g., "ipad pro" -> "iPad Pro")
                        elif items_lower.startswith(product_key + ' '):
                            remaining = items[len(product_key):].strip()
                            items = product_value + (' ' + remaining.title() if remaining else '')
                            break
                        # Match anywhere in the string (e.g., "new ipad" -> "new iPad")
                        elif product_key in items_lower:
                            items = re.sub(r'\b' + product_key + r'\b', product_value, items, flags=re.IGNORECASE)
                            break

                    print(f"DEBUG: Items cleaned: '{items_original}' -> '{items}'")
                
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

# ----------------------------------------------------------------------------
# Expense Management Endpoints
# ----------------------------------------------------------------------------

@app.post("/api/expenses")
async def create_expense(
    expense: dict,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new expense"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Validate required fields
        if not expense.get("store") or not expense.get("date"):
            raise HTTPException(status_code=400, detail="Store and date are required")
        
        cursor.execute("""
            INSERT INTO expenses (user_id, store, items, category, amount, date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            current_user["id"],
            expense.get("store"),
            expense.get("items", "Various items"),
            expense.get("category"),
            expense.get("amount"),
            expense.get("date"),
            datetime.now().isoformat()
        ))
        
        expense_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        return {
            "id": expense_id,
            "store": expense.get("store"),
            "items": expense.get("items", "Various items"),
            "category": expense.get("category"),
            "amount": expense.get("amount"),
            "date": expense.get("date"),
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
    sort_order: Optional[str] = "desc"
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
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Build query with filters
    query = "SELECT * FROM expenses WHERE user_id = ?"
    params = [current_user["id"]]
    
    # Search filter (searches in store, items, and category)
    if search:
        query += " AND (store LIKE ? OR items LIKE ? OR category LIKE ?)"
        search_pattern = f"%{search}%"
        params.extend([search_pattern, search_pattern, search_pattern])
    
    # Category filter
    if category:
        query += " AND category LIKE ?"
        params.append(f"%{category}%")
    
    # Store filter
    if store:
        query += " AND store LIKE ?"
        params.append(f"%{store}%")
    
    # Amount filters
    if min_amount is not None:
        query += " AND amount >= ?"
        params.append(min_amount)
    
    if max_amount is not None:
        query += " AND amount <= ?"
        params.append(max_amount)
    
    # Date filters
    if start_date:
        query += " AND date >= ?"
        params.append(start_date)
    
    if end_date:
        query += " AND date <= ?"
        params.append(end_date)
    
    # Sorting
    valid_sort_fields = {"date", "amount", "store", "created_at"}
    sort_field = sort_by if sort_by in valid_sort_fields else "date"
    sort_direction = "DESC" if sort_order.lower() == "desc" else "ASC"
    query += f" ORDER BY {sort_field} {sort_direction}"
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    expenses = [dict(row) for row in rows]
    return {"expenses": expenses, "count": len(expenses)}

# ----------------------------------------------------------------------------
# Database Viewer (Development Tool)
# ----------------------------------------------------------------------------

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

# ----------------------------------------------------------------------------
# Analytics Endpoint
# ----------------------------------------------------------------------------

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
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if expense exists and belongs to user
    cursor.execute("SELECT id FROM expenses WHERE id = ? AND user_id = ?", (expense_id, current_user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Build update query dynamically
    updates = []
    params = []
    
    if expense_update.store is not None:
        updates.append("store = ?")
        params.append(expense_update.store)
    
    if expense_update.items is not None:
        updates.append("items = ?")
        params.append(expense_update.items)
    
    if expense_update.category is not None:
        updates.append("category = ?")
        params.append(expense_update.category)
    
    if expense_update.amount is not None:
        updates.append("amount = ?")
        params.append(expense_update.amount)
    
    if expense_update.date is not None:
        updates.append("date = ?")
        params.append(expense_update.date)
    
    if not updates:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields to update")
    
    params.append(expense_id)
    params.append(current_user["id"])
    
    query = f"UPDATE expenses SET {', '.join(updates)} WHERE id = ? AND user_id = ?"
    cursor.execute(query, params)
    conn.commit()
    conn.close()
    
    return {"message": "Expense updated successfully"}

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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if month and year:
        cursor.execute(
            "SELECT * FROM budgets WHERE user_id = ? AND month = ? AND year = ? ORDER BY category",
            (current_user["id"], month, year)
        )
    elif year:
        cursor.execute(
            "SELECT * FROM budgets WHERE user_id = ? AND year = ? ORDER BY month, category",
            (current_user["id"], year)
        )
    else:
        now = datetime.now()
        cursor.execute(
            "SELECT * FROM budgets WHERE user_id = ? AND month = ? AND year = ? ORDER BY category",
            (current_user["id"], now.month, now.year)
        )
    
    rows = cursor.fetchall()
    conn.close()
    
    budgets = [dict(row) for row in rows]
    return {"budgets": budgets, "count": len(budgets)}

@app.post("/api/budgets")
async def create_budget(
    budget: BudgetCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new budget"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Ensure recurring columns exist
        try:
            cursor.execute("ALTER TABLE budgets ADD COLUMN recurring INTEGER DEFAULT 0")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE budgets ADD COLUMN repeat_interval INTEGER DEFAULT NULL")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE budgets ADD COLUMN repeat_unit TEXT DEFAULT NULL")
            conn.commit()
        except sqlite3.OperationalError:
            pass
        
        # Determine if recurring
        is_recurring = budget.recurring and budget.repeat_interval and budget.repeat_unit
        recurring_int = 1 if is_recurring else 0
        
        # Check if budget already exists
        cursor.execute(
            "SELECT id FROM budgets WHERE user_id = ? AND category = ? AND month = ? AND year = ?",
            (current_user["id"], budget.category, budget.month, budget.year)
        )
        if cursor.fetchone():
            conn.close()
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
            cursor.execute(
                "SELECT id FROM budgets WHERE user_id = ? AND category = ? AND month = ? AND year = ?",
                (current_user["id"], budget.category, next_month, next_year)
            )
            if cursor.fetchone():
                continue
            
            cursor.execute("""
                INSERT INTO budgets (user_id, category, amount, month, year, recurring, repeat_interval, repeat_unit, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                current_user["id"], 
                budget.category, 
                budget.amount, 
                next_month, 
                next_year, 
                recurring_int,
                budget.repeat_interval,
                budget.repeat_unit,
                now, 
                now
            ))
            created_budgets.append(cursor.lastrowid)
        
        conn.commit()
        conn.close()
        
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
    except sqlite3.OperationalError as e:
        if "no such table" in str(e).lower():
            raise HTTPException(
                status_code=500,
                detail="Database table not found. Please run 'python init_database.py' to initialize the database."
            )
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Ensure recurring columns exist (migration)
    try:
        cursor.execute("ALTER TABLE budgets ADD COLUMN recurring INTEGER DEFAULT 0")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE budgets ADD COLUMN repeat_interval INTEGER DEFAULT NULL")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    try:
        cursor.execute("ALTER TABLE budgets ADD COLUMN repeat_unit TEXT DEFAULT NULL")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    
    # Check if budget exists
    cursor.execute("SELECT * FROM budgets WHERE id = ? AND user_id = ?", (budget_id, current_user["id"]))
    existing = cursor.fetchone()
    if not existing:
        conn.close()
        raise HTTPException(status_code=404, detail="Budget not found")
    
    existing_dict = dict(existing)
    
    # Build update query
    update_fields = []
    update_values = []
    
    if budget_update.category is not None:
        update_fields.append("category = ?")
        update_values.append(budget_update.category)
    
    if budget_update.amount is not None:
        update_fields.append("amount = ?")
        update_values.append(budget_update.amount)
    
    if budget_update.month is not None:
        update_fields.append("month = ?")
        update_values.append(budget_update.month)
    
    if budget_update.year is not None:
        update_fields.append("year = ?")
        update_values.append(budget_update.year)
    
    # Handle recurring fields - if repeat_interval and repeat_unit are provided, auto-set recurring
    if budget_update.repeat_interval is not None:
        update_fields.append("repeat_interval = ?")
        update_values.append(budget_update.repeat_interval)
    
    if budget_update.repeat_unit is not None:
        update_fields.append("repeat_unit = ?")
        update_values.append(budget_update.repeat_unit)
    
    # Set recurring flag based on whether repeat_interval and repeat_unit are provided
    # If both are provided and not None/empty, set recurring to true
    # If either is None/empty, set recurring to false
    if budget_update.recurring is not None:
        # User explicitly set recurring flag
        update_fields.append("recurring = ?")
        update_values.append(1 if budget_update.recurring else 0)
    elif budget_update.repeat_interval is not None or budget_update.repeat_unit is not None:
        # User changed repeat fields, auto-determine recurring status
        # Get final values (use updated values if provided, otherwise existing values)
        final_repeat_interval = budget_update.repeat_interval if budget_update.repeat_interval is not None else existing_dict.get("repeat_interval")
        final_repeat_unit = budget_update.repeat_unit if budget_update.repeat_unit is not None else existing_dict.get("repeat_unit")
        
        # Recurring is true only if both interval and unit are set and valid
        is_recurring = (final_repeat_interval is not None and final_repeat_interval != 0) and (final_repeat_unit is not None and final_repeat_unit != "")
        update_fields.append("recurring = ?")
        update_values.append(1 if is_recurring else 0)
    
    if not update_fields:
        conn.close()
        raise HTTPException(status_code=400, detail="No fields provided to update")
    
    # Check for conflicts if changing category/month/year
    new_category = budget_update.category if budget_update.category is not None else existing_dict["category"]
    new_month = budget_update.month if budget_update.month is not None else existing_dict["month"]
    new_year = budget_update.year if budget_update.year is not None else existing_dict["year"]
    
    if (budget_update.category is not None or budget_update.month is not None or budget_update.year is not None):
        cursor.execute(
            "SELECT id FROM budgets WHERE user_id = ? AND category = ? AND month = ? AND year = ? AND id != ?",
            (current_user["id"], new_category, new_month, new_year, budget_id)
        )
        if cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=400, detail="Budget already exists for this category, month, and year")
    
    update_fields.append("updated_at = ?")
    update_values.append(datetime.now().isoformat())
    update_values.extend([budget_id, current_user["id"]])
    
    query = f"UPDATE budgets SET {', '.join(update_fields)} WHERE id = ? AND user_id = ?"
    cursor.execute(query, update_values)
    conn.commit()
    conn.close()
    
    return {"message": "Budget updated successfully"}

@app.delete("/api/budgets/{budget_id}")
async def delete_budget(
    budget_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a budget"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM budgets WHERE id = ? AND user_id = ?", (budget_id, current_user["id"]))
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    return {"message": "Budget deleted successfully"}

@app.get("/api/budgets/check")
async def check_budgets(
    current_user: dict = Depends(get_current_user_dependency),
    month: Optional[int] = None,
    year: Optional[int] = None
):
    """Get budgets with actual spending"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get budgets
    if month and year:
        cursor.execute(
            "SELECT * FROM budgets WHERE user_id = ? AND month = ? AND year = ? ORDER BY category",
            (current_user["id"], month, year)
        )
    elif year:
        cursor.execute(
            "SELECT * FROM budgets WHERE user_id = ? AND year = ? ORDER BY month, category",
            (current_user["id"], year)
        )
    else:
        cursor.execute(
            "SELECT * FROM budgets WHERE user_id = ? ORDER BY year DESC, month DESC, category",
            (current_user["id"],)
        )
    
    budgets = [dict(row) for row in cursor.fetchall()]
    
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
        
        # Debug: Print what we're looking for
        print(f"DEBUG: Looking for expenses - Category: '{budget_category}', Period: {start_date} to {end_date}")
        
        # First try exact match (case-insensitive)
        cursor.execute("""
            SELECT SUM(amount) as total, COUNT(*) as count
            FROM expenses
            WHERE user_id = ? AND LOWER(TRIM(category)) = LOWER(?) AND date >= ? AND date <= ?
        """, (current_user["id"], budget_category, start_date, end_date))
        
        result = cursor.fetchone()
        actual_spending = result["total"] if result["total"] else 0
        expense_count = result["count"] if result else 0
        print(f"DEBUG: Exact match found {expense_count} expenses, total: {actual_spending}")
        
        # If no exact match, try matching if budget category appears in expense category
        # (handles comma-separated categories like "Home, Utilities")
        if actual_spending == 0:
            # Also check all expenses in this period to see what categories exist
            cursor.execute("""
                SELECT category, SUM(amount) as total, COUNT(*) as count
                FROM expenses
                WHERE user_id = ? AND date >= ? AND date <= ?
                GROUP BY category
            """, (current_user["id"], start_date, end_date))
            
            all_expenses = cursor.fetchall()
            print(f"DEBUG: All expenses in period:")
            for exp in all_expenses:
                print(f"  - Category: '{exp['category']}', Total: {exp['total']}, Count: {exp['count']}")
            
            # Try pattern matching
            cursor.execute("""
                SELECT SUM(amount) as total, COUNT(*) as count
                FROM expenses
                WHERE user_id = ? 
                AND date >= ? AND date <= ?
                AND (
                    LOWER(category) LIKE LOWER(?) OR
                    LOWER(category) LIKE LOWER(?) OR
                    LOWER(category) LIKE LOWER(?)
                )
            """, (
                current_user["id"], 
                start_date, 
                end_date,
                f"{budget_category},%",  # Budget category at start
                f"%, {budget_category},%",  # Budget category in middle
                f"%, {budget_category}"  # Budget category at end
            ))
            
            result = cursor.fetchone()
            if result and result["total"]:
                actual_spending = result["total"]
                print(f"DEBUG: Pattern match found {result['count']} expenses, total: {actual_spending}")
        
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
    
    conn.close()
    return {"budgets": budget_status}

# ============================================================================
# APPLICATION ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

