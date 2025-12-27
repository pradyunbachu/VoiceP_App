# Setup Instructions for User Authentication System

## Step 1: Pull the Latest Code (On Your Mac)

```bash
cd /path/to/VoiceP_App
git fetch origin
git checkout claude/user-auth-dashboards-lBxfv
git pull origin claude/user-auth-dashboards-lBxfv
```

## Step 2: Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

This will install the fixed `bcrypt==4.1.2` package.

## Step 3: Initialize the Database

```bash
# Option A: Run the init script
python3 init_database.py

# OR Option B: Just start the server (it auto-initializes)
# Skip to Step 4
```

## Step 4: Start the Backend Server

```bash
# Make sure you're in the backend directory
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

You should see:
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
```

## Step 5: Start the Frontend (New Terminal)

```bash
cd ../frontend
npm install  # if you haven't already
npm run dev
```

## Step 6: Test It!

1. Open browser to http://localhost:5173
2. Click "Get Started"
3. Create an account (username: alice, password: password123)
4. You should be logged in and see your dashboard!

## Verify the Fix Worked

Check that your files have the new code:

```bash
# Should show bcrypt.hashpw
grep -A 3 "def get_password_hash" backend/main.py

# Should show bcrypt==4.1.2
grep bcrypt backend/requirements.txt
```

## Troubleshooting

**If registration fails:**
- Check backend terminal for errors
- Make sure you ran `pip install -r requirements.txt`
- Delete `backend/expenses.db` and restart the server

**If "Could not validate credentials":**
- Clear your browser's localStorage
- Register a new account

**Database issues:**
- Run: `python3 backend/init_database.py`
- Or delete `backend/expenses.db` and let it recreate
