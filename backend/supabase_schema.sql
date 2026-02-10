-- ============================================================================
-- Supabase Database Schema for voxal
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor to create all tables
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store TEXT NOT NULL,
    items TEXT NOT NULL,
    category TEXT,
    amount REAL,
    date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_recurring INTEGER DEFAULT 0,
    recurring_interval INTEGER,
    recurring_unit TEXT,
    parent_recurring_id BIGINT REFERENCES expenses(id) ON DELETE SET NULL
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    recurring INTEGER DEFAULT 0,
    repeat_interval INTEGER,
    repeat_unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, category, month, year)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring ON expenses(is_recurring, parent_recurring_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_month_year ON budgets(user_id, month, year);

-- Enable Row Level Security (RLS) - Optional but recommended
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Create policies (users can only access their own data)
-- Note: These policies assume you're using Supabase Auth. 
-- If using custom JWT, you may need to adjust these policies.

-- Policy for expenses (users can only see their own expenses)
CREATE POLICY "Users can view their own expenses"
    ON expenses FOR SELECT
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own expenses"
    ON expenses FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own expenses"
    ON expenses FOR UPDATE
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete their own expenses"
    ON expenses FOR DELETE
    USING (auth.uid()::text = user_id::text);

-- Policy for budgets (users can only see their own budgets)
CREATE POLICY "Users can view their own budgets"
    ON budgets FOR SELECT
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own budgets"
    ON budgets FOR INSERT
    WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own budgets"
    ON budgets FOR UPDATE
    USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete their own budgets"
    ON budgets FOR DELETE
    USING (auth.uid()::text = user_id::text);

-- Note: If you're NOT using Supabase Auth and using custom JWT instead,
-- you may want to disable RLS or create custom policies based on your JWT claims.
-- For now, you can disable RLS if needed:
-- ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE budgets DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Shopping List Table (for Supabase Auth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS shopping_list (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity REAL DEFAULT 1,
    unit TEXT,
    category TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_user_id ON shopping_list(user_id);

-- Enable RLS for shopping_list
ALTER TABLE shopping_list ENABLE ROW LEVEL SECURITY;

-- Policies for shopping_list
CREATE POLICY "Users can view their own shopping list"
    ON shopping_list FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shopping list items"
    ON shopping_list FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shopping list items"
    ON shopping_list FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shopping list items"
    ON shopping_list FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================================================
-- Google Calendar Tokens Table (for Supabase Auth)
-- ============================================================================
-- Stores OAuth tokens for Google Calendar integration
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMPTZ NOT NULL,
    google_email TEXT,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_tokens_user_id ON google_calendar_tokens(user_id);

-- Enable RLS for google_calendar_tokens
ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Policies for google_calendar_tokens
CREATE POLICY "Users can view their own Google Calendar tokens"
    ON google_calendar_tokens FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Google Calendar tokens"
    ON google_calendar_tokens FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Google Calendar tokens"
    ON google_calendar_tokens FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Google Calendar tokens"
    ON google_calendar_tokens FOR DELETE
    USING (auth.uid() = user_id);
