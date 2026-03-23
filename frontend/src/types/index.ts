import type { ReactNode } from "react";

// ── Expenses ──────────────────────────────────────────────────────────

export interface Expense {
  id: number;
  store: string;
  items: string;
  category: string;
  amount: number;
  date: string;
  recurring?: boolean;
  source_expense_id?: number | null;
}

export interface PaginatedExpenses {
  expenses: Expense[];
  total_count: number;
}

export interface ExpenseFilters {
  search?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  exportAll?: boolean;
}

export interface RecurringSuggestion {
  interval: number;
  unit: string;
  label: string;
}

export interface ExpenseExtractionResult {
  expenses?: Expense[];
  count?: number;
  confidence?: number;
  recurring_suggestion?: RecurringSuggestion | null;
  message?: string;
  id?: number;
  store?: string;
  items?: string;
  category?: string;
  amount?: number;
  date?: string;
  [key: string]: unknown;
}

// ── Pantry ─────────────────────────────────────────────────────────────

export type StockStatus = "full" | "low" | "out_of_stock";

export interface PantryItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiration_date: string | null;
  purchase_date: string | null;
  expiration_predicted?: boolean;
  stock_status: StockStatus;
  notes: string | null;
  source_expense_id?: number | null;
  group_id?: number | null;
}

export interface PantryStats {
  total_items: number;
  full_stock: number;
  low_stock: number;
  out_of_stock: number;
  expiring_soon: number;
}

export interface PaginatedPantryItems {
  items: PantryItem[];
  page: number;
  page_size: number;
  total_count: number;
}

