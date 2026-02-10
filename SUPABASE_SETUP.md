# Supabase Setup Guide

This guide will help you set up Supabase for the voxal application.

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. A Supabase project created

## Step 1: Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Fill in:
   - **Name**: voxal (or your preferred name)
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to you
4. Click "Create new project"
5. Wait for the project to be provisioned (takes ~2 minutes)

## Step 2: Get Your API Credentials

1. In your Supabase project dashboard, look at the left sidebar
2. Click on **Settings** (gear icon at the bottom)
3. Click on **API** in the settings menu
4. You'll see a section called **Project API keys**
5. Copy the following:
   - **Project URL** - This is at the top, labeled "Project URL" (e.g., `https://xxxxx.supabase.co`)
   - **anon public key** - This is the long string under "Project API keys" section, labeled "anon" or "public" (it's the one that's NOT the "service_role" key - that one is secret!)
   
   **Important**: Use the **anon** or **public** key, NOT the service_role key. The anon key is safe to use in your frontend/backend code.

## Step 3: Set Up Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New query"
3. Copy and paste the contents of `backend/supabase_schema.sql`
4. Click "Run" to execute the SQL
5. Verify tables were created by going to **Table Editor** - you should see:
   - `users`
   - `expenses`
   - `budgets`

## Step 4: Configure Environment Variables

1. Create or update your `.env` file in the `backend/` directory:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your_anon_key_here

# Other existing variables...
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
SECRET_KEY=your_secret_key
```

2. Replace:
   - `SUPABASE_URL` with your Project URL from Step 2
   - `SUPABASE_KEY` with your anon/public key from Step 2

## Step 5: Install Dependencies

Make sure Supabase dependencies are installed:

```bash
cd backend
pip install -r requirements.txt
```

The following packages should be installed:
- `supabase>=2.0.0`
- `psycopg2-binary>=2.9.0`

## Step 6: Test the Connection

1. Start your backend server:
```bash
cd backend
python main.py
```

2. You should see:
   - "Supabase client initialized successfully"
   - "Supabase connection verified successfully"

If you see errors, check:
- Your `.env` file has correct credentials
- The database schema was created successfully
- Your Supabase project is active

## Step 7: (Optional) Disable Row Level Security

If you're using custom JWT authentication (not Supabase Auth), you may want to disable Row Level Security (RLS):

1. Go to **SQL Editor** in Supabase dashboard
2. Run:
```sql
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;
```

**Note**: The schema file includes RLS policies that assume Supabase Auth. Since this app uses custom JWT, you can either:
- Disable RLS (simpler, less secure)
- Create custom RLS policies based on your JWT claims (more secure)

## Migration from SQLite

If you have existing data in SQLite:

1. Export your SQLite data
2. Use the Supabase dashboard's **Table Editor** to import data, or
3. Create a migration script to transfer data programmatically

## Troubleshooting

### "Database not configured" error
- Check that `SUPABASE_URL` and `SUPABASE_KEY` are set in `.env`
- Restart your backend server after updating `.env`

### "relation does not exist" error
- Make sure you ran the SQL schema in Step 3
- Check the **Table Editor** to verify tables exist

### Connection timeout
- Check your Supabase project is active (not paused)
- Verify your network connection
- Check if your IP needs to be whitelisted (unlikely for anon key)

### Authentication errors
- If using RLS, make sure policies are set correctly
- Consider disabling RLS if using custom JWT (see Step 7)

## Next Steps

- Your app is now using Supabase!
- All database operations will go through Supabase
- You can monitor your database in the Supabase dashboard
- Check **Table Editor** to see your data
- Use **SQL Editor** for custom queries

## Support

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com

