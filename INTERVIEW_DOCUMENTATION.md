# Voxalyze - Voice Powered Expense Tracker
## Comprehensive Technical Documentation

---

## Executive Summary

Voxalyze is a full-stack web application that allows users to record expenses using natural voice input. The application leverages AI to automatically extract structured data (store, items, amount, date, and categories) from voice transcripts and provides comprehensive analytics through an interactive dashboard. The system features multi-user authentication, budget tracking with alerts, and a modern responsive UI.

---

## Table of Contents

1. System Architecture
2. Technology Stack
3. Database Design
4. Authentication System
5. Voice Processing Pipeline
6. AI Extraction Logic
7. Frontend Architecture
8. Backend API Design
9. Analytics System
10. Budget Management
11. Error Handling & Fallbacks
12. Security Considerations
13. Key Features & Functionality
14. API Endpoints Reference
15. Deployment Considerations

---

## 1. System Architecture

### High-Level Architecture

Voxalyze follows a client-server architecture with clear separation between frontend and backend:

**Frontend Layer:**
- React 18 single-page application
- Vite development server and build tool
- Component-based UI architecture
- State management using React hooks
- Recharts for data visualization

**Backend Layer:**
- FastAPI REST API server
- SQLite database for data persistence
- Groq LLM API integration for intelligent extraction
- Deepgram API integration for speech-to-text
- JWT-based authentication

**External Services:**
- Groq API (llama-3.1-70b-versatile model)
- Deepgram API (flux-general-en model)

### Request Flow

1. User interacts with React frontend
2. Frontend makes HTTP requests to FastAPI backend
3. Backend processes requests (auth validation, database queries, AI calls)
4. Backend returns JSON responses
5. Frontend updates UI based on responses

---

## 2. Technology Stack

### Backend Technologies

**FastAPI (v0.104.1)**
- Modern Python web framework
- Automatic API documentation (Swagger/OpenAPI)
- Built-in request/response validation via Pydantic
- Asynchronous support for high performance
- CORS middleware for cross-origin requests

**SQLite**
- Lightweight, serverless database
- File-based storage (voxalyze.db)
- ACID compliance for data integrity
- Zero configuration required
- Suitable for single-user and small-scale deployments

**Groq API**
- Fast AI inference engine
- Uses llama-3.1-70b-versatile model
- Sub-second response times
- Free tier with generous rate limits
- Temperature set to 0.1 for consistent extraction

**Deepgram API**
- Speech-to-text transcription service
- Uses flux-general-en model
- Smart formatting and punctuation
- High accuracy transcription
- REST API integration

**JWT (JSON Web Tokens)**
- Token-based authentication
- python-jose library for encoding/decoding
- HS256 algorithm
- 7-day token expiration
- Tokens stored in localStorage on client

**bcrypt**
- Password hashing algorithm
- Salt generation for additional security
- One-way encryption
- Industry-standard security

**Python Libraries:**
- uvicorn: ASGI server
- pydantic: Data validation
- httpx: Async HTTP client
- python-dotenv: Environment variable management

### Frontend Technologies

**React 18**
- Component-based architecture
- Virtual DOM for efficient rendering
- Hooks for state management (useState, useEffect, useCallback)
- Functional components throughout

**Vite**
- Next-generation frontend build tool
- Fast Hot Module Replacement (HMR)
- Optimized production builds
- ES modules-based development server
- Proxy configuration for API requests

**Recharts**
- React-based charting library
- Line charts for time-series data
- Bar charts for comparative data
- Pie charts for distribution visualization
- Responsive and customizable
- Dark theme support

**Lucide React**
- Icon library with consistent design
- Lightweight and tree-shakeable
- SVG-based icons
- Extensive icon collection

**CSS3**
- Glassmorphism effects (backdrop-filter, blur)
- CSS Grid and Flexbox layouts
- CSS animations and transitions
- Custom properties for theming
- Dark theme with gradient accents
- Responsive design with media queries

---

## 3. Database Design

### Schema Overview

The database consists of three main tables with relational integrity enforced through foreign keys.

