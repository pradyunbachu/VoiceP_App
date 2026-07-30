import { useMemo, useState, useRef } from "react";
import type { FC } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, HelpCircle, Flame, CreditCard, X } from "lucide-react";
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
import { usePantrySelection } from "../context/PantryContext";
import type { AppView, ShowToast, PantryItem, Expense, MealSuggestion, RecipeDetail, CookMealResponse } from "../types";
import MixingBowlLoader from "./MixingBowlLoader";
import RecipeDetailPanel from "./RecipeDetailModal";
import "./HomeDashboard.css";

interface Props {
  showToast: ShowToast;
  onNavigate: (view: AppView) => void;
  onShowTutorial?: () => void;
  onOpenVoxy?: () => void;
}

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
};

const HomeDashboard: FC<Props> = ({ showToast, onNavigate, onShowTutorial, onOpenVoxy }) => {
  const { user } = useAuth();
  const { selectedGroupId: selectedPantryGroup } = usePantrySelection();
  const firstName =
    user?.user_metadata?.first_name ||
    (user?.user_metadata?.full_name || user?.user_metadata?.name || "").toString().split(" ")[0] ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "there";

  const { data: expenseData } = useExpenses({ pageSize: 50, sortBy: "date", sortOrder: "desc" });
  const pantryGroupId = selectedPantryGroup ?? undefined;
  const { data: pantryStats } = usePantryStats(pantryGroupId);
  const { data: allPantryData } = usePantryItems({ group_id: pantryGroupId });
  const { data: shoppingItems } = useShoppingList({ group_id: pantryGroupId });
  const { data: cookStats } = useCookStats();
  const now = new Date();
  const { data: budgets } = useBudgets({ month: now.getMonth() + 1, year: now.getFullYear() });
  const preference = localStorage.getItem("voxal_dietary_preference") || "";
  const { data: dailyRecsData, isLoading: recsLoading } = useDailyRecs(preference, pantryGroupId);
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

  // Wrap onNavigate so it closes the recipe panel before navigating
  const navigate = (view: AppView) => { closeRecipe(); onNavigate(view); };

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

      {/* ── Hero: What to Cook ──────────────────────────────── */}
      <motion.div className="hd-hero" variants={fadeUp} data-tutorial="hero-meal">
        {recsLoading ? (
          <div className="hd-card-center"><MixingBowlLoader size="sm" /></div>
        ) : dailyRecsData?.meals && dailyRecsData.meals.length > 0 ? (
          <>
            <span className="hd-hero-label">Tonight's Pick</span>
            <button className="hd-hero-meal" onClick={() => handleMealClick(dailyRecsData.meals[0])}>
              <span className="hd-hero-meal-name">{dailyRecsData.meals[0].name}</span>
              {dailyRecsData.meals[0].time_minutes && (
                <span className="hd-hero-meal-time">{dailyRecsData.meals[0].time_minutes} min</span>
              )}
            </button>
            {dailyRecsData.meals[0].ingredients_used && dailyRecsData.meals[0].ingredients_used.length > 0 && (
              <span className="hd-hero-detail">
                Uses {dailyRecsData.meals[0].ingredients_used.slice(0, 4).join(", ")}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="hd-hero-label">What's Cooking?</span>
            <span className="hd-hero-detail">Add items to your pantry to get recipe ideas</span>
          </>
        )}
      </motion.div>

      {/* ── More Recipes ───────────────────────────────────── */}
      {dailyRecsData?.meals && dailyRecsData.meals.length > 1 && (
        <motion.div variants={fadeUp}>
          <h2 className="hd-section-title">More Ideas</h2>
          <div className="hd-card">
            {dailyRecsData.meals.slice(1, 4).map((meal: MealSuggestion, i: number) => (
              <button key={i} className="hd-row" onClick={() => handleMealClick(meal)}>
                <span className="hd-row-text">{meal.name}</span>
                <span className="hd-row-right">
                  {meal.uses_expiring && <span className="hd-pill">expiring</span>}
                  {meal.time_minutes && <span className="hd-row-dim">{meal.time_minutes}m</span>}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Expiring Soon ──────────────────────────────────── */}
      {expiringItems.length > 0 && (
        <motion.div variants={fadeUp}>
          <h2 className="hd-section-title">Use It or Lose It</h2>
          <button className="hd-card" onClick={() => navigate("chef")}>
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

      {/* ── Cooking Stats ──────────────────────────────────── */}
      <motion.div className="hd-stats" variants={fadeUp} data-tutorial="cooking-stats">
        <button className="hd-stat-card" onClick={() => navigate("chef")}>
          <div className="hd-stat-top">
            <div>
              <span className="hd-stat-label">Streak</span>
              <span className="hd-stat-num">{streak}</span>
              <span className="hd-stat-sub">days</span>
            </div>
            <Flame size={42} className="hd-stat-icon" />
          </div>
        </button>
        <button className="hd-stat-card hd-stat-card--warm" onClick={() => navigate("pantry")}>
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
      </motion.div>

      {/* ── Cooked This Week ───────────────────────────────── */}
      {cookStats && cookStats.recent_meals && cookStats.recent_meals.length > 0 && (
        <motion.div variants={fadeUp}>
          <h2 className="hd-section-title">Cooked This Week</h2>
          <div className="hd-card">
            {cookStats.recent_meals.slice(0, 4).map((meal, i) => (
              <div key={i} className="hd-row hd-row--static">
                <span className="hd-row-text">{meal.recipe_name}</span>
                <span className="hd-row-dim">
                  {new Date(meal.cooked_at).toLocaleDateString(undefined, { weekday: "short" })}
                </span>
              </div>
            ))}
            {cookStats.week_estimated_savings > 0 && (
              <div className="hd-card-footer">
                ~${cookStats.week_estimated_savings} saved from waste this week
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Shopping + Spending (secondary) ─────────────────── */}
      <motion.div className="hd-stats" variants={fadeUp}>
        <button className="hd-stat-card hd-stat-card--warm" onClick={() => navigate("shopping-list")}>
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
        <button className="hd-stat-card" onClick={() => navigate("budgets")}>
          <div className="hd-stat-top">
            <div>
              <span className="hd-stat-label">{budgetSummary ? "Budget" : "Spent"}</span>
              <span className="hd-stat-num">
                ${budgetSummary ? Math.abs(budgetSummary.remaining).toFixed(0) : weeklyExpenses.total.toFixed(0)}
              </span>
              <span className="hd-stat-sub">
                {budgetSummary ? (budgetSummary.remaining >= 0 ? "left" : "over") : "this week"}
              </span>
            </div>
            <CreditCard size={38} className="hd-stat-icon" />
          </div>
        </button>
      </motion.div>

      {/* ── Getting Started (first-time user) ────────────────── */}
      {weeklyExpenses.count === 0 && pantryTotal === 0 && !recsLoading && (
        <motion.div variants={fadeUp}>
          <h2 className="hd-section-title">Get Started</h2>
          <div className="hd-card">
            <button className="hd-row" onClick={onOpenVoxy}>
              <span className="hd-row-text">Tell Voxy what's in your kitchen</span>
              <span className="hd-pill">try it</span>
            </button>
            <button className="hd-row" onClick={() => navigate("pantry")}>
              <span className="hd-row-text">Add items to your pantry</span>
              <ChevronRight size={14} className="hd-row-chevron" />
            </button>
            <button className="hd-row" onClick={() => navigate("chef")}>
              <span className="hd-row-text">Find a recipe to cook</span>
              <ChevronRight size={14} className="hd-row-chevron" />
            </button>
          </div>
        </motion.div>
      )}


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
