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

app = FastAPI(title="VoiceP Expense Tracker API")

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
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store TEXT NOT NULL,
            items TEXT NOT NULL,
            amount REAL,
            date TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
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
    
    # Extract items (look for list after dash or comma, or common item words)
    items = ""
    # Try to find items after a dash or in a list
    items_match = re.search(r'[-–—]\s*(.+?)(?:\s+for|\s+at|\s+from|$)', transcript, re.IGNORECASE)
    if items_match:
        items = items_match.group(1).strip()
    else:
        # Try to extract common item words
        item_words = ['milk', 'bread', 'eggs', 'groceries', 'food', 'coffee', 'gas', 'gasoline', 'bananas', 'banana', 'apple', 'apples']
        found_items = [word for word in item_words if word in transcript_lower]
        if found_items:
            items = ', '.join(found_items)
        else:
            # Try to find any noun-like words before the store name
            # Look for words before "at" or "from"
            before_store = re.search(r'(.+?)\s+(?:at|from)\s+', transcript, re.IGNORECASE)
            if before_store:
                # Remove common verbs and articles
                text = before_store.group(1).lower()
                text = re.sub(r'\b(bought|got|purchased|brought|i|a|an|the|some)\b', '', text)
                items = text.strip()
                if items:
                    items = items.title()  # Capitalize first letter of each word
    
    # Use today's date
    date = datetime.now().strftime("%Y-%m-%d")
    
    return {
        "store": store,
        "items": items if items else "Various items",
        "amount": amount,
        "date": date
    }

class ExpenseResponse(BaseModel):
    id: int
    store: str
    items: str
    amount: Optional[float]
    date: str
    created_at: str

class AnalyticsResponse(BaseModel):
    total_expenses: float
    expense_count: int
    expenses_by_store: dict
    expenses_by_date: List[dict]
    recent_expenses: List[ExpenseResponse]

@app.get("/")
async def root():
    return {"message": "VoiceP Expense Tracker API"}

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
            INSERT INTO expenses (store, items, amount, date, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (expense_data["store"], expense_data["items"], expense_data["amount"], 
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
            Return a JSON object with: store (store name), items (list of items purchased as a comma-separated string), 
            amount (total amount spent as a number), and date (date of purchase in YYYY-MM-DD format, use today's date if not mentioned).
            
            Transcript: "{transcript}"
            
            Return only valid JSON, no additional text."""
            
            response = groq_client.chat.completions.create(
                model="llama-3.1-70b-versatile",  # Fast and accurate Groq model
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts expense information from voice transcripts. Always return valid JSON with keys: store, items, amount, date."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
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
            amount = expense_data.get("amount")
            date = expense_data.get("date", datetime.now().strftime("%Y-%m-%d"))
            
            # Save to database
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO expenses (store, items, amount, date, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (store, items, amount, date, datetime.now().isoformat()))
            expense_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            print(f"Groq extraction successful: {expense_data}")
            return {
                "id": expense_id,
                "store": store,
                "items": items,
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
        INSERT INTO expenses (store, items, amount, date, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (expense_data["store"], expense_data["items"], expense_data["amount"], 
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
        <title>VoiceP Database Viewer</title>
        <style>
            body {{
                font-family: monospace;
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
        <h1>🎤 VoiceP Database Viewer</h1>
        
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