### Users Table

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
)
```

**Purpose:** Stores user account information

**Fields:**
- id: Primary key, auto-incremented
- username: Unique identifier for login
- email: User email address, unique
- password_hash: bcrypt-hashed password
- created_at: Account creation timestamp (ISO format)

**Constraints:**
- UNIQUE on username and email
- NOT NULL on all fields

### Expenses Table

```sql
CREATE TABLE expenses (
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
```

**Purpose:** Stores individual expense records

**Fields:**
- id: Primary key
- user_id: Foreign key to users table
- store: Name of merchant/store
- items: Description of purchased items
- category: Expense category (can be comma-separated for multiple)
- amount: Expense amount in dollars
- date: Purchase date (YYYY-MM-DD format)
- created_at: Record creation timestamp

**Constraints:**
- FOREIGN KEY to users(id)
- NOT NULL on user_id, store, items, date, created_at

### Budgets Table

```sql
CREATE TABLE budgets (
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
```

**Purpose:** Stores budget limits per category/period

**Fields:**
- id: Primary key
- user_id: Foreign key to users table
- category: Budget category name
- amount: Budget limit amount
- month: Budget month (1-12)
- year: Budget year
- recurring: Boolean flag (0 or 1) for recurring budgets
- repeat_interval: Number of periods between repetitions
- repeat_unit: Unit of repetition (weeks, months, years)
- created_at: Creation timestamp
- updated_at: Last modification timestamp

**Constraints:**
- FOREIGN KEY to users(id)
- UNIQUE constraint on (user_id, category, month, year)

### Database Migrations

The application handles schema evolution through ALTER TABLE statements with error handling:

```python
try:
    cursor.execute("ALTER TABLE expenses ADD COLUMN category TEXT")
    conn.commit()
except sqlite3.OperationalError:
    # Column already exists, ignore
    pass
```

This approach allows the application to evolve the schema without breaking existing databases.

---

## 4. Authentication System

### JWT-Based Authentication Flow

**Registration Process:**

1. User submits username, email, and password to `/api/register`
2. Backend validates input:
   - Username minimum 3 characters
   - Email format validation (regex pattern)
   - Password minimum 6 characters
   - Checks for existing username/email
3. Password hashed using bcrypt with generated salt
4. User record inserted into database
5. JWT token generated with user_id in subject claim
6. Token and user info returned to client
7. Client stores token in localStorage

**Login Process:**

1. User submits username and password to `/api/login`
2. Backend queries database for username
3. Password verified against stored hash using bcrypt
4. On success, JWT token generated
5. Token returned with user information

**Token Structure:**

```json
{
  "sub": "1",
  "exp": 1641234567
}
```

- sub: User ID (as string)
- exp: Expiration timestamp (7 days from creation)
- Signed with SECRET_KEY using HS256 algorithm

**Protected Route Access:**

1. Client includes token in Authorization header: `Bearer {token}`
2. Backend dependency `get_current_user_dependency` validates token
3. Token decoded and user_id extracted
4. User existence verified in database
5. User object returned for use in endpoint
6. 401 Unauthorized returned if validation fails

**Token Storage:**

- Frontend stores token in browser localStorage
- Persists across page refreshes
- Cleared on logout
- Auto-loaded on app initialization

**Security Measures:**

- Passwords never stored in plain text
- bcrypt salt rounds ensure computational difficulty
- JWT tokens expire after 7 days
- SECRET_KEY stored in environment variables
- HTTPS recommended for production

---

## 5. Voice Processing Pipeline

### Overview

The voice processing pipeline converts spoken audio into structured expense records through four stages: audio capture, transcription, extraction, and storage.

### Stage 1: Audio Capture (Frontend)

**Technology:** Browser MediaRecorder API

**Process:**
1. User grants microphone permission
2. MediaRecorder initialized with audio stream
3. Supported formats checked in order:
   - audio/webm;codecs=opus (preferred)
   - audio/webm
   - audio/mp4
   - audio/ogg
4. Audio data captured in chunks during recording
5. On stop, chunks combined into Blob

**Code Location:** VoiceRecorder.jsx, lines 16-80

**Key Features:**
- Real-time recording status indicator
- Stop/start controls
- Error handling for permission denial

### Stage 2: Transcription (Backend via Deepgram)

**Technology:** Deepgram API (flux-general-en model)

**Process:**
1. Frontend sends audio Blob via FormData to `/api/transcribe`
2. Backend receives UploadFile
3. Audio content sent to Deepgram REST API
4. Request headers include Deepgram API token
5. Model parameters:
   - model: "flux-general-en"
   - smart_format: true
   - punctuate: true
6. Deepgram returns JSON with transcript
7. Transcript extracted from response path: `results.channels[0].alternatives[0].transcript`
8. Transcript returned to frontend

**Code Location:** main.py, lines 764-822

**API Call Structure:**
```python
url = "https://api.deepgram.com/v1/listen"
headers = {"Authorization": f"Token {deepgram_api_key}"}
params = {
    "model": "flux-general-en",
    "smart_format": "true",
    "punctuate": "true",
}
response = await client.post(url, headers=headers, params=params, files={"audio": audio})
```

**Error Handling:**
- 503 returned if Deepgram API key not configured
- HTTP errors caught and returned with status codes
- Detailed error logging to console

### Stage 3: Expense Extraction

The system employs a two-tier extraction strategy with AI as primary and regex as fallback.

**Primary Method: Groq LLM Extraction**

**Model:** llama-3.1-70b-versatile
**Temperature:** 0.1 (for consistent, deterministic output)

**Prompt Engineering Strategy:**

The prompt is carefully crafted to handle edge cases and ensure clean output:

1. **Article Removal Instructions:**
   - Explicit examples of removing "a", "an", "the"
   - Special emphasis on NOT converting "an" to "N"
   - Multiple examples showing correct extraction

2. **Multi-Item Detection:**
   - Instructions to return JSON array
   - Detect multiple items with different prices
   - Create separate expense objects for each

3. **Amount Parsing Rules:**
   - 4-5 digit numbers: dollars.cents format (2350 = 23.50)
   - 3 digit numbers: whole dollars (700 = 700, not 7.00)
   - 6+ digit numbers: always whole dollars

4. **Date Parsing:**
   - Relative dates handled: yesterday, tomorrow, today
   - "X days ago" format
   - Default to current date if unspecified

5. **Category Assignment:**
   - Nine predefined categories
   - Single category per expense
   - Based on item keywords and store name

**Response Format:**
```json
[
  {
    "store": "Target",
    "items": "iPad",
    "category": "Electronics",
    "amount": 700,
    "date": "2026-01-04"
  }
]
```

**Post-Processing (Safety Net):**

After LLM extraction, additional cleaning applied:

```python
# Multiple passes to remove articles
items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE)
for _ in range(3):
    items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE)