export interface PantryFilters {
  category?: string;
  stock_status?: StockStatus | "";
  search?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

// ── Shopping List ──────────────────────────────────────────────────────

export interface ShoppingListItem {
  id: number;
  name: string;
  quantity: number;
  unit?: string;
  category?: string;
  notes?: string;
  created_at: string;
  group_id?: number | null;
}

export interface ShoppingListGroup {
  id: number;
  name: string;
  invite_code?: string;
  owner_id?: string;
  members?: GroupMember[];
}

export interface GroupMember {
  user_id: string;
  email: string;
  username?: string;
  role?: string;
}

export interface PantryGroup {
  id: number;
  name: string;
  invite_code?: string;
  owner_id?: string;
  members?: GroupMember[];
}

export interface PantryMatch {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  stock_status: StockStatus;
}

// ── Budgets ────────────────────────────────────────────────────────────

export interface Budget {
  id: number;
  category: string;
  amount: number;
  actual_spending: number;
  remaining: number;
  percentage_used: number;
  month: number;
  year: number;
  recurring?: boolean;
  repeat_interval?: number;
  repeat_unit?: string;
}

// ── Analytics ──────────────────────────────────────────────────────────

export interface Analytics {
  total_expenses: number;
  expense_count: number;
  expenses_by_store: Record<string, number>;
  expenses_by_category: Record<string, number>;
  expenses_by_date: Array<{ date: string; amount: number }>;
}

// ── Chat ───────────────────────────────────────────────────────────────

export type ChatIntent =
  | "shopping_complete"
  | "shopping_list_add"
  | "shopping_list_remove"
  | "shopping_clear"
  | "pantry_add"
  | "pantry_query"
  | "pantry_remove"
  | "cooking_deduct"
  | "budget_set"
  | "budget_query"
  | "budget_meal"
  | "suggestion"
  | "expense_input"
  | "expense_query"
  | "expense_delete"
  | "meal_suggestion"
  | "meal_plan_week"
  | "store_trip"
  | "mark_subscription"
  | "reminder_check"
  | "share_list"
  | "general";

export interface ChatResponseData {
  items?: Array<Record<string, unknown>>;
  added_items?: Array<{ id: number; name: string; category: string }>;
  removed_items?: string[];
  removed_count?: number;
  deducted_items?: Array<{ name: string; old_quantity: number; new_quantity: number }>;
  deleted_expense?: { store?: string; amount?: number; items?: string; date?: string; category?: string };
  budgets?: Array<{ category: string; amount: number; actual_spending: number; remaining: number; percentage_used: number }>;
  pantry_added?: string[];
  skipped_items?: string[];
  meal_plan?: Array<Record<string, unknown>>;
  cleared_count?: number;
  total?: number;
  count?: number;
  time_period?: string;
  category?: string;
  store?: string;
  expenses?: Expense[];
  meal_type?: string;
  meals?: MealSuggestion[];
  expiring_items?: string[];
  [key: string]: unknown;
}

export interface ChatResponse {
  intent: ChatIntent;
  sub_intent?: string;
  response_text: string;
  data?: ChatResponseData;
}

// ── Spending Insights ──────────────────────────────────────────────────

export interface KeyFinding {
  type: "positive" | "warning" | "info";
  title: string;
  description: string;
}

export interface Recommendation {
  priority: "high" | "medium" | "low";
  category?: string;
  suggestion: string;
  potential_savings?: string;
}

export interface SpendingInsightsAI {
  headline: string;
  spending_personality: string;
  key_findings: KeyFinding[];
  recommendations: Recommendation[];
}

export interface TopCategory {
  category: string;
  amount: number;
  percentage: number;
  change?: number;
}

export interface TopStore {
  store: string;
  amount: number;
  visits: number;
  change?: number;
}

export interface BudgetStatus {
  category: string;
  status: string;
  percentage_used: number;
  spent: number;
  budget: number;
  remaining: number;
}

export interface SpendingInsights {
  summary: {
    total_spent: number;
    transaction_count: number;
    daily_average: number;
  };
  comparisons: {
    spending_change: number;
    transaction_change: number;
    daily_avg_change: number;
  };
  top_categories: TopCategory[];
  top_stores: TopStore[];
  budget_status: BudgetStatus[];
  ai_insights: SpendingInsightsAI;
  period: {
    start_date: string;
    end_date: string;
  };
}

// ── Spending Comparisons ───────────────────────────────────────────────

export interface CategoryComparison {
  category: string;
  current_amount: number;
  previous_amount: number;
  percent_change: number;
}

export interface StoreComparison {
  store: string;
  current_amount: number;
  previous_amount: number;
  current_visits: number;
  previous_visits: number;
  percent_change: number;
}

export interface ComparisonSummary {
  current_total: number;
  compare_total: number;
  total_difference: number;
  total_percent_change: number;
  current_count: number;
  compare_count: number;
  count_percent_change: number;
}

export interface SpendingComparison {
  summary: ComparisonSummary;
  category_comparisons: CategoryComparison[];
  store_comparisons: StoreComparison[];
  sentences: Array<{ text: string; type: "increase" | "decrease" }>;
  biggest_increase: CategoryComparison | null;
  biggest_decrease: CategoryComparison | null;
  current_period: { label: string };
  compare_period: { label: string };
}

// ── Daily Recs ─────────────────────────────────────────────────────────

export interface MealSuggestion {
  name: string;
  description: string;
  time_minutes?: number;
  uses_expiring?: boolean;
  ingredients_used?: string[];
  ingredients_needed?: string[];
  instructions?: string | string[];
}

export interface ExpiringItem {
  name: string;
  days_left: number;
  expiration_predicted?: boolean;
}

export interface LowStockItem {
  name: string;
  status: "low" | "out_of_stock";
}

export interface DailyRecs {
  meals: MealSuggestion[];
  expiring: ExpiringItem[];
  low_stock: LowStockItem[];
  pantry_count: number;
  greeting: string;
  available_ingredients: string;
  preference?: string;
}

// ── Recipe Detail ──────────────────────────────────────────────────────

export interface RecipeIngredient {
  amount: string;
  item: string;
}

export interface NutritionInfo {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
}

export interface RecipeDetail {
  name: string;
  description?: string;
  instructions: string[];
  ingredients: (string | RecipeIngredient)[];
  servings?: number;
  prep_minutes?: number;
  cook_minutes?: number;
  time_minutes?: number;
  difficulty?: string;
  nutrition?: NutritionInfo;
}

// ── Cook Meal ─────────────────────────────────────────────────────────

export interface CookMealResponse {
  success: boolean;
  recipe_name: string;
  deducted_items: Array<{
    name: string;
    old_quantity: number;
    new_quantity: number;
    new_status: string;
    was_expiring: boolean;
  }>;
  deducted_count: number;
  expiring_items_saved: number;
  estimated_savings: number;
}

export interface CookStats {
  week_meals_cooked: number;
  week_expiring_saved: number;
  week_estimated_savings: number;
  recent_meals: Array<{ recipe_name: string; cooked_at: string }>;
}

// ── Receipt Scanning ───────────────────────────────────────────────────

export interface ReceiptScanResult {
  store: string;
  amount: number;
  items: string;
  pantry_items?: string;
  date: string;
  category?: string;
}

// ── Streak ─────────────────────────────────────────────────────────────

export interface UserStreak {
  current_streak: number;
  longest_streak: number;
  total_expenses: number;
  last_logged_date: string | null;
}

// ── Toast / UI ─────────────────────────────────────────────────────────

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  type: "info" | "success" | "error" | "warning" | "celebration";
  duration: number;
  action?: ToastAction | null;
}

