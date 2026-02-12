# Voxal

An AI-powered voice personal assistant for expense tracking, pantry management, and meal planning. Speak naturally to log expenses, manage your kitchen inventory, get meal recommendations, and analyze spending habits.

## Features

### Voice Assistant (Voxy)
- **Voice recording** with Deepgram speech-to-text transcription (nova-2 model)
- **Multi-intent understanding** - automatically detects whether you're logging an expense, updating your pantry, asking for meal ideas, or querying spending
- **Manual text entry** as an alternative to voice
- **Receipt scanning** with camera capture and Groq Vision OCR (llama-4-scout-17b)
- **Smart fallbacks** - regex-based extraction when AI services are unavailable

### Finance
- **Expense tracking** - AI-powered extraction of amount, store, category, and date from natural language
- **Analytics dashboard** - line charts (spending over time), bar charts (top stores), pie charts (by category and store)
- **Budget management** - monthly budgets by category with visual progress bars and overspend alerts
- **Spending insights** - AI-generated analysis of spending patterns, trends, and personalized recommendations
- **Recurring expenses** - automated tracking of recurring charges
- **CSV export** for expenses and budgets

### Kitchen
- **Pantry management** - drag-and-drop shelf UI with stock status tracking, expiration alerts, quantity/unit support, and category organization
- **Shopping lists** - autocomplete with 1000+ grocery items, fuzzy search, semantic pantry matching, and shared group lists with real-time collaboration
- **Daily recommendations** - slide-out side panel with AI-generated meal suggestions based on pantry contents, prioritizing expiring items, plus low stock alerts

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, Vite, TanStack React Query, Recharts, Lucide React, @dnd-kit, Fuse.js, Supabase JS SDK |
| **Backend** | Python FastAPI, Uvicorn, slowapi (rate limiting) |
| **AI/ML** | Groq LLM (llama-3.3-70b-versatile), Groq Vision (llama-4-scout-17b), Deepgram (nova-2) |
| **Database** | Supabase (PostgreSQL) with real-time subscriptions |
| **Auth** | Supabase Auth with JWT (ES256 + HS256) |

## Project Structure

```
VoiceP_App/
├── backend/
│   ├── main.py                # FastAPI app entry point
│   ├── auth.py                # JWT validation (ES256 + HS256)
│   ├── config.py              # Supabase, Groq, Deepgram clients
│   ├── cache.py               # In-memory API cache with TTL
│   ├── rate_limit.py          # slowapi rate limiting
│   ├── schemas.py             # Pydantic request/response models
│   ├── routes/
│   │   ├── analytics.py       # Spending analytics & aggregation
│   │   ├── budgets.py         # Budget CRUD
│   │   ├── chat.py            # Voice assistant intent routing
│   │   ├── daily_recs.py      # AI meal recommendations
│   │   ├── expense_extraction.py  # AI + regex expense parsing
│   │   ├── expenses.py        # Expense CRUD
│   │   ├── insights.py        # AI spending analysis
│   │   ├── pantry.py          # Pantry CRUD with filtering/sorting
│   │   ├── receipt.py         # Receipt OCR via Groq Vision
│   │   ├── recurring.py       # Recurring expense management
│   │   ├── shopping_list.py   # Shopping list CRUD
│   │   ├── shopping_list_sharing.py  # Group shopping lists
│   │   └── transcription.py   # Deepgram speech-to-text
│   └── handlers/              # Chat intent detection & response handlers
├── frontend/
│   └── src/
│       ├── App.jsx            # Main app with view routing
│       ├── index.css          # Global styles, CSS variables, theming
│       ├── components/
│       │   ├── VoiceRecorder.jsx       # Voice input, manual entry, receipt trigger
│       │   ├── AnalyticsDashboard.jsx  # Charts & spending stats
│       │   ├── ExpenseList.jsx         # Expense history with search/filter/sort
│       │   ├── BudgetManagement.jsx    # Budget creation & tracking
│       │   ├── SpendingInsights.jsx    # AI spending analysis
│       │   ├── Pantry.jsx              # Drag-and-drop inventory management
│       │   ├── ShoppingList.jsx        # Shopping items with autocomplete
│       │   ├── ShoppingListGroupSelector.jsx  # Shared list management
│       │   ├── DailyRecs.jsx           # Slide-out meal recommendations panel
│       │   ├── ReceiptScanner.jsx      # Camera capture & image upload OCR
│       │   ├── Navigation.jsx          # Top nav with Finance/Kitchen dropdowns
│       │   ├── ChatResponseDisplay.jsx # Voice assistant response rendering
│       │   ├── ExpenseResult.jsx       # Extracted expense display
│       │   ├── ManualInput.jsx         # Manual expense form
│       │   └── LandingPage.jsx         # Welcome screen
│       ├── hooks/              # React Query hooks (queries + mutations)
│       ├── context/            # Auth context (Supabase)
│       ├── config/             # API base URL config
│       ├── constants/          # Grocery items list, pantry categories
│       └── lib/                # Utilities (image compression)
└── Dockerfile
```

## Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- A Supabase project with the required tables
- API keys for Groq and Deepgram

### Environment Variables

Create `backend/.env`:
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_JWT_SECRET=your_jwt_secret
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
ALLOWED_ORIGINS=http://localhost:5173
```

### Run Locally

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173` with the API at `http://localhost:8000`.

## Navigation

| Tab | Pages |
|-----|-------|
| **Voxy** | Voice recorder, manual entry, receipt scanner |
| **Finance** | Dashboard (analytics), Expenses (history), Budgets, Insights |
| **Kitchen** | Pantry, Shopping List |

The Daily Recommendations panel is accessible via a toggle button on the right edge of the Voxy page.

## API Endpoints

### Transcription & Extraction
- `POST /api/transcribe` - Speech-to-text via Deepgram
- `POST /api/extract-expense` - AI expense extraction (Groq)
- `POST /api/extract-expense-simple` - Regex fallback extraction
- `POST /api/scan-receipt` - Receipt OCR via Groq Vision

### Expenses
- `GET /api/expenses` - List expenses (with filtering)
- `POST /api/expenses` - Create expense
- `PUT /api/expenses/{id}` - Update expense
- `DELETE /api/expenses/{id}` - Delete expense
- `DELETE /api/expenses` - Clear all expenses

### Analytics & Insights
- `GET /api/analytics` - Aggregated spending data
- `GET /api/insights` - AI-generated spending analysis

### Budgets
- `GET /api/budgets` - List budgets (with month/year filtering)
- `POST /api/budgets` - Create budget
- `PUT /api/budgets/{id}` - Update budget
- `DELETE /api/budgets/{id}` - Delete budget

### Pantry
- `GET /api/pantry` - List pantry items (with filtering, sorting, pagination)
- `POST /api/pantry` - Add pantry item
- `PUT /api/pantry/{id}` - Update pantry item
- `DELETE /api/pantry/{id}` - Delete pantry item
- `POST /api/pantry/bulk-delete` - Bulk delete

### Shopping Lists
- `GET /api/shopping-list` - List items (personal or group)
- `POST /api/shopping-list` - Add item
- `DELETE /api/shopping-list/{id}` - Remove item
- `POST /api/shopping-list/remove-purchased` - Clear purchased items

### Shopping List Groups
- `GET /api/shopping-list-groups` - List groups
- `POST /api/shopping-list-groups` - Create group
- `POST /api/shopping-list-groups/{id}/invite` - Invite member
- `DELETE /api/shopping-list-groups/{id}/members/{user_id}` - Remove member

### Voice Assistant & Recommendations
- `POST /api/chat` - Multi-intent voice assistant
- `GET /api/daily-recs` - AI meal recommendations + pantry alerts

## Security

- JWT authentication on all protected endpoints
- Rate limiting per endpoint (10-60 req/min)
- CORS whitelisting
- CSRF protection (configurable)
- Input validation with Pydantic schemas
- Request size limits (10MB for audio uploads)
- Environment-based configuration (no hardcoded credentials)

## License

MIT
