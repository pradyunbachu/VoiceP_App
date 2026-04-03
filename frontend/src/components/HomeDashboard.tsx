import { useMemo, useState, useRef } from "react";
import type { FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, HelpCircle, Flame, CreditCard } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  useExpenses,
  usePantryStats,
  usePantryItems,
  useShoppingList,
  useCookStats,
  useBudgets,
  useDailyRecs,
  useRecipeDetail,
  useCookMeal,
} from "../hooks";
import { DEMO_PANTRY_ITEMS } from "../constants/demoPantry";
import type { AppView, ShowToast, PantryItem, Expense, MealSuggestion, RecipeDetail, CookMealResponse } from "../types";
import MixingBowlLoader from "./MixingBowlLoader";
import RecipeDetailPanel from "./RecipeDetailModal";
import "./HomeDashboard.css";

interface Props {
  showToast: ShowToast;
  onNavigate: (view: AppView) => void;
  onShowTutorial?: () => void;
  onOpenVoxy?: () => void;
  selectedPantryGroup?: number | null | "demo";
}

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
};

const HomeDashboard: FC<Props> = ({ showToast, onNavigate, onShowTutorial, onOpenVoxy, selectedPantryGroup }) => {
  const { user } = useAuth();
  const firstName =
    user?.user_metadata?.first_name ||
    (user?.user_metadata?.full_name || user?.user_metadata?.name || "").toString().split(" ")[0] ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "there";

  const { data: expenseData } = useExpenses({ pageSize: 50, sortBy: "date", sortOrder: "desc" });
  const isDemoPantry = selectedPantryGroup === "demo";
  const pantryGroupId = isDemoPantry ? undefined : (selectedPantryGroup ?? undefined);
  const { data: pantryStats } = usePantryStats(pantryGroupId as number | undefined);
  const { data: apiAllPantryData } = usePantryItems({ group_id: pantryGroupId as number | undefined });
  const allPantryData = isDemoPantry ? DEMO_PANTRY_ITEMS : apiAllPantryData;
  const { data: shoppingItems } = useShoppingList({ group_id: pantryGroupId });
  const { data: cookStats } = useCookStats();
  const now = new Date();
  const { data: budgets } = useBudgets({ month: now.getMonth() + 1, year: now.getFullYear() });
  const preference = localStorage.getItem("voxal_dietary_preference") || "";
  const { data: dailyRecsData, isLoading: recsLoading } = useDailyRecs(preference, pantryGroupId as number | undefined);
  const recipeDetail = useRecipeDetail();
  const cookMeal = useCookMeal();

  // Recipe panel state
  const [selectedMeal, setSelectedMeal] = useState<MealSuggestion | null>(null);
  const [cachedRecipe, setCachedRecipe] = useState<RecipeDetail | null>(null);
  const recipeCacheRef = useRef<Record<string, RecipeDetail>>({});

  const handleMealClick = (meal: MealSuggestion) => {
    setSelectedMeal(meal);
    const cached = recipeCacheRef.current[meal.name];
    if (cached) {
      setCachedRecipe(cached);
      recipeDetail.reset();
      return;
    }
    setCachedRecipe(null);
    recipeDetail.reset();
    recipeDetail.mutate(
      { meal_name: meal.name, meal_description: meal.description || "", available_ingredients: dailyRecsData?.available_ingredients || "" },
      { onSuccess: (result: RecipeDetail) => { recipeCacheRef.current[meal.name] = result; } }
    );
  };

  const closeRecipe = () => { setSelectedMeal(null); setCachedRecipe(null); recipeDetail.reset(); };

  const handleCookMeal = (name: string, ingredients: Array<{ item: string; amount: string }>) => {
    cookMeal.mutate(
      { recipe_name: name, ingredients, group_id: pantryGroupId as number | undefined },
      {
        onSuccess: (result: CookMealResponse) => {
          const msg = result.expiring_items_saved > 0
            ? `Used ${result.expiring_items_saved} expiring item${result.expiring_items_saved > 1 ? "s" : ""} — $${result.estimated_savings} saved!`
            : `Logged! ${result.deducted_count} pantry item${result.deducted_count !== 1 ? "s" : ""} updated.`;
          showToast(msg, "celebration", 5000);
          setTimeout(closeRecipe, 300);
        },
        onError: () => showToast("Couldn't log meal", "error"),
      }
    );
  };

  const weeklyExpenses = useMemo(() => {
    if (!expenseData?.expenses) return { total: 0, count: 0, recent: [] as Expense[] };
    const sow = new Date(); sow.setDate(sow.getDate() - sow.getDay()); sow.setHours(0, 0, 0, 0);
    const w = expenseData.expenses.filter((e) => new Date(e.date) >= sow);
    return { total: w.reduce((s, e) => s + e.amount, 0), count: w.length, recent: expenseData.expenses.slice(0, 4) };
  }, [expenseData]);

  const expirationDays = parseInt(localStorage.getItem("voxal_expiration_days") || "7", 10);
  const expiringItems = useMemo(() => {
    const items = (Array.isArray(allPantryData) ? allPantryData : []) as PantryItem[];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + expirationDays);
    return items
      .filter((i) => { if (!i.expiration_date) return false; const d = new Date(i.expiration_date); return d >= today && d <= cutoff; })
      .map((i) => ({ name: i.name, daysLeft: Math.ceil((new Date(i.expiration_date!).getTime() - today.getTime()) / 86400000) }))
      .sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  }, [allPantryData, expirationDays]);

  const budgetSummary = useMemo(() => {
    if (!budgets || !budgets.length) return null;
    const tot = budgets.reduce((s, b) => s + b.amount, 0);
    const spent = budgets.reduce((s, b) => s + b.actual_spending, 0);
    return { total: tot, spent, remaining: tot - spent, pct: tot > 0 ? Math.min((spent / tot) * 100, 100) : 0 };
  }, [budgets]);

  const streak = useMemo(() => {
    const cookDates = new Set<number>(), expDates = new Set<number>();
    const year = now.getFullYear(), month = now.getMonth();
    if (cookStats?.recent_meals) for (const m of cookStats.recent_meals) { const d = new Date(m.cooked_at); if (d.getFullYear() === year && d.getMonth() === month) cookDates.add(d.getDate()); }
    if (expenseData?.expenses) for (const e of expenseData.expenses) { const d = new Date(e.date); if (d.getFullYear() === year && d.getMonth() === month) expDates.add(d.getDate()); }
    let s = 0;
    for (let d = now.getDate(); d >= 1; d--) { if (cookDates.has(d) || expDates.has(d)) s++; else break; }
    return s;
  }, [now.getFullYear(), now.getMonth(), now.getDate(), cookStats, expenseData]);

  const pantryItems = (Array.isArray(allPantryData) ? allPantryData : []) as PantryItem[];
  const pantryTotal = pantryItems.length;
  const lowCount = pantryStats?.low_stock ?? 0;
  const outCount = pantryStats?.out_of_stock ?? 0;
  const fullCount = pantryTotal - lowCount - outCount;
  const shoppingCount = shoppingItems?.length ?? 0;

  // Mini bar chart data for pantry card (5 bars representing stock distribution)
  const pantryBars = useMemo(() => {
    if (pantryTotal === 0) return [0, 0, 0, 0, 0];
    const total = Math.max(pantryTotal, 1);
    const fPct = fullCount / total;
    const lPct = lowCount / total;
    // Map to 5 bars: each bar height 0-1, colored by stock level
    // More full = taller warm bars, low = shorter, out = empty
    return [
      Math.min(fPct * 1.2, 1),
      Math.min(fPct * 1.0, 0.85),
      Math.min((fPct + lPct * 0.5) * 0.8, 0.7),
      Math.min(lPct > 0 ? 0.5 : fPct * 0.6, 0.55),
      Math.min(lPct > 0.3 ? 0.3 : fPct * 0.4, 0.4),
    ];
  }, [pantryTotal, fullCount, lowCount]);

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } } };

  return (
    <motion.div className="hd" variants={stagger} initial="hidden" animate="show">

      {/* ── Greeting ───────────────────────────────────────── */}
      <motion.div className="hd-top" variants={fadeUp}>
        <h1 className="hd-greeting">{getGreeting()}, {firstName}</h1>
        {onShowTutorial && (
          <button className="hd-icon-btn" onClick={onShowTutorial}><HelpCircle size={16} /></button>
        )}
      </motion.div>

      {/* ── Hero: Budget ───────────────────────────────────── */}
      <motion.button className="hd-hero" onClick={() => onNavigate("budgets")} variants={fadeUp}>
        <span className="hd-hero-amount">
          ${budgetSummary ? budgetSummary.remaining.toFixed(0) : weeklyExpenses.total.toFixed(0)}
        </span>
        <span className="hd-hero-label">
          {budgetSummary ? "Monthly Budget" : "Spent This Week"}
        </span>
        {budgetSummary && (
          <div className="hd-hero-bar">
            <div className="hd-hero-bar-fill" style={{ width: `${budgetSummary.pct}%` }} />
          </div>
        )}
        {budgetSummary && (
          <span className="hd-hero-detail">
            ${budgetSummary.spent.toFixed(0)} spent of ${budgetSummary.total.toFixed(0)}
          </span>
        )}
      </motion.button>

      {/* ── Stat Grid 2x2 ──────────────────────────────────── */}
      <motion.div className="hd-stats" variants={fadeUp}>
        <button className="hd-stat-card" onClick={() => onNavigate("chef")}>
          <div className="hd-stat-top">
            <div>
              <span className="hd-stat-label">Streak</span>
              <span className="hd-stat-num">{streak}</span>
              <span className="hd-stat-sub">days</span>
            </div>
            <Flame size={42} className="hd-stat-icon" />
          </div>
        </button>
        <button className="hd-stat-card hd-stat-card--warm" onClick={() => onNavigate("pantry")}>
          <div className="hd-stat-top">
            <div>
              <span className="hd-stat-label">Pantry</span>
              <span className="hd-stat-num">{pantryTotal}</span>
              <span className="hd-stat-sub">{lowCount > 0 ? `${lowCount} low` : "stocked"}</span>
            </div>
            <div className="hd-mini-bars">
              {pantryBars.map((h, i) => (
                <div key={i} className="hd-mini-bar" style={{ height: `${Math.max(h * 36, 3)}px` }} />
              ))}
            </div>
          </div>
        </button>
        <button className="hd-stat-card hd-stat-card--warm" onClick={() => onNavigate("shopping-list")}>
          <div className="hd-stat-top">
            <div>
              <span className="hd-stat-label">Shopping</span>
              <span className="hd-stat-num">{shoppingCount}</span>
              <span className="hd-stat-sub">items</span>
            </div>
            <div className="hd-mini-bars">
              {[0.9, 0.7, 0.85, 0.5, 0.65].map((h, i) => (
                <div key={i} className="hd-mini-bar" style={{ height: `${shoppingCount > 0 ? Math.max(h * 36, 3) : 3}px`, opacity: shoppingCount > 0 ? 1 : 0.3 }} />
              ))}
            </div>
          </div>
        </button>
        <button className="hd-stat-card" onClick={() => onNavigate("expenses")}>
          <div className="hd-stat-top">
            <div>
              <span className="hd-stat-label">Purchases</span>
              <span className="hd-stat-num">{weeklyExpenses.count}</span>
              <span className="hd-stat-sub">this week</span>
            </div>
            <CreditCard size={38} className="hd-stat-icon" />
          </div>
        </button>
      </motion.div>

      {/* ── Getting Started (first-time user) ────────────────── */}
      {weeklyExpenses.count === 0 && pantryTotal === 0 && !recsLoading && (
        <motion.div className="hd-getting-started" variants={fadeUp}>
          <h2 className="hd-section-title">Get Started</h2>
          <div className="hd-card">
            <button className="hd-row" onClick={onOpenVoxy}>
              <span className="hd-row-text">Log your first expense by voice</span>
              <span className="hd-pill">try it</span>
            </button>
            <button className="hd-row" onClick={() => onNavigate("pantry")}>
              <span className="hd-row-text">Add items to your pantry</span>
              <ChevronRight size={14} className="hd-row-chevron" />
            </button>
            <button className="hd-row" onClick={() => onNavigate("shopping-list")}>
              <span className="hd-row-text">Start a shopping list</span>
              <ChevronRight size={14} className="hd-row-chevron" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Voxy's Picks ───────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <h2 className="hd-section-title">Voxy's Picks</h2>
        <div className="hd-card">
          {recsLoading ? (
            <div className="hd-card-center"><MixingBowlLoader size="sm" /></div>
          ) : dailyRecsData?.meals && dailyRecsData.meals.length > 0 ? (
            dailyRecsData.meals.slice(0, 3).map((meal: MealSuggestion, i: number) => (
              <button key={i} className="hd-row" onClick={() => handleMealClick(meal)}>
                <span className="hd-row-text">{meal.name}</span>
                <span className="hd-row-right">
                  {meal.uses_expiring && <span className="hd-pill">expiring</span>}
                  {meal.time_minutes && <span className="hd-row-dim">{meal.time_minutes}m</span>}
                </span>
              </button>
            ))
          ) : (
            <p className="hd-empty">Add pantry items to get meal ideas</p>
          )}
        </div>
      </motion.div>

      {/* ── Expiring Soon ──────────────────────────────────── */}
      {expiringItems.length > 0 && (
        <motion.div variants={fadeUp}>
          <h2 className="hd-section-title">Expiring Soon</h2>
          <button className="hd-card" onClick={() => onNavigate("chef")}>
            {expiringItems.map((item, i) => (
              <div key={i} className="hd-row hd-row--static">
                <span className="hd-row-text">{item.name}</span>
                <span className={`hd-row-dim${item.daysLeft <= 1 ? " hd-row-dim--urgent" : ""}`}>
                  {item.daysLeft === 0 ? "today" : item.daysLeft === 1 ? "tomorrow" : `${item.daysLeft} days`}
                </span>
              </div>
            ))}
          </button>
        </motion.div>
      )}

      {/* ── Recent Activity ────────────────────────────────── */}
      {weeklyExpenses.recent.length > 0 && (
        <motion.div variants={fadeUp}>
          <h2 className="hd-section-title">Recent Activity</h2>
          <button className="hd-card" onClick={() => onNavigate("expenses")}>
            {weeklyExpenses.recent.map((exp, i) => (
              <div key={exp.id || i} className="hd-row hd-row--static">
                <span className="hd-row-text">{exp.store}</span>
                <span className="hd-row-amount">-${exp.amount.toFixed(2)}</span>
              </div>
            ))}
          </button>
        </motion.div>
      )}

      {/* hidden anchor for tutorial targeting */}
      <div data-tutorial="quick-actions" />

      {/* ── Recipe Detail Slide-out ────────────────────────── */}
      <AnimatePresence>
        {selectedMeal && (
          <>
            <motion.div
              className="hd-recipe-backdrop"
              onClick={closeRecipe}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="hd-recipe-panel"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <RecipeDetailPanel
                recipe={cachedRecipe || (recipeDetail.data as RecipeDetail | undefined)}
                isLoading={!cachedRecipe && recipeDetail.isPending}
                error={!cachedRecipe && recipeDetail.isError}
                onClose={closeRecipe}
                onCookMeal={handleCookMeal}
                isCooking={cookMeal.isPending}
                availableIngredients={dailyRecsData?.available_ingredients?.split(", ").filter(Boolean)}
                showToast={showToast}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default HomeDashboard;