# Apple product capitalization fixes
product_fixes = {
    'ipad': 'iPad',
    'iphone': 'iPhone',
    'macbook': 'MacBook',
    'imac': 'iMac',
    'ipod': 'iPod',
}
```

**Code Location:** main.py, lines 1006-1173

**Fallback Method: Regex Extraction**

**Trigger Conditions:**
- Groq API unavailable
- Groq API error (429, 500, etc.)
- Network failure

**Extraction Logic:**

1. **Multi-Item Detection:**
   - Pattern: `item1 for $X and ... item2 for $Y`
   - Creates separate expense objects

2. **Amount Patterns:**
   - `$XX.XX` - Standard dollar format
   - `XX dollars` - Spoken format
   - `for XXXX` - Handles 4-5 digit numbers with special logic
   - `XX cents` - Converts cents to dollars

3. **Store Patterns:**
   - `at [Store]`
   - `from [Store]`
   - `[Store] for`

4. **Item Extraction:**
   - Dash-separated items: `groceries - milk, bread`
   - Before store marker: `bought laptop from Apple`
   - After "for": `for $X laptop`
   - Keyword matching for common items

5. **Category Assignment:**
   - Keyword-based matching (9 categories)
   - Store-based inference
   - Supports multiple categories (comma-separated)

**Code Location:** main.py, lines 447-725

### Stage 4: Database Storage

**Process:**
1. Expense data (or array) received from extraction
2. For each expense in array:
   - Validate required fields (store, date)
   - Set defaults for optional fields
   - INSERT query executed with user_id
   - Expense ID captured from lastrowid
3. Transaction committed
4. Array of saved expenses returned to frontend

**Code Location:** main.py, lines 1150-1166 (Groq path)

---

## 6. AI Extraction Logic

### Groq LLM Configuration

**Model Selection Rationale:**

llama-3.1-70b-versatile chosen for:
- Fast inference (sub-second response)
- High accuracy on structured extraction
- Free tier availability
- Consistent JSON output
- Good at following complex instructions

**Temperature Setting:**

Temperature: 0.1
- Low temperature ensures deterministic output
- Reduces creativity, increases consistency
- Critical for structured data extraction
- Ensures similar inputs produce similar outputs

### Prompt Design Principles

**1. Clear Output Format:**
```
Return only valid JSON array, no additional text.
```

**2. Explicit Examples:**
```
Examples:
- "bought a laptop MacBook from Apple for $800" → [{"store": "Apple", "items": "MacBook", ...}]
- "I bought an iPad from Target for $700" → [{"store": "Target", "items": "iPad", ...}]
```

**3. Edge Case Handling:**

**Article Removal:**
```
CRITICAL: Always remove ALL articles (a, an, the) from the beginning of product names.
Examples:
- 'an iPad' → extract as 'iPad' (NOT 'an iPad', NOT 'N iPad')
- 'a laptop' → extract as 'laptop'
```

**Apple Product Capitalization:**
```
For Apple products, use EXACT capitalization: 'iPad', 'iPhone', 'MacBook', 'iMac', 'iPod'.
NEVER write 'Ipad', 'Iphone', etc.
```

**Amount Parsing:**
```
Only apply dollars.cents interpretation to 4-5 digit numbers like '2350' = 23.50.
Numbers like '700', '800' are whole dollars (700, 800), NOT 7.00, 8.00.
```

**Multi-Item Detection:**
```
If transcript mentions MULTIPLE items with DIFFERENT prices, create SEPARATE expense objects.
Example: 'eggs for $7 and iPad for $700' → Two objects with different amounts
```

### System Prompt

The system prompt establishes rules enforced across all requests:

```python
"You are a helpful assistant that extracts expense information from voice transcripts.
CRITICAL: Always return a JSON ARRAY of expense objects.
If transcript mentions MULTIPLE items with DIFFERENT prices, create SEPARATE expense objects.

RULES:
1) CRITICAL ARTICLE REMOVAL: The 'items' field must contain ONLY the PRODUCT/ITEM name.
   You MUST completely remove ALL articles (a, an, the) from the beginning.

2) NEVER include action words (I, bought, got, purchased) or store names in items field.

3) For Apple products, use EXACT capitalization: 'iPad', 'iPhone', 'MacBook'.

4) Each expense should have ONE category from: Electronics, Groceries, Clothing,
   Transportation, Dining, Entertainment, Health, Home, Utilities, Other.

5) If MULTIPLE items with DIFFERENT prices, create SEPARATE expense objects.

6) For amounts: Only apply dollars.cents interpretation to 4-5 digit numbers.

7) For dates: Handle relative dates (yesterday, tomorrow, X days ago)."
```

### Post-Processing Pipeline

**Step 1: Article Removal**
```python
items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE).strip()
for _ in range(3):
    items = re.sub(r'^(an|a|the|n)\s+', '', items, flags=re.IGNORECASE).strip()
```
- Multiple passes ensure complete removal
- Case-insensitive matching
- Aggressive removal of "n" (common LLM error)

**Step 2: Product Capitalization**
```python
product_fixes = {'ipad': 'iPad', 'iphone': 'iPhone', 'macbook': 'MacBook'}
if items_lower in product_fixes:
    items = product_fixes[items_lower]
elif items_lower.startswith(product_key + ' '):
    # Handle "ipad pro" → "iPad Pro"
    items = product_value + (' ' + remaining.title())
```

**Step 3: Date Parsing**
```python
if date_str.lower() in ["yesterday", "tomorrow", "today"] or "ago" in date_str.lower():
    date = parse_relative_date(transcript)
```

### Category System

**Nine Categories with Keywords:**

1. **Electronics:** laptop, computer, macbook, iphone, ipad, phone, tablet, tv
2. **Groceries:** milk, bread, eggs, food, banana, candy, apple
3. **Clothing:** shirt, pants, jacket, shoes
4. **Transportation:** gas, gasoline, fuel
5. **Dining:** restaurant, cafe, coffee, lunch, dinner
6. **Entertainment:** movie, game, book
7. **Health:** pharmacy, medicine
8. **Home:** furniture, bed, chair, rent, apartment, mortgage
9. **Utilities:** electric, water, internet

**Categorization Logic:**

Priority order:
1. Keyword match in items
2. Keyword match in transcript
3. Store-based inference
4. Default to "Other"

Example:
```python
if "laptop" in item_lower:
    category = "Electronics"
