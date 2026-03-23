import { useMemo, useState } from "react";
import type { FC } from "react";
import { motion } from "framer-motion";
import {
  DollarSign,
  AlertTriangle,
  ShoppingCart,
  Clock,
  Package,
  ChevronRight,
  ChefHat,
  Wallet,
  Mic,
  ListPlus,
  HelpCircle,
  UtensilsCrossed,
  CalendarCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  useExpenses,
  usePantryStats,
  usePantryItems,
  useShoppingList,
  useCookStats,
  useBudgets,
  useDailyRecs,
} from "../hooks";
import { DEMO_PANTRY_ITEMS } from "../constants/demoPantry";
import type { AppView, ShowToast, PantryItem, Expense, MealSuggestion } from "../types";
import MixingBowlLoader from "./MixingBowlLoader";
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
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HomeDashboard: FC<Props> = ({ onNavigate, onShowTutorial, onOpenVoxy, selectedPantryGroup }) => {
  const { user } = useAuth();
  const firstName =
    user?.user_metadata?.first_name ||
    (user?.user_metadata?.full_name || user?.user_metadata?.name || "")
      .toString()
      .split(" ")[0] ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "there";

  const { data: expenseData, isLoading: expensesLoading } = useExpenses({ pageSize: 50, sortBy: "date", sortOrder: "desc" });
  const isDemoPantry = selectedPantryGroup === "demo";
  const pantryGroupId = isDemoPantry ? undefined : (selectedPantryGroup ?? undefined);
  const { data: pantryStats, isLoading: statsLoading } = usePantryStats(pantryGroupId as number | undefined);
  const { data: apiLowStockData, isLoading: lowStockLoading } = usePantryItems({ stock_status: "low", group_id: pantryGroupId as number | undefined });
  const { data: apiAllPantryData, isLoading: pantryLoading } = usePantryItems({ group_id: pantryGroupId as number | undefined });
  const lowStockData = isDemoPantry ? DEMO_PANTRY_ITEMS.filter(i => i.stock_status === "low") : apiLowStockData;
  const allPantryData = isDemoPantry ? DEMO_PANTRY_ITEMS : apiAllPantryData;
  const { data: shoppingItems, isLoading: shoppingLoading } = useShoppingList({ group_id: pantryGroupId });
  const { data: cookStats, isLoading: cookStatsLoading } = useCookStats();
  const now = new Date();
  const { data: budgets } = useBudgets({ month: now.getMonth() + 1, year: now.getFullYear() });
  const preference = localStorage.getItem("voxal_dietary_preference") || "";
  const { data: dailyRecsData, isLoading: recsLoading } = useDailyRecs(preference, pantryGroupId as number | undefined);

  const weeklyExpenses = useMemo(() => {
    if (!expenseData?.expenses) return { total: 0, count: 0 };
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weekExpenses = expenseData.expenses.filter((e) => new Date(e.date) >= startOfWeek);
    return { total: weekExpenses.reduce((sum, e) => sum + e.amount, 0), count: weekExpenses.length };
  }, [expenseData]);

  const dailySpending = useMemo(() => {
    if (!expenseData?.expenses) return new Array(7).fill(0) as number[];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const buckets = new Array(7).fill(0) as number[];
    for (const e of expenseData.expenses) {
      const d = new Date(e.date);
      if (d >= startOfWeek) buckets[d.getDay()] += e.amount;
    }
    return buckets;
  }, [expenseData]);

  const expirationDays = parseInt(localStorage.getItem("voxal_expiration_days") || "7", 10);
  const expiringItems = useMemo(() => {
    const items = (Array.isArray(allPantryData) ? allPantryData : []) as PantryItem[];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + expirationDays);
    return items
      .filter((item) => { if (!item.expiration_date) return false; const d = new Date(item.expiration_date); return d >= today && d <= cutoff; })
      .map((item) => { const d = new Date(item.expiration_date!); return { name: item.name, daysLeft: Math.ceil((d.getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000) }; })
      .sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 5);
  }, [allPantryData, expirationDays]);

  const lowStockItems = useMemo(() => ((Array.isArray(lowStockData) ? lowStockData : []) as PantryItem[]).slice(0, 5), [lowStockData]);

  const budgetSummary = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;
    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.actual_spending, 0);
    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent, percentUsed: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0 };
  }, [budgets]);

  const activityCalendar = useMemo(() => {
    const year = now.getFullYear(), month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const cookDates = new Set<number>(), expenseDates = new Set<number>();
    if (cookStats?.recent_meals) for (const m of cookStats.recent_meals) { const d = new Date(m.cooked_at); if (d.getFullYear() === year && d.getMonth() === month) cookDates.add(d.getDate()); }
    if (expenseData?.expenses) for (const e of expenseData.expenses) { const d = new Date(e.date); if (d.getFullYear() === year && d.getMonth() === month) expenseDates.add(d.getDate()); }
    const cells: Array<{ day: number | null; isToday: boolean; isPast: boolean; activity: number }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) cells.push({ day: null, isToday: false, isPast: false, activity: 0 });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, isToday: d === now.getDate(), isPast: d < now.getDate(), activity: (cookDates.has(d) ? 1 : 0) + (expenseDates.has(d) ? 1 : 0) });
    while (cells.length % 7 !== 0) cells.push({ day: null, isToday: false, isPast: false, activity: 0 });
    let currentStreak = 0;
    for (let d = now.getDate(); d >= 1; d--) { if (cookDates.has(d) || expenseDates.has(d)) currentStreak++; else break; }
    return { cells, mealsCooked: cookDates.size, shoppingDays: expenseDates.size, activeDays: new Set([...cookDates, ...expenseDates]).size, currentStreak, daysInMonth };
  }, [now.getFullYear(), now.getMonth(), now.getDate(), cookStats, expenseData]);

  const [activityView, setActivityView] = useState<"week" | "month">("week");

  const weekCells = useMemo(() => {
    const todayDate = now.getDate(), todayDow = now.getDay(), startDay = todayDate - todayDow;
    return Array.from({ length: 7 }, (_, i) => {
      const d = startDay + i;
      if (d < 1 || d > activityCalendar.daysInMonth) return { day: null, isToday: false, isPast: false, activity: 0 };
      return activityCalendar.cells.find((c) => c.day === d) ?? { day: d, isToday: false, isPast: false, activity: 0 };
    });
  }, [activityCalendar, now.getDate(), now.getDay()]);

  const isLoading = expensesLoading || statsLoading || lowStockLoading || pantryLoading || shoppingLoading || cookStatsLoading;
  const maxSpend = Math.max(...dailySpending, 1);
  const todayIdx = now.getDay();

  const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const fadeUp = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } } };

  return (
    <motion.div className="home-dashboard" variants={stagger} initial="hidden" animate="show">

      {/* ── Greeting ───────────────────────────────────────────── */}
      <motion.div className="home-greeting" variants={fadeUp}>
        <div className="home-greeting-row">
          <div>
            <h1>{getGreeting()}, {firstName}</h1>
            <p className="home-date">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          {onShowTutorial && (
            <button className="home-tutorial-btn" onClick={onShowTutorial} title="Replay tutorial">
              <HelpCircle size={15} />
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Quick Actions ──────────────────────────────────────── */}
      <motion.div className="home-quick-actions" data-tutorial="quick-actions" variants={fadeUp}>
        <button className="home-quick-btn" onClick={() => onOpenVoxy?.()}>Voice</button>
        <button className="home-quick-btn" onClick={() => onNavigate("chef")}>Cook</button>
        <button className="home-quick-btn" onClick={() => onNavigate("pantry")}>Pantry</button>
        <button className="home-quick-btn" onClick={() => onNavigate("shopping-list")}>List</button>
      </motion.div>

      {/* ── Voxy's Picks ───────────────────────────────────────── */}
      <motion.div className="home-section" variants={fadeUp}>
        <div className="home-section-header">
          <h2>Voxy's Picks</h2>
          {cookStats && cookStats.week_meals_cooked > 0 && (
            <span className="home-section-aside">
              {cookStats.week_meals_cooked} cooked this week
              {cookStats.week_estimated_savings > 0 && <> &middot; ~${cookStats.week_estimated_savings} saved</>}
            </span>
          )}
        </div>
        {recsLoading ? (
          <div className="home-section-loading"><MixingBowlLoader size="sm" /></div>
        ) : dailyRecsData?.meals && dailyRecsData.meals.length > 0 ? (
          <div className="home-picks-list">
            {dailyRecsData.meals.slice(0, 3).map((meal: MealSuggestion, i: number) => (
              <button key={i} className="home-picks-row" onClick={() => onNavigate("chef")}>
                <span className="home-picks-name">{meal.name}</span>
                <span className="home-picks-meta">
                  {meal.uses_expiring && <span className="home-picks-tag">expiring</span>}
                  {meal.time_minutes && <span>{meal.time_minutes}m</span>}
                  <ChevronRight size={14} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="home-empty-hint">Add items to your pantry to get meal ideas</p>
        )}
      </motion.div>

      {/* ── Expiring Soon ──────────────────────────────────────── */}
      {expiringItems.length > 0 && (
        <motion.button className="home-expiring" onClick={() => onNavigate("chef")} variants={fadeUp}>
          <div className="home-expiring-row">
            <span className="home-expiring-label">Expiring soon</span>
            <span className="home-expiring-count">{expiringItems.length}</span>
          </div>
          <div className="home-expiring-items">
            {expiringItems.map((item, i) => (
              <span key={i} className="home-expiring-item">
                {item.name}
                <span className={`home-expiring-days${item.daysLeft <= 1 ? " urgent" : ""}`}>
                  {item.daysLeft === 0 ? "today" : `${item.daysLeft}d`}
                </span>
              </span>
            ))}
          </div>
        </motion.button>
      )}

      {/* ── Stats Row ──────────────────────────────────────────── */}
      <motion.div className="home-stats-row" variants={fadeUp}>
        <button className="home-stat-card" onClick={() => onNavigate("chef")}>
          <span className="home-stat-number">{activityCalendar.currentStreak}</span>
          <span className="home-stat-desc">day streak</span>
        </button>
        <button className="home-stat-card" onClick={() => onNavigate("budgets")}>
          {budgetSummary ? (
            <>
              <span className={`home-stat-number${budgetSummary.remaining < 0 ? " over" : ""}`}>
                ${Math.abs(budgetSummary.remaining).toFixed(0)}
              </span>
              <span className="home-stat-desc">
                {budgetSummary.remaining >= 0 ? "left this month" : "over budget"}
              </span>
              <div className="home-stat-bar">
                <div className={`home-stat-bar-fill${budgetSummary.percentUsed > 100 ? " over" : budgetSummary.percentUsed > 80 ? " warn" : ""}`} style={{ width: `${Math.min(budgetSummary.percentUsed, 100)}%` }} />
              </div>
            </>
          ) : (
            <>
              <span className="home-stat-number">${weeklyExpenses.total.toFixed(0)}</span>
              <span className="home-stat-desc">spent this week</span>
            </>
          )}
        </button>
        <button className="home-stat-card" onClick={() => onNavigate("expenses")}>
          <span className="home-stat-number">{weeklyExpenses.count}</span>
          <span className="home-stat-desc">purchases</span>
        </button>
      </motion.div>

      {/* ── Shopping List ──────────────────────────────────────── */}
      <motion.button className="home-section home-section--clickable" onClick={() => onNavigate("shopping-list")} variants={fadeUp}>
        <div className="home-section-header">
          <h2>Shopping List</h2>
          {shoppingItems && shoppingItems.length > 0 && (
            <span className="home-section-aside">{shoppingItems.length} item{shoppingItems.length !== 1 ? "s" : ""}</span>
          )}
          <ChevronRight size={14} className="home-section-arrow" />
        </div>
        {isLoading ? (
          <MixingBowlLoader size="sm" />
        ) : shoppingItems && shoppingItems.length > 0 ? (
          <div className="home-chip-list">
            {shoppingItems.slice(0, 10).map((item) => (
              <span key={item.id} className="home-chip">{item.name}</span>
            ))}
            {shoppingItems.length > 10 && <span className="home-chip home-chip--more">+{shoppingItems.length - 10}</span>}
          </div>
        ) : (
          <p className="home-empty-hint">Nothing on the list</p>
        )}
      </motion.button>

      {/* ── Spending ───────────────────────────────────────────── */}
      <motion.button className="home-section home-section--clickable" onClick={() => onNavigate("expenses")} data-tutorial="expenses-card" variants={fadeUp}>
        <div className="home-section-header">
          <h2>This Week</h2>
          <span className="home-section-aside">${weeklyExpenses.total.toFixed(2)}</span>
          <ChevronRight size={14} className="home-section-arrow" />
        </div>
        {isLoading ? (
          <MixingBowlLoader size="sm" />
        ) : (
          <div className="home-sparkline">
            {dailySpending.map((amount, i) => (
              <div key={i} className="home-sparkline-col">
                <div
                  className={`home-sparkline-bar${i === todayIdx ? " today" : ""}${amount === 0 ? " empty" : ""}`}
                  style={{ height: `${Math.max((amount / maxSpend) * 48, 2)}px` }}
                />
                <span className={`home-sparkline-label${i === todayIdx ? " today" : ""}`}>{DAY_LABELS[i]}</span>
              </div>
            ))}
          </div>
        )}
      </motion.button>

      {/* ── Bottom: Pantry + Activity ──────────────────────────── */}
      <motion.div className="home-bottom-grid" variants={fadeUp}>
        <button className="home-section home-section--clickable" onClick={() => onNavigate("pantry")} data-tutorial="pantry-card">
          <div className="home-section-header">
            <h2>Pantry</h2>
            <span className="home-section-aside">
              {pantryStats?.low_stock ?? 0} low
            </span>
            <ChevronRight size={14} className="home-section-arrow" />
          </div>
          {isLoading ? (
            <MixingBowlLoader size="sm" />
          ) : lowStockItems.length > 0 ? (
            <ul className="home-plain-list">
              {lowStockItems.map((item) => <li key={item.id}>{item.name}</li>)}
            </ul>
          ) : (
            <p className="home-empty-hint">All stocked up</p>
          )}
        </button>

        <div className="home-section">
          <div className="home-section-header">
            <h2>{now.toLocaleDateString("en-US", { month: "short" })}</h2>
            <div className="home-activity-toggle">
              <button className={`home-toggle-btn${activityView === "week" ? " active" : ""}`} onClick={() => setActivityView("week")}>W</button>
              <button className={`home-toggle-btn${activityView === "month" ? " active" : ""}`} onClick={() => setActivityView("month")}>M</button>
            </div>
          </div>

          {activityView === "week" && (
            <div className="home-week-grid">
              {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => {
                const cell = weekCells[i];
                return (
                  <div key={i} className="home-week-col">
                    <span className="home-week-label">{label}</span>
                    <span className={["home-week-day", cell.day === null && "empty", cell.isToday && "today", cell.day !== null && cell.activity === 0 && cell.isPast && "inactive", cell.activity === 1 && "low", cell.activity === 2 && "high"].filter(Boolean).join(" ")}>
                      {cell.day ?? ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {activityView === "month" && (
            <div className="home-month-grid">
              {["S", "M", "T", "W", "T", "F", "S"].map((l, i) => <span key={`h-${i}`} className="home-month-header">{l}</span>)}
              {activityCalendar.cells.map((cell, i) => (
                <span key={i} className={["home-month-day", cell.day === null && "empty", cell.isToday && "today", cell.day !== null && cell.activity === 0 && cell.isPast && "inactive", cell.activity === 1 && "low", cell.activity === 2 && "high"].filter(Boolean).join(" ")}>
                  {cell.day ?? ""}
                </span>
              ))}
            </div>
          )}

          <div className="home-activity-summary">
            <span>{activityCalendar.mealsCooked} meals</span>
            <span>{activityCalendar.shoppingDays} shop</span>
            <span>{activityCalendar.activeDays} active</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default HomeDashboard;
