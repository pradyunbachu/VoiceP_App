-- Create the meal_plan table for weekly meal planning
CREATE TABLE IF NOT EXISTS meal_plan (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,           -- Always the Monday of the week
    day TEXT NOT NULL CHECK (day IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    slot TEXT NOT NULL CHECK (slot IN ('breakfast','lunch','dinner')),
    recipe_name TEXT NOT NULL,
    description TEXT,
    time_minutes INTEGER,
    ingredients JSONB DEFAULT '[]'::jsonb,  -- [{item: str, amount: str}]
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One meal per day/slot/week per user
    UNIQUE (user_id, week_start, day, slot)
);

-- Index for fast lookups by user + week
CREATE INDEX IF NOT EXISTS idx_meal_plan_user_week ON meal_plan(user_id, week_start);

-- Enable RLS
ALTER TABLE meal_plan ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own meal plans
CREATE POLICY "Users can view own meal plans"
    ON meal_plan FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal plans"
    ON meal_plan FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal plans"
    ON meal_plan FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal plans"
    ON meal_plan FOR DELETE
    USING (auth.uid() = user_id);