elif "walmart" in store_lower:
    category = "Groceries"
else:
    category = "Other"
```

### Handling Multi-Item Expenses

**Detection Pattern:**
```
"item1 for $X and item2 for $Y"
```

**Regex Pattern:**
```python
pattern = r'(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)\s+and\s+(?:i\s+)?(?:bought|got|purchased)?\s*(.+?)\s+for\s+\$?(\d+\.?\d*)'
```

**Processing:**
1. Extract both items and amounts
2. Parse each amount separately
3. Apply cleaning to each item
4. Categorize each item independently
5. Return array of two expense objects

**Example:**
```
Input: "I bought eggs from Walmart for $7 and I bought an iPad from Walmart for $700"

Output:
[
  {store: "Walmart", items: "eggs", amount: 7, category: "Groceries"},
  {store: "Walmart", items: "iPad", amount: 700, category: "Electronics"}
]
```

---

## 7. Frontend Architecture

### Component Hierarchy

```
App.jsx (Root)
├── ToastContainer
│   └── Toast (multiple instances)
├── Navigation (when authenticated)
└── View Components (conditional rendering):
    ├── LandingPage
    ├── Login
    ├── VoiceRecorder
    ├── AnalyticsDashboard
    ├── ExpenseList
    └── BudgetManagement
```

### State Management

**Global State (App.jsx):**

```javascript
const [isAuthenticated, setIsAuthenticated] = useState(false);
const [token, setToken] = useState(null);
const [user, setUser] = useState(null);
const [currentView, setCurrentView] = useState("landing");
const [expenses, setExpenses] = useState([]);
const [analytics, setAnalytics] = useState(null);
const [loading, setLoading] = useState(false);
const [toasts, setToasts] = useState([]);
```

**State Flow:**

1. Authentication state changes trigger view updates
2. View changes trigger data fetches
3. Data updates propagate to child components
4. Child components notify parent of actions via callbacks

**Key Functions:**

**fetchWithRetry:**
```javascript
const fetchWithRetry = async (url, options = {}, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status === 401) return response;
      if (i < maxRetries - 1 && response.status >= 500) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      return response;
    } catch (error) {
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
        continue;
      }
      throw error;
    }
  }
};
```
- Exponential backoff: 1s, 2s, 4s
- Retries on 5xx errors
- Immediate return on 401 (auth errors)

### Component Details

**App.jsx**

**Purpose:** Root component, manages global state and routing

**Key Responsibilities:**
- Authentication state management
- API data fetching with retry logic
- View routing based on authentication
- Toast notification management
- Token persistence in localStorage

**Effects:**
- Load token from localStorage on mount
- Fetch expenses/analytics when view or auth changes

**Navigation.jsx**

**Purpose:** Top navigation bar

**Features:**
- Tab-based navigation (Record, Dashboard, Expenses, Budgets)
- User info display
- Logout button
- Active tab highlighting

**Props:**
- currentView: Current active view
- onViewChange: Callback to change view
- onLogout: Callback for logout
- user: Current user object

**LandingPage.jsx**

**Purpose:** Welcome screen for unauthenticated users

**Features:**
- App introduction
- "Get Started" button
- Animated logo display

**Login.jsx**

**Purpose:** Authentication forms

**Features:**
- Toggle between login and registration
- Client-side validation
- Error display
- Password visibility toggle

**Validation Rules:**
- Username: minimum 3 characters
- Email: valid email format
- Password: minimum 6 characters

**VoiceRecorder.jsx**

**Purpose:** Voice input and manual text entry

**State:**
```javascript
const [isRecording, setIsRecording] = useState(false);
const [transcript, setTranscript] = useState("");
const [extractedExpense, setExtractedExpense] = useState(null);
const [manualInput, setManualInput] = useState("");
const [showManualInput, setShowManualInput] = useState(false);
const [error, setError] = useState("");
```

**Key Features:**
- MediaRecorder integration for audio capture
- Real-time recording indicator
- Manual text input option
- Loading state during processing
- Display extracted expense details
- Support for multi-expense responses

**Process Flow:**
1. Request microphone permission
2. Start MediaRecorder
3. Capture audio chunks
4. On stop, create Blob and send to backend
5. Display transcript
6. Show extracted expense(s)
7. Notify parent of new expense

**AnalyticsDashboard.jsx**

**Purpose:** Data visualization and statistics

**Charts Implemented:**

1. **Line Chart:** Spending over time
   - X-axis: Dates
   - Y-axis: Amount ($)
   - Tooltip shows date and amount

2. **Bar Chart:** Top stores
   - X-axis: Store names
   - Y-axis: Total spending
   - Sorted by amount descending

3. **Pie Chart 1:** Distribution by store
   - Percentage calculation
   - Color-coded segments
   - Legend display

4. **Pie Chart 2:** Distribution by category
   - Nine category colors
   - Percentage labels
   - Interactive tooltips

**Summary Cards:**
- Total expenses (sum)
- Number of purchases (count)
- Average expense (calculated)

**Actions:**
- "Clear All Expenses" button with confirmation

**ExpenseList.jsx**

**Purpose:** Expense management and filtering

**Features:**

1. **Search:**
   - Full-text search across store, items, category
   - Real-time filtering

2. **Filters:**
   - Category dropdown
   - Store dropdown
   - Amount range (min/max)
   - Date range (start/end)

3. **Sorting:**
   - Sort by: date, amount, store, created_at
   - Order: ascending/descending

4. **Actions:**
   - Edit expense inline
   - Delete individual expense
   - Confirmation dialogs

**UI Elements:**
- Card-based layout
- Glassmorphism effects
- Color-coded categories
- Empty state for no expenses

**BudgetManagement.jsx**

**Purpose:** Budget creation and tracking

**Features:**

1. **Create Budget Form:**
   - Category selection
   - Amount input
   - Month/year selectors
   - Recurring options:
     - Repeat interval (number)
     - Repeat unit (weeks/months/years)

2. **Budget Display:**
   - Progress bars
   - Percentage used calculation
   - Remaining amount
   - Alert levels (color-coded):
     - Green: < 75%
     - Yellow: 75-90%
     - Orange: 90-100%
     - Red: > 100%

3. **Budget Actions:**
   - Edit budget
   - Delete budget
   - Month/year filter

**State Management:**
```javascript
const [budgets, setBudgets] = useState([]);
const [category, setCategory] = useState("");
const [amount, setAmount] = useState("");
const [month, setMonth] = useState(new Date().getMonth() + 1);
const [year, setYear] = useState(new Date().getFullYear());
const [recurring, setRecurring] = useState(false);
const [repeatInterval, setRepeatInterval] = useState(1);
const [repeatUnit, setRepeatUnit] = useState("months");
```

**LoadingSkeleton.jsx**

**Purpose:** Loading placeholders

**Types:**
- Card skeleton
- Chart skeleton
- Custom count support

**Features:**
- Animated shimmer effect
- Prevents layout shift
- Matches actual content dimensions

**Toast.jsx / ToastContainer.jsx**

**Purpose:** Notification system

**Toast Types:**
- info (blue)
- success (green)
- warning (yellow)
- error (red)

**Features:**
- Auto-dismiss after duration
- Manual close button
- Smooth animations
- Stacked display
- Queue management

**Usage:**
```javascript
showToast("Expense saved successfully", "success", 5000);
```

---

## 8. Backend API Design

### FastAPI Application Structure

**Initialization:**
```python
app = FastAPI(title="Voxalyze Expense Tracker API")
```

**CORS Configuration:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Dependency Injection:**

Authentication dependency used across protected routes:
```python
async def get_current_user_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    # Validate JWT token
    # Extract user_id from token
    # Verify user exists
    # Return user object
