# Voxalyze - Voice Powered Expense Tracker

A modern expense tracking application that lets you record expenses using your voice. Speak about your purchase, and the app extracts store name, items, amount, date, and categories, then displays everything in an analytics dashboard.

## Features

- Voice Recording: Record expenses using your microphone with MediaRecorder API (browser-based audio capture)
- AI-Powered Transcription: Converts speech to text using Deepgram API (Flux model)
- AI-Powered Extraction: Automatically extracts store, items, amount, date, and categories from voice transcripts using Groq LLM
- Analytics Dashboard: Visualize spending with interactive charts including line, bar, and pie charts
- Expense History: View and manage all recorded expenses with delete functionality
- Modern Dark UI: Black theme with glassmorphism effects and neon accents
- Responsive Design: Works on desktop and mobile devices
- Smart Fallbacks: Automatically falls back to regex-based extraction if AI services are unavailable
- Manual Entry: Type expenses manually if voice recording isn't available
- Category Support: Automatically categorizes expenses (Electronics, Groceries, Dining, etc.) with support for multiple categories per expense

## Tech Stack

### Backend

- FastAPI - Python web framework for building REST APIs
  - Handles CORS, request validation, and error handling
  - Provides endpoints for transcription, expense extraction, analytics, and CRUD operations
- Deepgram API - Speech-to-text transcription service
  - Uses flux-general-en model for conversational speech recognition
  - High accuracy transcription of voice recordings
  - REST API integration via httpx
- Groq LLM - AI inference engine for expense extraction
  - Uses llama-3.1-70b-versatile model for JSON extraction
  - Free tier available with generous rate limits
  - Primary method for extracting structured expense data from voice transcripts
- Simple Regex Extraction - Fallback extraction method
  - Pattern-based extraction when Groq is unavailable
  - Handles common expense formats (dollars, cents, store names, items)
  - Ensures app works even without API keys
- SQLite - Lightweight, file-based database

  - Stores expenses locally in voxalyze.db
  - Tracks: store, items, category, amount, date, and timestamps
  - Provides analytics aggregation (totals, by store, by date, by category)

- Python-dotenv - Environment variable management
  - Securely loads API keys from .env file
  - Prevents sensitive data from being committed to git

### Frontend

- React 18 - UI library for building interactive components
  - Component-based architecture (VoiceRecorder, AnalyticsDashboard, ExpenseList, Navigation, LandingPage)
  - State management with hooks (useState, useEffect)
  - Efficient re-rendering and data flow
- MediaRecorder API - Browser API for audio recording
  - Captures audio from user's microphone
  - Supports multiple audio formats (webm, mp4, ogg)
  - Creates audio blobs for backend processing
- Vite - Frontend build tool
  - Fast development server with HMR (Hot Module Replacement)
  - Optimized production builds
  - Proxy configuration for API requests
- Recharts - Charting library built on React
  - Line charts for expense trends over time
  - Bar charts for top stores comparison
  - Pie charts for expense distribution by store and category
  - Responsive and customizable with dark theme support
- Lucide React - Icon library
  - Consistent iconography throughout the app
  - Lightweight and tree-shakeable
- CSS3 - Modern styling with:
  - Glassmorphism effects (backdrop-filter, blur)
  - CSS Grid and Flexbox for responsive layouts
  - CSS animations and transitions
  - Dark theme with gradient accents
  - Ubuntu font family

## Architecture

### Application Flow

1. Voice Input: User clicks "Start Recording" → MediaRecorder API captures audio
2. Transcription: Audio blob sent to backend → Deepgram API converts speech to text
3. Expense Extraction: Transcript sent to Groq LLM → Extracts structured data including categories
4. Data Storage: Extracted expense saved to SQLite database
5. Analytics: Real-time dashboard updates with charts and statistics
6. View Management: Navigation tabs switch between Landing, Record, Dashboard, and Expenses views

### API Architecture

- RESTful Design: Clean separation between frontend and backend
- CORS Enabled: Allows frontend to communicate with backend
- Error Handling: Graceful fallbacks at every layer
- Data Validation: Pydantic models ensure type safety

## Project Structure

