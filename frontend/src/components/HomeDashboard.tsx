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
} from "../hooks";
import { DEMO_PANTRY_ITEMS } from "../constants/demoPantry";
import type { AppView, ShowToast, PantryItem, Expense } from "../types";
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

  // ── Data hooks ──────────────────────────────────────────────────────
  const { data: expenseData, isLoading: expensesLoading } = useExpenses({
    pageSize: 50,
    sortBy: "date",
    sortOrder: "desc",
  });
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
  const { data: budgets } = useBudgets({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  });

  // ── Derived data ────────────────────────────────────────────────────

  // Weekly expenses
  const weeklyExpenses = useMemo(() => {
    if (!expenseData?.expenses) return { total: 0, count: 0, recent: [] as Expense[] };
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weekExpenses = expenseData.expenses.filter((e) => new Date(e.date) >= startOfWeek);
    const total = weekExpenses.reduce((sum, e) => sum + e.amount, 0);
    return { total, count: weekExpenses.length, recent: expenseData.expenses.slice(0, 3) };
  }, [expenseData]);

  // Daily spending breakdown for sparkline (Sun–Sat)
  const dailySpending = useMemo(() => {
    if (!expenseData?.expenses) return new Array(7).fill(0) as number[];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const buckets = new Array(7).fill(0) as number[];
    for (const e of expenseData.expenses) {
      const d = new Date(e.date);
      if (d >= startOfWeek) {
        buckets[d.getDay()] += e.amount;
      }
    }
    return buckets;
  }, [expenseData]);

  // Expiring items
  const expirationDays = parseInt(localStorage.getItem("voxal_expiration_days") || "7", 10);
  const expiringItems = useMemo(() => {
    const items = (Array.isArray(allPantryData) ? allPantryData : []) as PantryItem[];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + expirationDays);

    return items
      .filter((item) => {
        if (!item.expiration_date) return false;
        const expDate = new Date(item.expiration_date);
        return expDate >= today && expDate <= cutoff;
      })
      .map((item) => {
        const expDate = new Date(item.expiration_date!);
        const diffTime = expDate.getTime() - today.getTime();
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return { name: item.name, daysLeft };
      })
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  }, [allPantryData, expirationDays]);

  const lowStockItems = useMemo(() => {
    const items = (Array.isArray(lowStockData) ? lowStockData : []) as PantryItem[];
    return items.slice(0, 5);
  }, [lowStockData]);

  // Total budget for the month vs total spent
  const budgetSummary = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;
    const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.actual_spending, 0);
    const remaining = totalBudget - totalSpent;
    const percentUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    return { totalBudget, totalSpent, remaining, percentUsed };
  }, [budgets]);

  // Recipe nudge — suggest cooking with the soonest-expiring items
  const recipeNudge = useMemo(() => {
    if (expiringItems.length === 0) return null;
    const urgent = expiringItems.filter((i) => i.daysLeft <= 2);
    if (urgent.length === 0) return null;
    const names = urgent.slice(0, 3).map((i) => i.name);
    return {
      items: names,
      label:
        names.length === 1
          ? `Use your ${names[0]} before it expires`
          : `Use your ${names.slice(0, -1).join(", ")} & ${names[names.length - 1]} before they expire`,
    };
  }, [expiringItems]);

  // ── Monthly activity tracker ───────────────────────────────
  const activityCalendar = useMemo(() => {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const cookDates = new Set<number>();
    if (cookStats?.recent_meals) {
      for (const meal of cookStats.recent_meals) {
        const d = new Date(meal.cooked_at);
        if (d.getFullYear() === year && d.getMonth() === month) {
          cookDates.add(d.getDate());
        }
      }
    }

    const expenseDates = new Set<number>();
    if (expenseData?.expenses) {
      for (const e of expenseData.expenses) {
        const d = new Date(e.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
          expenseDates.add(d.getDate());
        }
      }
    }

    const cells: Array<{
      day: number | null;
      cooked: boolean;
      expense: boolean;
      isToday: boolean;
      isPast: boolean;
      activity: number;
    }> = [];

    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ day: null, cooked: false, expense: false, isToday: false, isPast: false, activity: 0 });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const cooked = cookDates.has(d);
      const expense = expenseDates.has(d);
      cells.push({
        day: d,
        cooked,
        expense,
        isToday: d === now.getDate(),
        isPast: d < now.getDate(),
        activity: (cooked ? 1 : 0) + (expense ? 1 : 0),
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push({ day: null, cooked: false, expense: false, isToday: false, isPast: false, activity: 0 });
    }

    // Streak: consecutive days with cooking activity ending at today
    let currentStreak = 0;
    for (let d = now.getDate(); d >= 1; d--) {
      if (cookDates.has(d) || expenseDates.has(d)) {
        currentStreak++;
      } else {
        break;
      }
    }

    return {
      cells,
      mealsCooked: cookDates.size,
      shoppingDays: expenseDates.size,
      activeDays: new Set([...cookDates, ...expenseDates]).size,
      currentStreak,
      daysInMonth,
    };
  }, [now.getFullYear(), now.getMonth(), now.getDate(), cookStats, expenseData]);

  const [activityView, setActivityView] = useState<"week" | "month">("week");

  // Current week cells (Sun–Sat containing today)
  const weekCells = useMemo(() => {
    const todayDate = now.getDate();
    const todayDow = now.getDay();
    const startDay = todayDate - todayDow;

    return Array.from({ length: 7 }, (_, i) => {
      const d = startDay + i;
      if (d < 1 || d > activityCalendar.daysInMonth) {
        return { day: null, cooked: false, expense: false, isToday: false, isPast: false, activity: 0 };
      }
      const match = activityCalendar.cells.find((c) => c.day === d);
      return match ?? { day: d, cooked: false, expense: false, isToday: false, isPast: false, activity: 0 };
    });
  }, [activityCalendar, now.getDate(), now.getDay()]);

  const isLoading =
    expensesLoading || statsLoading || lowStockLoading || pantryLoading || shoppingLoading || cookStatsLoading;

  // ── Sparkline chart ─────────────────────────────────────────────────
  const maxSpend = Math.max(...dailySpending, 1);
  const todayIdx = now.getDay();

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
  };

  return (
    <motion.div
      className="home-dashboard"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Greeting ──────────────────────────────────────── */}
      <motion.div className="home-greeting" variants={fadeUp}>
        <div className="home-greeting-row">
          <div>
            <h1>
              {getGreeting()}, {firstName}
            </h1>
            <p className="home-date">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="home-greeting-actions">
            {onShowTutorial && (
              <button className="home-tutorial-btn" onClick={onShowTutorial} title="Replay tutorial">
                <HelpCircle size={15} />
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Hero Stats: Streak + Spending vs Budget ──────── */}
      <motion.div className="home-hero-stats" variants={fadeUp}>
        {/* Streak */}
        <div className="home-hero-card home-hero-card--streak" onClick={() => onNavigate("chef")}>
          <div className="home-hero-icon home-hero-icon--streak">
            {activityCalendar.currentStreak >= 3 ? <Zap size={20} /> : <Star size={20} />}
          </div>
          <div className="home-hero-value">
            {activityCalendar.currentStreak}
          </div>
          <div className="home-hero-label">
            {activityCalendar.currentStreak === 1 ? "day streak" : "day streak"}
          </div>
          {activityCalendar.currentStreak >= 3 && (
            <div className="home-hero-badge">On a roll!</div>
          )}
          {activityCalendar.currentStreak === 0 && (
            <div className="home-hero-badge home-hero-badge--start">Cook today!</div>
          )}
        </div>

        {/* Spending vs Budget */}
        <button className="home-hero-card home-hero-card--spending" onClick={() => onNavigate("budgets")}>
          {budgetSummary ? (
            <>
              <div className="home-hero-icon home-hero-icon--spending">
                {budgetSummary.remaining >= 0 ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
              </div>
              <div className={`home-hero-value${budgetSummary.remaining < 0 ? " over" : ""}`}>
                ${Math.abs(budgetSummary.remaining).toFixed(0)}
              </div>
              <div className="home-hero-label">
                {budgetSummary.remaining >= 0 ? "left this month" : "over budget"}
              </div>
              <div className="home-hero-budget-bar">
                <div
                  className={`home-hero-budget-fill${budgetSummary.percentUsed > 100 ? " over" : budgetSummary.percentUsed > 80 ? " warn" : ""}`}
                  style={{ width: `${Math.min(budgetSummary.percentUsed, 100)}%` }}
                />
              </div>
              <div className="home-hero-budget-detail">
                ${budgetSummary.totalSpent.toFixed(0)} / ${budgetSummary.totalBudget.toFixed(0)}
              </div>
            </>
          ) : (
            <>
              <div className="home-hero-icon home-hero-icon--spending">
                <Wallet size={20} />
              </div>
              <div className="home-hero-value">${weeklyExpenses.total.toFixed(0)}</div>
              <div className="home-hero-label">spent this week</div>
            </>
          )}
        </button>
      </motion.div>

      {/* ── "Use It or Lose It" — Expiring Soon ──────────── */}
      {expiringItems.length > 0 && (
        <motion.div className="home-use-it" variants={fadeUp}>
          <div className="home-use-it-header">
            <Clock size={16} />
            <h2>Use it or lose it</h2>
            <span className="home-use-it-count">{expiringItems.length} item{expiringItems.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="home-use-it-items">
            {expiringItems.map((item, i) => (
              <div key={i} className={`home-use-it-item${item.daysLeft <= 1 ? " urgent" : ""}`}>
                <span className="home-use-it-name">{item.name}</span>
                <span className={`home-use-it-days${item.daysLeft <= 1 ? " urgent" : item.daysLeft <= 3 ? " warn" : ""}`}>
                  {item.daysLeft === 0 ? "Today!" : item.daysLeft === 1 ? "Tomorrow" : `${item.daysLeft} days`}
                </span>
              </div>
            ))}
          </div>
          <button className="home-use-it-cta" onClick={() => onNavigate("chef")}>
            <ChefHat size={16} />
            <span>{recipeNudge ? "Cook with these ingredients" : "Find a recipe"}</span>
            <ChevronRight size={14} />
          </button>
        </motion.div>
      )}

      {/* ── Shopping List Preview ─────────────────────────── */}
      <motion.button className="home-shopping-preview" onClick={() => onNavigate("shopping-list")} variants={fadeUp}>
        <div className="home-shopping-preview-header">
          <div className="home-shopping-preview-left">
            <ShoppingCart size={16} />
            <h2>Shopping List</h2>
          </div>
          {shoppingItems && shoppingItems.length > 0 && (
            <span className="home-shopping-preview-count">
              {shoppingItems.length} item{shoppingItems.length !== 1 ? "s" : ""}
            </span>
          )}
          <ChevronRight size={14} className="home-card-arrow" />
        </div>
        <div className="home-shopping-preview-body">
          {isLoading ? (
            <MixingBowlLoader size="sm" />
          ) : shoppingItems && shoppingItems.length > 0 ? (
            <div className="home-shopping-chips">
              {shoppingItems.slice(0, 8).map((item) => (
                <span key={item.id} className="home-shopping-chip">
                  {item.name}
                </span>
              ))}
              {shoppingItems.length > 8 && (
                <span className="home-shopping-chip home-shopping-chip--more">
                  +{shoppingItems.length - 8} more
                </span>
              )}
            </div>
          ) : (
            <p className="home-empty-hint">Your shopping list is empty - you're all set!</p>
          )}
        </div>
      </motion.button>

      {/* ── Quick Actions ──────────────────────────────────── */}
      <motion.div className="home-quick-actions" data-tutorial="quick-actions" variants={fadeUp}>
        <button className="home-quick-btn" onClick={() => onNavigate("pantry")}>
          <Package size={16} />
          <span>Pantry</span>
        </button>
        <button className="home-quick-btn" onClick={() => onNavigate("shopping-list")}>
          <ListPlus size={16} />
          <span>Add to list</span>
        </button>
        <button className="home-quick-btn" onClick={() => onNavigate("chef")}>
          <ChefHat size={16} />
          <span>Cook</span>
        </button>
        <button className="home-quick-btn" onClick={() => onOpenVoxy?.()}>
          <Mic size={16} />
          <span>Voice</span>
        </button>
      </motion.div>

      {/* ── Weekly Spending Sparkline ─────────────────────── */}
      <motion.button className="home-card home-card--expenses" onClick={() => onNavigate("expenses")} data-tutorial="expenses-card" variants={fadeUp}>
        <div className="home-card-header">
          <div className="home-card-icon home-card-icon--expenses">
            <DollarSign size={16} />
          </div>
          <div className="home-card-title">
            <h3>This Week's Spending</h3>
            <ChevronRight size={14} className="home-card-arrow" />
          </div>
        </div>
        <div className="home-card-body">
          {isLoading ? (
            <MixingBowlLoader size="sm" />
          ) : (
            <>
              <div className="home-stat-row">
                <span className="home-stat-value">${weeklyExpenses.total.toFixed(2)}</span>
                <span className="home-stat-label">
                  {weeklyExpenses.count} purchase{weeklyExpenses.count !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="home-sparkline">
                {dailySpending.map((amount, i) => (
                  <div key={i} className="home-sparkline-col">
                    <div
                      className={`home-sparkline-bar${i === todayIdx ? " today" : ""}${amount === 0 ? " empty" : ""}`}
                      style={{ height: `${Math.max((amount / maxSpend) * 40, 2)}px` }}
                    />
                    <span className={`home-sparkline-label${i === todayIdx ? " today" : ""}`}>
                      {DAY_LABELS[i]}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.button>

      {/* ── Activity ──────────────────────────────────────────── */}
      <motion.div className="home-activity-tracker" variants={fadeUp}>
        <div className="home-activity-header">
          <div className="home-activity-left">
            <span className="home-activity-month">
              {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            {activityCalendar.currentStreak > 0 && (
              <span className="home-activity-streak">
                <Star size={12} />
                {activityCalendar.currentStreak}
              </span>
            )}
          </div>
          <div className="home-activity-toggle">
            <button
              className={`home-activity-toggle-btn${activityView === "week" ? " active" : ""}`}
              onClick={() => setActivityView("week")}
            >
              Week
            </button>
            <button
              className={`home-activity-toggle-btn${activityView === "month" ? " active" : ""}`}
              onClick={() => setActivityView("month")}
            >
              Month
            </button>
          </div>
        </div>

        {activityView === "week" && (
          <div className="home-activity-week">
            {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => {
              const cell = weekCells[i];
              return (
                <div key={i} className="home-week-col">
                  <span className="home-week-label">{label}</span>
                  <span
                    className={[
                      "home-week-day",
                      cell.day === null && "home-week-day--empty",
                      cell.isToday && "home-week-day--today",
                      cell.day !== null && cell.activity === 0 && cell.isPast && "home-week-day--inactive",
                      cell.activity === 1 && "home-week-day--low",
                      cell.activity === 2 && "home-week-day--high",
                    ].filter(Boolean).join(" ")}
                  >
                    {cell.day ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {activityView === "month" && (
          <div className="home-activity-cal">
            {["S", "M", "T", "W", "T", "F", "S"].map((label, i) => (
              <span key={`hdr-${i}`} className="home-cal-header">{label}</span>
            ))}
            {activityCalendar.cells.map((cell, i) => (
              <span
                key={i}
                className={[
                  "home-cal-day",
                  cell.day === null && "home-cal-day--empty",
                  cell.isToday && "home-cal-day--today",
                  cell.day !== null && cell.activity === 0 && cell.isPast && "home-cal-day--inactive",
                  cell.activity === 1 && "home-cal-day--low",
                  cell.activity === 2 && "home-cal-day--high",
                ].filter(Boolean).join(" ")}
              >
                {cell.day ?? ""}
              </span>
            ))}
          </div>
        )}

        <div className="home-activity-stats">
          <div className="home-activity-stat">
            <UtensilsCrossed size={14} />
            <span className="home-activity-stat-val">{activityCalendar.mealsCooked}</span>
            <span className="home-activity-stat-lbl">meals</span>
          </div>
          <div className="home-activity-stat">
            <ShoppingCart size={14} />
            <span className="home-activity-stat-val">{activityCalendar.shoppingDays}</span>
            <span className="home-activity-stat-lbl">shop days</span>
          </div>
          <div className="home-activity-stat">
            <CalendarCheck size={14} />
            <span className="home-activity-stat-val">{activityCalendar.activeDays}</span>
            <span className="home-activity-stat-lbl">active days</span>
          </div>
        </div>
      </motion.div>

      {/* ── Two-column: Pantry Alerts + Meals ─────────────── */}
      <motion.div className="home-grid" variants={fadeUp}>
        {/* Pantry Alerts Card */}
        <button className="home-card home-card--pantry" onClick={() => onNavigate("pantry")} data-tutorial="pantry-card">
          <div className="home-card-header">
            <div className="home-card-icon home-card-icon--pantry">
              <Package size={16} />
            </div>
            <div className="home-card-title">
              <h3>Pantry Alerts</h3>
              <ChevronRight size={14} className="home-card-arrow" />
            </div>
          </div>
          <div className="home-card-body">
            {isLoading ? (
              <MixingBowlLoader size="sm" />
            ) : (
              <>
                <div className="home-alert-section">
                  <div className="home-alert-header">
                    <AlertTriangle size={14} />
                    <span>Low Stock ({pantryStats?.low_stock ?? 0})</span>
                  </div>
                  {lowStockItems.length > 0 ? (
                    <ul className="home-alert-list">
                      {lowStockItems.map((item) => (
                        <li key={item.id}>{item.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="home-empty-hint">All stocked up</p>
                  )}
                </div>
              </>
            )}
          </div>
        </button>

        {/* Meals This Week */}
        <div className="home-card home-card--meals-compact">
          <div className="home-card-header">
            <div className="home-card-icon home-card-icon--meals">
              <ChefHat size={16} />
            </div>
            <div className="home-card-title">
              <h3>
                Meals{" "}
                {cookStats && cookStats.week_meals_cooked > 0 && (
                  <span className="home-card-count">
                    ({cookStats.week_meals_cooked})
                  </span>
                )}
              </h3>
            </div>
          </div>
          <div className="home-card-body">
            {isLoading ? (
              <MixingBowlLoader size="sm" />
            ) : cookStats && cookStats.recent_meals.length > 0 ? (
              <>
                <div className="home-meals-list">
                  {cookStats.recent_meals.slice(0, 3).map((meal, i) => {
                    const date = new Date(meal.cooked_at);
                    const dayLabel = date.toLocaleDateString(undefined, { weekday: "short" });
                    return (
                      <div key={i} className="home-meal-item">
                        <span className="home-meal-name">{meal.recipe_name}</span>
                        <span className="home-meal-day">{dayLabel}</span>
                      </div>
                    );
                  })}
                </div>
                {cookStats.week_estimated_savings > 0 && (
                  <div className="home-meals-savings">
                    Saved ~${cookStats.week_estimated_savings} by using expiring items
                  </div>
                )}
              </>
            ) : (
              <p className="home-empty-hint">No meals cooked yet this week</p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default HomeDashboard;