```

### Request/Response Models

**Pydantic Models for Type Safety:**

```python
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
    repeat_unit: Optional[str] = None

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
```

### Error Handling

**HTTPException Usage:**
```python
if not user:
    raise HTTPException(status_code=401, detail="Incorrect username or password")

if not groq_api_key:
    raise HTTPException(status_code=503, detail="Groq API key not configured")
```

**Try-Catch Blocks:**
```python
try:
    # Groq extraction logic
except Exception as e:
    print(f"Groq error: {str(e)}")
    # Fallback to simple extraction
```

### Database Connections

**Pattern Used:**
```python
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()
try:
    # Database operations
    conn.commit()
finally:
    conn.close()
```

**Row Factory for Dict Results:**
```python
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
cursor.execute("SELECT * FROM expenses")
rows = cursor.fetchall()
expenses = [dict(row) for row in rows]
```

---

## 9. Analytics System

### Analytics Calculation

**Endpoint:** GET /api/analytics

**Process:**

1. Fetch all expenses for authenticated user
2. Calculate aggregations:

**Total Expenses:**
```python
total_expenses = sum(float(exp.get("amount") or 0)
                     if exp.get("amount") is not None else 0
                     for exp in expenses)
```

**Expense Count:**
```python
expense_count = len(expenses)
```

**Expenses by Store:**
```python
expenses_by_store = {}
for exp in expenses:
    store = exp["store"]
    amount = float(exp.get("amount") or 0)
    expenses_by_store[store] = expenses_by_store.get(store, 0) + amount
```

**Expenses by Category:**
```python
# Handles comma-separated categories
categories_str = exp.get("category") or "Other"
categories = [cat.strip() for cat in categories_str.split(",")]
for category in categories:
    if category:
        expenses_by_category[category] = expenses_by_category.get(category, 0) + amount
```

**Expenses by Date:**
```python
expenses_by_date = {}
for exp in expenses:
    date = exp["date"]
    amount = float(exp.get("amount") or 0)
    expenses_by_date[date] = expenses_by_date.get(date, 0) + amount

expenses_by_date_list = [
    {"date": date, "amount": amount}
    for date, amount in sorted(expenses_by_date.items())
]
```

**Recent Expenses:**
```python
recent_expenses = expenses[:10]
```

### Frontend Visualization

**Recharts Configuration:**

**Line Chart Example:**
```jsx
<LineChart data={analytics.expenses_by_date}>
  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
  <XAxis dataKey="date" stroke="#888" />
  <YAxis stroke="#888" />
  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a' }} />
  <Line type="monotone" dataKey="amount" stroke="#00d4ff" strokeWidth={2} />
</LineChart>
```

**Bar Chart Example:**
```jsx
<BarChart data={topStores}>
  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
  <XAxis dataKey="store" stroke="#888" />
  <YAxis stroke="#888" />
  <Tooltip contentStyle={{ backgroundColor: '#1a1a1a' }} />
  <Bar dataKey="amount" fill="#7b2ff7" />
</BarChart>
```

**Pie Chart Example:**
```jsx
<PieChart>
  <Pie
    data={storeData}
    dataKey="value"
    nameKey="name"
    cx="50%"
    cy="50%"
    outerRadius={80}
    label
  >
    {storeData.map((entry, index) => (
      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
    ))}
  </Pie>
  <Tooltip />
  <Legend />
