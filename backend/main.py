from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import sqlite3
import json
import os
import re
from groq import Groq
import io
import base64
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Voxalyze Expense Tracker API")


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
DB_PATH = "expenses.db"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Create expenses table (no user_id needed)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store TEXT NOT NULL,
            items TEXT NOT NULL,
            category TEXT,
            amount REAL,
            date TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
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

def extract_expense_simple(transcript: str) -> dict:
    """Simple regex-based expense extraction as fallback when Groq is unavailable"""
    transcript_lower = transcript.lower()
    
    # Extract amount (look for $XX.XX or XX dollars)
    amount = None
    amount_patterns = [
        r'\$(\d+\.?\d*)',  # $45.50
        r'(\d+\.?\d*)\s*dollars?',  # 45.50 dollars
        r'for\s+(\d+\.?\d*)',  # for 45.50
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
    
    # Use today's date
    date = datetime.now().strftime("%Y-%m-%d")
    
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

@app.post("/api/extract-expense-simple")
async def extract_expense_simple_endpoint(request: TranscriptRequest):
    """Extract expense information using simple regex (no API needed)"""
    transcript = request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")
    
    try:
        expense_data = extract_expense_simple(transcript)
        
        # Save to database
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO expenses (store, items, category, amount, date, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (expense_data["store"], expense_data["items"], expense_data.get("category"), expense_data["amount"], 
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
async def extract_expense(request: TranscriptRequest):
    """Extract expense information from transcript using Groq (primary) or simple extraction (fallback)"""
    transcript = request.transcript
    if not transcript or len(transcript.strip()) == 0:
        raise HTTPException(status_code=400, detail="Empty transcript received")
    
    print(f"Processing transcript: {transcript}")
    
    # Try Groq first (faster, free tier available)
    if groq_client:
        print("Using Groq for extraction")
        try:
            prompt = f"""Extract expense information from the following voice transcript. 
            Return a JSON object with:
            - store: The name of the store/merchant where the purchase was made (e.g., "Walmart", "Apple", "Target")
            - items: The actual items/products purchased. CRITICAL RULES:
              1. Extract the PRODUCT, not the store name
              2. If transcript says "bought a laptop MacBook from Apple", items = "laptop" or "MacBook", store = "Apple"
              3. If transcript says "groceries at Walmart", items = "groceries", store = "Walmart"
              4. If transcript says "bought apple from Apple", items = "apple" (the fruit), store = "Apple" (the store)
              5. The item is what was purchased, the store is where it was bought
            - category: Categorize the expense. Can be MULTIPLE categories separated by commas if items belong to different categories.
              Available categories: "Electronics", "Groceries", "Clothing", "Transportation", "Dining", "Entertainment", "Health", "Home", "Utilities", "Other"
              Examples: "Electronics, Groceries" (if buying both), "Groceries" (if only groceries), "Electronics" (if only electronics)
            - amount: Total amount spent as a number (e.g., 45.50 for $45.50)
            - date: Date of purchase in YYYY-MM-DD format (use today's date if not mentioned)
            
            Transcript: "{transcript}"
            
            Return only valid JSON, no additional text. Examples:
            - "bought a laptop MacBook from Apple for $800" → {{"store": "Apple", "items": "MacBook", "category": "Electronics", "amount": 800, "date": "2024-01-15"}}
            - "groceries at Walmart for $45.50" → {{"store": "Walmart", "items": "groceries", "category": "Groceries", "amount": 45.50, "date": "2024-01-15"}}
            - "bought fruits and an iPhone at Target for $900" → {{"store": "Target", "items": "fruits, iPhone", "category": "Groceries, Electronics", "amount": 900, "date": "2024-01-15"}}"""
            
            response = groq_client.chat.completions.create(
                model="llama-3.1-70b-versatile",  # Fast and accurate Groq model
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts expense information from voice transcripts. Always return valid JSON with keys: store, items, category, amount, date. CRITICAL RULES: 1) The 'items' field must contain the PRODUCT/ITEM purchased (like 'laptop', 'MacBook', 'milk', 'groceries'), NEVER the store name. 2) The 'store' field contains where the purchase was made. 3) The 'category' field can contain MULTIPLE categories separated by commas if the purchase includes items from different categories (e.g., 'Groceries, Electronics' for buying fruits and an iPhone). Available categories: Electronics, Groceries, Clothing, Transportation, Dining, Entertainment, Health, Home, Utilities, Other. If someone says 'bought fruits and iPhone at Target', items='fruits, iPhone', store='Target', category='Groceries, Electronics'. NEVER put the store name in the items field."},
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
            
            expense_data = json.loads(content)
            
            # Validate and set defaults
            store = expense_data.get("store", "Unknown Store")
            items = expense_data.get("items", "")
            category = expense_data.get("category")
            amount = expense_data.get("amount")
            date = expense_data.get("date", datetime.now().strftime("%Y-%m-%d"))
            
            # Save to database
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO expenses (store, items, category, amount, date, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (store, items, category, amount, date, datetime.now().isoformat()))
            expense_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            print(f"Groq extraction successful: {expense_data}")
            return {
                "id": expense_id,
                "store": store,
                "items": items,
                "category": category,
                "amount": amount,
                "date": date,
                "message": "Expense saved successfully (using Groq)"
            }
        except Exception as e:
            print(f"Groq error: {str(e)}")
            import traceback
            traceback.print_exc()
            # Fall through to simple extraction
    
    # Fallback to simple extraction if Groq fails or unavailable
    print("Using simple extraction (Groq unavailable or failed)")
    expense_data = extract_expense_simple(transcript)
    print(f"Simple extraction result: {expense_data}")
    
    # Save to database
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO expenses (store, items, category, amount, date, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (expense_data["store"], expense_data["items"], expense_data.get("category"), expense_data["amount"], 
          expense_data["date"], datetime.now().isoformat()))
    expense_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {
        "id": expense_id,
        "store": expense_data["store"],
        "items": expense_data["items"],
        "category": expense_data.get("category"),
        "amount": expense_data["amount"],
        "date": expense_data["date"],
        "message": "Expense saved successfully (using simple extraction - Groq unavailable)"
    }

@app.get("/api/expenses")
async def get_expenses():
    """Get all expenses"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expenses ORDER BY created_at DESC")
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
async def get_analytics():
    """Get analytics data"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM expenses")
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
async def delete_expense(expense_id: int):
    """Delete an expense"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    return {"message": "Expense deleted successfully"}

@app.delete("/api/expenses")
async def delete_all_expenses():
    """Delete all expenses"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM expenses")
    conn.commit()
    deleted = cursor.rowcount
    conn.close()
    
    return {"message": f"All expenses deleted successfully ({deleted} expenses removed)"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

