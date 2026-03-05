import { useMemo } from "react";
import type { FC } from "react";
import {
  DollarSign,
  AlertTriangle,
  ShoppingCart,
  Clock,
  Package,
  ChevronRight,
  ChefHat,
  Flame,
  Wallet,
  Mic,
  Camera,
  ListPlus,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  useExpenses,
  usePantryStats,
  usePantryItems,
  useShoppingList,
  useCookStats,
  useStreak,
  useBudgets,
} from "../hooks";
import type { AppView, ShowToast, PantryItem, Expense } from "../types";
import "./HomeDashboard.css";

interface Props {
  showToast: ShowToast;
  onNavigate: (view: AppView) => void;
  onShowTutorial?: () => void;
}

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const HomeDashboard: FC<Props> = ({ onNavigate, onShowTutorial }) => {
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
  const { data: pantryStats, isLoading: statsLoading } = usePantryStats();
  const { data: lowStockData, isLoading: lowStockLoading } = usePantryItems({ stock_status: "low" });
  const { data: allPantryData, isLoading: pantryLoading } = usePantryItems();
  const { data: shoppingItems, isLoading: shoppingLoading } = useShoppingList();
  const { data: cookStats, isLoading: cookStatsLoading } = useCookStats();
  const { data: streak } = useStreak();
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

  // Top budget by percentage used
  const topBudget = useMemo(() => {
    if (!budgets || budgets.length === 0) return null;
    return [...budgets].sort((a, b) => b.percentage_used - a.percentage_used)[0];
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

  const isLoading =
    expensesLoading || statsLoading || lowStockLoading || pantryLoading || shoppingLoading || cookStatsLoading;

  // ── Sparkline chart ─────────────────────────────────────────────────
  const maxSpend = Math.max(...dailySpending, 1);
  const todayIdx = now.getDay();

  return (
    <div className="home-dashboard">
      {/* ── Greeting + Streak ──────────────────────────────── */}
      <div className="home-greeting">
        <div className="home-greeting-row">
          <div>
            <h1>
              {getGreeting()}, {firstName}
            </h1>
            <p>Here's what's happening this week</p>
          </div>
          <div className="home-greeting-actions">
            {streak && streak.current_streak > 0 && (
              <div className="home-streak" title={`${streak.current_streak}-day logging streak`}>
                <Flame size={18} />
                <span className="home-streak-count">{streak.current_streak}</span>
              </div>
            )}
            {onShowTutorial && (
              <button className="home-tutorial-btn" onClick={onShowTutorial} title="Replay tutorial">
                <HelpCircle size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────── */}
      <div className="home-quick-actions" data-tutorial="quick-actions">
        <button className="home-quick-btn" onClick={() => onNavigate("record")}>
          <Mic size={18} />
          <span>Log expense</span>
        </button>
        <button className="home-quick-btn" onClick={() => onNavigate("record")}>
          <Camera size={18} />
          <span>Scan receipt</span>
        </button>
        <button className="home-quick-btn" onClick={() => onNavigate("shopping-list")}>
          <ListPlus size={18} />
          <span>Add to list</span>
        </button>
        <button className="home-quick-btn" onClick={() => onNavigate("chef")}>
          <ChefHat size={18} />
          <span>Cook</span>
        </button>
      </div>

      {/* ── Recipe Nudge (only if urgent items) ────────────── */}
      {recipeNudge && (
        <button className="home-nudge" onClick={() => onNavigate("chef")}>
          <Sparkles size={16} />
          <span>{recipeNudge.label}</span>
          <ChevronRight size={14} className="home-card-arrow" />
        </button>
      )}

      {/* ── Two-column: Expenses + Pantry ──────────────────── */}
      <div className="home-grid">
        {/* Expenses Card */}
        <button className="home-card home-card--expenses" onClick={() => onNavigate("expenses")} data-tutorial="expenses-card">
          <div className="home-card-header">
            <div className="home-card-icon home-card-icon--expenses">
              <DollarSign size={20} />
            </div>
            <div className="home-card-title">
              <h3>This Week's Expenses</h3>
              <ChevronRight size={16} className="home-card-arrow" />
            </div>
          </div>
          <div className="home-card-body">
            {isLoading ? (
              <div className="home-card-skeleton" />
            ) : (
              <>
                <div className="home-stat-row">
                  <span className="home-stat-value">${weeklyExpenses.total.toFixed(2)}</span>
                  <span className="home-stat-label">
                    {weeklyExpenses.count} purchase{weeklyExpenses.count !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Sparkline */}
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
        </button>

        {/* Pantry Alerts Card */}
        <button className="home-card home-card--pantry" onClick={() => onNavigate("pantry")} data-tutorial="pantry-card">
          <div className="home-card-header">
            <div className="home-card-icon home-card-icon--pantry">
              <Package size={20} />
            </div>
            <div className="home-card-title">
              <h3>Pantry Alerts</h3>
              <ChevronRight size={16} className="home-card-arrow" />
            </div>
          </div>
          <div className="home-card-body">
            {isLoading ? (
              <div className="home-card-skeleton" />
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
                <div className="home-alert-section">
                  <div className="home-alert-header">
                    <Clock size={14} />
                    <span>Expiring Soon ({expiringItems.length})</span>
                  </div>
                  {expiringItems.length > 0 ? (
                    <ul className="home-alert-list">
                      {expiringItems.map((item, i) => (
                        <li key={i}>
                          {item.name}{" "}
                          <span className="home-expiry-days">
                            ({item.daysLeft === 0 ? "today" : item.daysLeft === 1 ? "1 day" : `${item.daysLeft} days`})
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="home-empty-hint">Nothing expiring soon</p>
                  )}
                </div>
              </>
            )}
          </div>
        </button>
      </div>

      {/* ── Two-column: Budget + Shopping ──────────────────── */}
      <div className="home-grid">
        {/* Budget Snapshot */}
        <button className="home-card home-card--budget" onClick={() => onNavigate("budgets")} data-tutorial="budget-card">
          <div className="home-card-header">
            <div className="home-card-icon home-card-icon--budget">
              <Wallet size={20} />
            </div>
            <div className="home-card-title">
              <h3>Budget</h3>
              <ChevronRight size={16} className="home-card-arrow" />
            </div>
          </div>
          <div className="home-card-body">
            {isLoading ? (
              <div className="home-card-skeleton" />
            ) : budgets && budgets.length > 0 && topBudget ? (
              <div className="home-budget-list">
                {budgets.slice(0, 3).map((b) => {
                  const pct = Math.min(b.percentage_used, 100);
                  const overBudget = b.percentage_used > 100;
                  return (
                    <div key={b.id} className="home-budget-row">
                      <div className="home-budget-info">
                        <span className="home-budget-cat">{b.category}</span>
                        <span className="home-budget-nums">
                          ${b.actual_spending.toFixed(0)} / ${b.amount.toFixed(0)}
                        </span>
                      </div>
                      <div className="home-budget-track">
                        <div
                          className={`home-budget-fill${overBudget ? " over" : pct > 80 ? " warn" : ""}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="home-empty-hint">No budgets set this month</p>
            )}
          </div>
        </button>

        {/* Shopping List */}
        <button className="home-card home-card--shopping" onClick={() => onNavigate("shopping-list")} data-tutorial="shopping-card">
          <div className="home-card-header">
            <div className="home-card-icon home-card-icon--shopping">
              <ShoppingCart size={20} />
            </div>
            <div className="home-card-title">
              <h3>
                Shopping List{" "}
                {shoppingItems && shoppingItems.length > 0 && (
                  <span className="home-card-count">
                    ({shoppingItems.length} item{shoppingItems.length !== 1 ? "s" : ""})
                  </span>
                )}
              </h3>
              <ChevronRight size={16} className="home-card-arrow" />
            </div>
          </div>
          <div className="home-card-body">
            {isLoading ? (
              <div className="home-card-skeleton" />
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
              <p className="home-empty-hint">Your shopping list is empty</p>
            )}
          </div>
        </button>
      </div>

      {/* ── Meals This Week ────────────────────────────────── */}
      <div className="home-card home-card--meals">
        <div className="home-card-header">
          <div className="home-card-icon home-card-icon--meals">
            <ChefHat size={20} />
          </div>
          <div className="home-card-title">
            <h3>
              Meals This Week{" "}
              {cookStats && cookStats.week_meals_cooked > 0 && (
                <span className="home-card-count">
                  ({cookStats.week_meals_cooked} meal{cookStats.week_meals_cooked !== 1 ? "s" : ""})
                </span>
              )}
            </h3>
          </div>
        </div>
        <div className="home-card-body">
          {isLoading ? (
            <div className="home-card-skeleton" />
          ) : cookStats && cookStats.recent_meals.length > 0 ? (
            <>
              <div className="home-meals-list">
                {cookStats.recent_meals.map((meal, i) => {
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
    </div>
  );
};

export default HomeDashboard;