</PieChart>
```

---

## 10. Budget Management

### Budget Creation

**Endpoint:** POST /api/budgets

**Process:**

1. Validate input (category, amount, month, year)
2. Check for existing budget (unique constraint)
3. Calculate number of periods for recurring budgets:
   - weeks: up to 60 periods
   - months: up to 60 periods
   - years: up to 60 periods
4. Create budget records for each period
5. Skip periods that already have budgets

**Recurring Budget Logic:**
```python
if budget.repeat_unit == "months":
    next_month = budget.month + (budget.repeat_interval * i)
    next_year = budget.year
    while next_month > 12:
        next_month -= 12
        next_year += 1
elif budget.repeat_unit == "years":
    next_month = budget.month
    next_year = budget.year + (budget.repeat_interval * i)
```

### Budget Tracking

**Endpoint:** GET /api/budgets/check

**Process:**

1. Fetch budgets for user (optionally filtered by month/year)
2. For each budget:
   - Calculate date range for the budget period
   - Query expenses in that date range matching the category
   - Handle case-insensitive matching
   - Handle comma-separated categories with LIKE patterns
   - Calculate actual spending
   - Calculate percentage used
   - Determine alert level

**Category Matching Logic:**
```python
# Exact match (case-insensitive)
cursor.execute("""
    SELECT SUM(amount) as total
    FROM expenses
    WHERE user_id = ?
      AND LOWER(TRIM(category)) = LOWER(?)
      AND date >= ? AND date <= ?
""", (user_id, budget_category, start_date, end_date))

# Pattern matching for comma-separated categories
cursor.execute("""
    SELECT SUM(amount) as total
    FROM expenses
    WHERE user_id = ? AND date >= ? AND date <= ?
      AND (
        LOWER(category) LIKE LOWER(?) OR
        LOWER(category) LIKE LOWER(?) OR
        LOWER(category) LIKE LOWER(?)
      )
""", (user_id, start_date, end_date,
      f"{budget_category},%",
      f"%, {budget_category},%",
      f"%, {budget_category}"))
```

**Alert Level Calculation:**
```python
percentage_used = (actual_spending / budget_amount * 100)

if percentage_used >= 100:
    alert_level = "exceeded"
elif percentage_used >= 90:
    alert_level = "warning"
elif percentage_used >= 75:
    alert_level = "caution"
else:
    alert_level = "ok"
```

### Frontend Budget Display

**Progress Bar:**
```jsx
<div className="budget-progress">
  <div
    className={`budget-progress-bar ${budget.alert_level}`}
    style={{ width: `${Math.min(budget.percentage_used, 100)}%` }}
  />