```
VoiceP_App/
├── backend/
│   ├── main.py              # FastAPI application with all endpoints
│   ├── requirements.txt      # Python dependencies
│   ├── .env                  # Environment variables (API keys) - NOT in git
│   ├── .env.example          # Template for environment variables
│   ├── voxalyze.db           # SQLite database - NOT in git
│   └── venv/                 # Virtual environment - NOT in git
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navigation.jsx        # Top navigation bar with tabs
│   │   │   ├── Navigation.css
│   │   │   ├── LandingPage.jsx       # Landing page component
│   │   │   ├── LandingPage.css
│   │   │   ├── VoiceRecorder.jsx     # Voice recording and expense input
│   │   │   ├── VoiceRecorder.css
│   │   │   ├── AnalyticsDashboard.jsx # Analytics charts and stats
│   │   │   ├── AnalyticsDashboard.css
│   │   │   ├── ExpenseList.jsx       # Expense history list
│   │   │   └── ExpenseList.css
│   │   ├── App.jsx            # Main app component with routing
│   │   ├── App.css            # Global app styles
│   │   ├── main.jsx           # React entry point
│   │   └── index.css           # Global CSS reset and base styles
│   ├── index.html            # HTML template
│   ├── package.json          # Node dependencies
│   └── vite.config.js        # Vite configuration
├── .gitignore                # Git ignore rules (protects .env, .db, etc.)
└── README.md                 # This file
```

## Security

### Protected Files (in .gitignore)

- `.env` - Contains API keys (Groq, Deepgram)
- `*.db`, `*.sqlite` - Database files with user data
- `venv/`, `node_modules/` - Dependencies
- `__pycache__/` - Python cache files

### Security Best Practices

- API keys loaded from environment variables only
- No hardcoded credentials in source code
- Database stored locally (not in cloud)
- CORS configured for specific origins only
- Input validation on all API endpoints

## Setup Instructions

### Prerequisites

- Python 3.8+
- Node.js 16+
- Groq API key (free at https://console.groq.com/) - Optional but recommended
- Deepgram API key (free at https://console.deepgram.com/) - Required for transcription

### Backend Setup

1. Navigate to the backend directory:

```bash
cd backend
```

2. Create a virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Create a `.env` file in the backend directory:

```bash
# Copy the example file (if it exists) or create new
touch .env
```

5. Add your API keys to `.env`:

```
GROQ_API_KEY=your_groq_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
```

Note: 
- Get a free Groq API key at https://console.groq.com/. The app will work without it using simple regex extraction, but Groq provides better accuracy.
- Get a free Deepgram API key at https://console.deepgram.com/. This is required for voice transcription.

6. Run the backend server:

```bash
python main.py
```

The backend will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:

```bash
cd frontend
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Usage

1. Start the Application:

   - Start backend: `cd backend && python main.py`
   - Start frontend: `cd frontend && npm run dev`

2. Landing Page:

   - Opens automatically at `http://localhost:3000`
   - Click "Get Started" or use navigation tabs

3. Record an Expense:

   - Click "Record Expense" tab
   - Click "Start Recording"
   - Speak: "I bought groceries at Walmart for $45.50 - milk, bread, and eggs"
   - Click "Stop Recording"
   - Expense is automatically extracted and saved

4. View Analytics:

   - Click "Dashboard" tab
   - See total expenses, purchase count, charts, and trends

5. Manage Expenses:
   - Click "Expenses" tab
   - View all recorded expenses
   - Delete expenses as needed
   - Clear all expenses from the dashboard

## API Endpoints

- `GET /` - API health check
- `POST /api/transcribe` - Transcribe audio to text using Deepgram API
- `POST /api/extract-expense` - Extract expense information from transcript (uses Groq or fallback)
- `POST /api/extract-expense-simple` - Simple regex-based extraction (no API needed)
- `GET /api/expenses` - Get all expenses
- `GET /api/analytics` - Get analytics data (totals, by store, by date, by category)
- `DELETE /api/expenses/{id}` - Delete an expense
- `DELETE /api/expenses` - Delete all expenses
- `GET /api/db-viewer` - View database contents in browser (development tool)

## UI/UX Features

- Dark Theme: Black background with neon accent colors
- Glassmorphism: Translucent cards with backdrop blur effects
- Smooth Animations: Hover effects, transitions, and loading states
- Responsive Design: Works on desktop, tablet, and mobile
- Navigation: Fixed top bar with tab-based navigation
- Landing Page: Introduction screen with animated logo

## Fallback System

The app has multiple layers of fallbacks to ensure it always works:

1. Transcription: Deepgram API → Error message if unavailable
2. Extraction: Groq LLM → Simple regex extraction
3. Data: Always saves to database, even with minimal extraction

## Notes

- Microphone permissions required for voice recording
- Works offline for viewing expenses (once data is loaded)
- Database is stored locally - no cloud sync
- All processing happens in real-time
- No user accounts needed - simple local storage

## Troubleshooting

- "Failed to fetch" error: Make sure backend is running on port 8000
- No transcription: Check browser microphone permissions and Deepgram API key
- Poor extraction: Add Groq API key for better accuracy
- Database errors: Check file permissions on `voxalyze.db`

## License

MIT

## Acknowledgments

- Groq for fast, free AI inference
- Deepgram for accurate speech-to-text transcription
- FastAPI and React communities for excellent frameworks