export type ShowToast = (
  message: string,
  type?: Toast["type"],
  duration?: number,
  action?: ToastAction | null
) => void;

// ── Meal Planner ──────────────────────────────────────────────────────

export type MealSlot = "breakfast" | "lunch" | "dinner";
export type DayOfWeek = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export interface PlannedMealIngredient {
  item: string;
  amount: string;
  in_pantry: boolean;
}

export interface PlannedMeal {
  id: number;
  day: DayOfWeek;
  slot: MealSlot;
  recipe_name: string;
  description?: string;
  time_minutes?: number;
  ingredients: PlannedMealIngredient[];
  week_start: string;
}

export interface MissingIngredient {
  item: string;
  amount: string;
  needed_for: string[];
}

export interface WeeklyMealPlan {
  week_start: string;
  meals: PlannedMeal[];
  shopping_summary: MissingIngredient[];
}

// ── Views ──────────────────────────────────────────────────────────────

export type AppView =
  | "landing"
  | "login"
  | "home"
  | "dashboard"
  | "expenses"
  | "budgets"
  | "insights"
  | "comparisons"
  | "pantry"
  | "shopping-list"
  | "chef"
  | "meal-planner"
  | "settings";

// ── Auth ───────────────────────────────────────────────────────────────

export interface AppUser {
  id: string;
  email: string;
  username: string;
  avatar_url?: string;
}

export interface AuthContextValue {
  user: import("@supabase/supabase-js").User | null;
  session: import("@supabase/supabase-js").Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    username: string
  ) => Promise<{ data: unknown; error: unknown }>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ data: unknown; error: unknown }>;
  signOut: () => Promise<{ error: unknown }>;
  signInWithGoogle: () => Promise<{ data: unknown; error: unknown }>;
  getToken: () => Promise<string | null>;
  updateUserProfile: (data: {
    first_name?: string;
    last_name?: string;
  }) => Promise<{ error: unknown }>;
  resetPassword: (email: string) => Promise<{ error: unknown }>;
  updatePassword: (password: string) => Promise<{ error: unknown }>;
  passwordRecovery: boolean;
}

// ── Theme ──────────────────────────────────────────────────────────────

export type Theme = "light" | "dark";

export interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

// ── CSV Export ──────────────────────────────────────────────────────────

export interface CsvColumn<T = Record<string, unknown>> {
  header: string;
  key: keyof T & string;
  transform?: (row: T) => string | number;
}

// ── Grocery Items ──────────────────────────────────────────────────────

export interface GroceryItem {
  name: string;
  category: string;
}