</div>
```

**CSS Classes for Alert Levels:**
```css
.budget-progress-bar.ok { background: #00d4ff; }
.budget-progress-bar.caution { background: #ffc107; }
.budget-progress-bar.warning { background: #ff9800; }
.budget-progress-bar.exceeded { background: #f44336; }
```

---

## 11. Error Handling and Fallbacks

### Multi-Layer Fallback System

**Layer 1: Transcription**
- Primary: Deepgram API
- Error conditions: API key missing, network error, quota exceeded
- User notified via error message

**Layer 2: Extraction**
- Primary: Groq LLM
- Fallback: Regex extraction
- Automatic fallback on any Groq error
- User may not notice the difference

**Layer 3: Network Requests**
- Retry logic with exponential backoff
- Retries: 3 attempts
- Delays: 1s, 2s, 4s
- Retries on 5xx server errors
- Immediate failure on 4xx client errors (except 401)

### Frontend Error Handling

**401 Unauthorized:**
```javascript
if (response.status === 401) {
    handleLogout();
    showToast("Session expired. Please login again.", "warning");
    return;
}
```

**Network Errors:**
```javascript
catch (error) {
    if (error.message === "Failed to fetch") {
        setError("Cannot connect to backend server. Please ensure it's running.");
    } else {
        setError(`Error: ${error.message}`);
    }
}
```

### Backend Error Handling

**Validation Errors:**
```python
if len(user_data.username.strip()) < 3:
    raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
```

**Database Errors:**
```python
try:
    cursor.execute("INSERT INTO users ...")
except sqlite3.IntegrityError:
    raise HTTPException(status_code=400, detail="Username already exists")
```

**External API Errors:**
```python
try:
    response = groq_client.chat.completions.create(...)
except Exception as e:
    print(f"Groq error: {str(e)}")
    # Fall back to regex extraction
    expenses_data = extract_expense_simple(transcript)
```

---

## 12. Security Considerations

### Authentication Security

**Password Security:**
- bcrypt hashing with automatic salt generation
- Minimum password length: 6 characters
- Passwords never stored in plain text
- Password verification uses constant-time comparison

**Token Security:**
- JWT tokens with 7-day expiration
- HS256 signing algorithm
- SECRET_KEY stored in environment variables
- Tokens include expiration timestamp
- Invalid tokens rejected with 401

**Session Management:**
- Tokens stored in localStorage (client-side)
- No server-side session storage
- Stateless authentication
- Logout clears token from localStorage

### API Security

**CORS Configuration:**
- Restricted to specific origins (localhost:3000, localhost:5173)
- Production should restrict to actual domain
- Credentials enabled for cookie support

**Input Validation:**
- Pydantic models validate all request bodies
- Type checking enforced
- SQL injection prevented by parameterized queries
- XSS prevented by React's automatic escaping

**SQL Injection Prevention:**
```python
# SAFE: Parameterized query
cursor.execute("SELECT * FROM users WHERE username = ?", (username,))

# UNSAFE: String concatenation (NOT used in this app)
# cursor.execute(f"SELECT * FROM users WHERE username = '{username}'")
```

### Environment Variable Security

**Sensitive Data in .env:**
- GROQ_API_KEY
- DEEPGRAM_API_KEY
- SECRET_KEY

**Protection:**
- .env file in .gitignore
- Never committed to version control
- Loading via python-dotenv
- Warnings if keys not set

### Production Security Recommendations

**HTTPS:**
- All communication should use HTTPS
- Prevents man-in-the-middle attacks
- Protects tokens in transit

**Secret Key:**
- Generate strong random key for production
- Never use default or predictable keys
- Rotate keys periodically

**Database:**
- Move to PostgreSQL for production
- Implement proper database user permissions
- Regular backups
- Encrypted connections

**Rate Limiting:**
- Implement rate limiting on API endpoints
- Prevent brute force attacks
- Limit expensive operations (AI calls)

---

## 13. Key Features and Functionality

### Voice Recording

**Implementation:**
- Browser MediaRecorder API for audio capture
- Supported formats: webm, mp4, ogg
- Real-time recording status indicator
- Stop/start controls
- Microphone permission handling

**User Experience:**
- Clear visual feedback during recording
- Animated recording indicator
- Error messages for permission issues

### AI-Powered Extraction

**Groq LLM Integration:**
- Fast inference (sub-second)
- Sophisticated prompt engineering
- Handles edge cases (articles, capitalization, amounts)
- Supports multi-item transactions
- Returns structured JSON

**Regex Fallback:**
- Pattern-based extraction
- Works without API keys
- Handles common expense formats
- Less accurate but reliable

### Analytics Dashboard

**Visualizations:**
- Line chart: Spending trends over time
- Bar chart: Top stores by spending
- Pie chart: Distribution by store
- Pie chart: Distribution by category

**Insights:**
- Total spending amount
- Number of purchases
- Average expense
- Recent transaction history

### Budget Tracking

**Features:**
- Create budgets per category
- Set monthly/yearly budgets
- Recurring budgets (weekly/monthly/yearly)
- Real-time spending tracking
- Alert levels based on usage

**Visual Feedback:**
- Color-coded progress bars
- Percentage usage display
- Remaining amount calculation

### Search and Filtering

**Expense Search:**
- Full-text search across store, items, category
- Multiple filter options:
  - Category
  - Store
  - Amount range
  - Date range
- Sorting by multiple fields
- Ascending/descending order

### Responsive Design

**Mobile Optimization:**
- Flexible layouts using CSS Grid and Flexbox
- Touch-friendly controls
- Readable text sizes
- Optimized charts for small screens

**Desktop Features:**
- Multi-column layouts
- Hover effects
- Keyboard navigation
- Larger visualizations

---

## 14. API Endpoints Reference

### Authentication Endpoints

**POST /api/register**
- Purpose: Create new user account
- Request Body: {username, email, password}
- Response: {access_token, token_type, user}
- Status Codes:
  - 200: Success
  - 400: Validation error or duplicate user

**POST /api/login**
- Purpose: Authenticate user and get token
- Request Body: {username, password}
- Response: {access_token, token_type, user}
- Status Codes:
  - 200: Success
  - 401: Invalid credentials

**GET /api/me**
- Purpose: Get current user information
- Headers: Authorization: Bearer {token}
- Response: {id, username, email}
- Status Codes:
  - 200: Success
  - 401: Invalid or missing token

### Transcription Endpoints

**POST /api/transcribe**
- Purpose: Transcribe audio to text using Deepgram
- Request: multipart/form-data with audio file
- Response: {transcript}
- Status Codes:
  - 200: Success
  - 503: Deepgram API not configured
  - 500: Transcription error

### Expense Extraction Endpoints

**POST /api/extract-expense**
- Purpose: Extract expense from transcript (Groq + fallback)
- Headers: Authorization: Bearer {token}
- Request Body: {transcript}
- Response: {expenses: [{id, store, items, category, amount, date}], count, message}
- Status Codes:
  - 200: Success
  - 400: Invalid transcript
  - 401: Unauthorized

**POST /api/extract-expense-simple**
- Purpose: Extract expense using regex only
- Headers: Authorization: Bearer {token}
- Request Body: {transcript}
- Response: {id, store, items, amount, date, message}
- Status Codes:
  - 200: Success
  - 400: Invalid transcript
  - 401: Unauthorized

### Expense CRUD Endpoints

**GET /api/expenses**
- Purpose: Get expenses with filtering and sorting
- Headers: Authorization: Bearer {token}
- Query Parameters:
  - search: Full-text search
  - category: Filter by category
  - store: Filter by store
  - min_amount: Minimum amount
  - max_amount: Maximum amount
  - start_date: Start date (YYYY-MM-DD)
  - end_date: End date (YYYY-MM-DD)
  - sort_by: Sort field (date, amount, store, created_at)
  - sort_order: Sort direction (asc, desc)
- Response: {expenses: [...], count}
- Status Codes:
  - 200: Success
  - 401: Unauthorized

**POST /api/expenses**
- Purpose: Create expense manually
- Headers: Authorization: Bearer {token}
- Request Body: {store, items, category, amount, date}
- Response: {id, store, items, category, amount, date, message}
- Status Codes:
  - 200: Success
  - 400: Validation error
  - 401: Unauthorized

**PUT /api/expenses/{id}**
- Purpose: Update existing expense
- Headers: Authorization: Bearer {token}
- Request Body: {store?, items?, category?, amount?, date?}
- Response: {message}
- Status Codes:
  - 200: Success
  - 400: Validation error
  - 401: Unauthorized
  - 404: Expense not found

**DELETE /api/expenses/{id}**
- Purpose: Delete single expense
- Headers: Authorization: Bearer {token}
- Response: {message}
- Status Codes:
  - 200: Success
  - 401: Unauthorized
  - 404: Expense not found

**DELETE /api/expenses**
- Purpose: Delete all user expenses
- Headers: Authorization: Bearer {token}
- Response: {message}
- Status Codes:
  - 200: Success
  - 401: Unauthorized

### Analytics Endpoints

**GET /api/analytics**
- Purpose: Get aggregated spending data
- Headers: Authorization: Bearer {token}
- Response: {total_expenses, expense_count, expenses_by_store, expenses_by_category, expenses_by_date, recent_expenses}
- Status Codes:
  - 200: Success
  - 401: Unauthorized

### Budget Endpoints

**GET /api/budgets**
- Purpose: List budgets with optional filtering
- Headers: Authorization: Bearer {token}
- Query Parameters:
  - month: Filter by month (1-12)
  - year: Filter by year
- Response: {budgets: [...], count}
- Status Codes:
  - 200: Success
  - 401: Unauthorized

**POST /api/budgets**
- Purpose: Create budget (supports recurring)
- Headers: Authorization: Bearer {token}
- Request Body: {category, amount, month, year, recurring?, repeat_interval?, repeat_unit?}
- Response: {id, category, amount, month, year, recurring, repeat_interval, repeat_unit, message}
- Status Codes:
  - 200: Success
  - 400: Validation error or duplicate
  - 401: Unauthorized

**PUT /api/budgets/{id}**
- Purpose: Update budget
- Headers: Authorization: Bearer {token}
- Request Body: {category?, amount?, month?, year?, recurring?, repeat_interval?, repeat_unit?}
- Response: {message}
- Status Codes:
  - 200: Success
  - 400: Validation error
  - 401: Unauthorized
  - 404: Budget not found

**DELETE /api/budgets/{id}**
- Purpose: Delete budget
- Headers: Authorization: Bearer {token}
- Response: {message}
- Status Codes:
  - 200: Success
  - 401: Unauthorized
  - 404: Budget not found

**GET /api/budgets/check**
- Purpose: Get budgets with spending comparison
- Headers: Authorization: Bearer {token}
- Query Parameters:
  - month: Filter by month
  - year: Filter by year
- Response: {budgets: [{...budget fields, actual_spending, remaining, percentage_used, alert_level}]}
- Status Codes:
  - 200: Success
  - 401: Unauthorized

### Development Endpoints

**GET /api/db-viewer**
- Purpose: View database contents in browser
- Response: HTML page with database tables
- Note: Should be disabled in production

---

## 15. Deployment Considerations

### Environment Setup

**Backend Environment Variables:**
```
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
SECRET_KEY=strong_random_secret
```

**Production Checklist:**
- Generate strong SECRET_KEY (32+ random characters)
- Configure production API keys
- Set appropriate CORS origins
- Disable development endpoints (db-viewer)

### Database Migration

**Current: SQLite**
- File-based, single-user suitable
- Local storage only
- No concurrent write support

**Production: PostgreSQL Recommended**
- Multi-user support
- Better concurrency
- Backup and replication
- Connection pooling
- Cloud hosting options (AWS RDS, Heroku, etc.)

**Migration Steps:**
1. Export SQLite data to SQL dump
2. Set up PostgreSQL instance
3. Update database connection string
4. Import data
5. Update queries if needed (SQLite → PostgreSQL syntax differences)

### Hosting Options

**Frontend:**
- Vercel (recommended for Vite/React)
- Netlify
- AWS S3 + CloudFront
- GitHub Pages

**Backend:**
- Heroku
- AWS EC2
- DigitalOcean
- Railway
- Render

**Full-Stack:**
- AWS (EC2 + S3 + RDS)
- DigitalOcean App Platform
- Google Cloud Platform

### Performance Optimizations

**Backend:**
- Database indexing on frequently queried columns
- Connection pooling for database
- Caching for analytics queries (Redis)
- Rate limiting to prevent abuse
- Compression middleware

**Frontend:**
- Code splitting for smaller bundles
- Lazy loading for routes
- Image optimization
- CDN for static assets
- Service worker for offline support

### Monitoring and Logging

**Recommended Tools:**
- Sentry for error tracking
- LogRocket for session replay
- DataDog for performance monitoring
- Google Analytics for usage tracking

**Logging Strategy:**
- Structured logging (JSON format)
- Log levels: DEBUG, INFO, WARNING, ERROR
- Centralized log aggregation
- Sensitive data filtering (no passwords in logs)

### Scaling Considerations

**Current Limitations:**
- SQLite not suitable for high concurrency
- No horizontal scaling
- Single server deployment

**Scaling Strategy:**
1. Move to PostgreSQL
2. Implement Redis caching
3. Add load balancer
4. Containerize with Docker
5. Orchestrate with Kubernetes
6. CDN for static assets
7. Message queue for async tasks

### Security Hardening

**Production Requirements:**
- HTTPS only
- Strong SECRET_KEY (rotated periodically)
- Rate limiting on all endpoints
- Request size limits
- SQL injection prevention (already implemented)
- XSS prevention (already implemented)
- CSRF tokens for state-changing operations
- Content Security Policy headers
- Regular dependency updates

### Backup Strategy

**Database Backups:**
- Daily automated backups
- Backup retention policy (30 days)
- Test restore procedures
- Offsite backup storage

**Code Backups:**
- Version control (Git)
- Multiple remote repositories
- Tagged releases
- Deployment rollback capability

---

## Conclusion

Voxalyze demonstrates a complete full-stack application with modern architecture, AI integration, and production-ready features. The system showcases expertise in React, FastAPI, database design, AI prompt engineering, and comprehensive error handling. The application is designed for extensibility and can scale from single-user deployments to multi-user cloud hosting with appropriate architectural modifications.
