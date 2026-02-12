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
-- Shared Shopping List Groups (for Supabase Auth)
-- ============================================================================

-- Shopping list groups for shared lists
CREATE TABLE IF NOT EXISTS shopping_list_groups (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_groups_owner ON shopping_list_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_groups_invite ON shopping_list_groups(invite_code);

-- Shopping list group members
CREATE TABLE IF NOT EXISTS shopping_list_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES shopping_list_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_members_group ON shopping_list_members(group_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_members_user ON shopping_list_members(user_id);

-- Add group_id to shopping_list (nullable for backward compat)
ALTER TABLE shopping_list ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES shopping_list_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shopping_list_group ON shopping_list(group_id);

-- Enable RLS for new tables
ALTER TABLE shopping_list_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_members ENABLE ROW LEVEL SECURITY;

-- Policies for shopping_list_groups
CREATE POLICY "Group members can view their groups"
    ON shopping_list_groups FOR SELECT
    USING (
        owner_id = auth.uid()
        OR id IN (SELECT group_id FROM shopping_list_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can create groups"
    ON shopping_list_groups FOR INSERT
    WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their groups"
    ON shopping_list_groups FOR UPDATE
    USING (owner_id = auth.uid());

CREATE POLICY "Owners can delete their groups"
    ON shopping_list_groups FOR DELETE
    USING (owner_id = auth.uid());

-- Policies for shopping_list_members
CREATE POLICY "Group members can view members"
    ON shopping_list_members FOR SELECT
    USING (
        group_id IN (SELECT id FROM shopping_list_groups WHERE owner_id = auth.uid())
        OR group_id IN (SELECT group_id FROM shopping_list_members AS m WHERE m.user_id = auth.uid())
    );

CREATE POLICY "Group owners can manage members"
    ON shopping_list_members FOR INSERT
    WITH CHECK (
        group_id IN (SELECT id FROM shopping_list_groups WHERE owner_id = auth.uid())
        OR user_id = auth.uid()
    );

CREATE POLICY "Owners can remove members or members can leave"
    ON shopping_list_members FOR DELETE
    USING (
        group_id IN (SELECT id FROM shopping_list_groups WHERE owner_id = auth.uid())
        OR user_id = auth.uid()
    );

-- Update shopping_list policies to allow group member access
CREATE POLICY "Group members can view group shopping items"
    ON shopping_list FOR SELECT
    USING (
        user_id = auth.uid()
        OR group_id IN (SELECT group_id FROM shopping_list_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Group members can add items to group lists"
    ON shopping_list FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        OR group_id IN (SELECT group_id FROM shopping_list_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Group members can update group items"
    ON shopping_list FOR UPDATE
    USING (
        user_id = auth.uid()
        OR group_id IN (SELECT group_id FROM shopping_list_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Group members can delete group items"
    ON shopping_list FOR DELETE
    USING (
        user_id = auth.uid()
        OR group_id IN (SELECT group_id FROM shopping_list_members WHERE user_id = auth.uid())
    );

