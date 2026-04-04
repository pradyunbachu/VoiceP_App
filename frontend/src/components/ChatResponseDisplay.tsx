/**
 * ChatResponseDisplay.tsx - Renders structured voice assistant responses.
 *
 * Takes the parsed chatResponse object (intent, response text, data) from
 * the voice assistant and renders an intent-specific card with tailored
 * data layouts for all supported intents.
 */
import { useState } from "react";
import type { FC, ReactNode } from "react";
import {
  ShoppingCart, Package, DollarSign, HelpCircle, AlertTriangle,
  UtensilsCrossed, Clock, CheckCircle, Trash2, Plus, Minus,
  MapPin, Repeat, Bell, Calendar, Wallet, Share2, Flame,
  Check, X,
} from "lucide-react";
import type { ChatResponse } from "../types";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config/api";
import { getCsrfHeaders } from "../lib/csrf";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../hooks/queries/queryKeys";
import "./ChatResponseDisplay.css";

interface PendingItem {
  name: string;
  quantity: number;
  unit: string | null;
  category: string;
  is_pantry_item: boolean;
}

interface Props {
  chatResponse: ChatResponse | null;
}

const ChatResponseDisplay: FC<Props> = ({ chatResponse }) => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [storeTripItems, setStoreTripItems] = useState<PendingItem[] | null>(null);
  const [storeTripAmount, setStoreTripAmount] = useState<string>("");
  const [storeTripConfirmed, setStoreTripConfirmed] = useState(false);
  const [storeTripSubmitting, setStoreTripSubmitting] = useState(false);

  if (!chatResponse) return null;

  const { intent, sub_intent, response_text, data } = chatResponse;

  // Initialize store trip items from data on first render
  if (intent === "store_trip" && data?.pending_items && storeTripItems === null && !storeTripConfirmed) {
    const items = (data.pending_items as PendingItem[]).filter(i => i.is_pantry_item);
    setStoreTripItems(items);
    if (data.expense_amount) {
      setStoreTripAmount(String(data.expense_amount));
    }
  }

  // Map intent to its corresponding icon
  const getIcon = (): ReactNode => {
    switch (intent) {
      case "pantry_query":
        return <Package size={24} />;
      case "pantry_add":
        return <CheckCircle size={24} />;
      case "pantry_remove":
        return <Trash2 size={24} />;
      case "cooking_deduct":
        return <Flame size={24} />;
      case "expense_query":
        return <DollarSign size={24} />;
      case "expense_delete":
        return <Trash2 size={24} />;
      case "suggestion":
        return <ShoppingCart size={24} />;
      case "shopping_complete":
        return <CheckCircle size={24} />;
      case "shopping_list_add":
        return <Plus size={24} />;
      case "shopping_list_remove":
        return <Minus size={24} />;
      case "shopping_clear":
        return <Trash2 size={24} />;
      case "meal_suggestion":
        return <UtensilsCrossed size={24} />;
      case "meal_plan_week":
        return <Calendar size={24} />;
      case "budget_set":
        return <Wallet size={24} />;
      case "budget_query":
        return <Wallet size={24} />;
      case "budget_meal":
        return <DollarSign size={24} />;
      case "store_trip":
        return <MapPin size={24} />;
      case "mark_subscription":
        return <Repeat size={24} />;
      case "reminder_check":
        return <Bell size={24} />;
      case "share_list":
        return <Share2 size={24} />;
      default:
        return <HelpCircle size={24} />;
    }
  };

  // Capitalize the meal type for the section heading
  const getMealTypeLabel = (): string => {
    const mealType = data?.meal_type;
    if (!mealType) return "Meal Ideas";
    return `${mealType.charAt(0).toUpperCase() + mealType.slice(1)} Ideas`;
  };

  // Map intent to a human-readable section title
  const getTitle = (): string => {
    switch (intent) {
      case "pantry_query":
        return "Pantry";
      case "pantry_add":
        return "Pantry Updated";
      case "pantry_remove":
        return "Pantry Updated";
      case "cooking_deduct":
        return "Cooking";
      case "expense_query":
        return "Spending";
      case "expense_delete":
        return "Expense Deleted";
      case "suggestion":
        return "Shopping Suggestions";
      case "shopping_complete":
        return "Shopping Complete";
      case "shopping_list_add":
        return "Shopping List";
      case "shopping_list_remove":
        return "Shopping List";
      case "shopping_clear":
        return "Shopping List Cleared";
      case "meal_suggestion":
        return getMealTypeLabel();
      case "meal_plan_week":
        return "Weekly Meal Plan";
      case "budget_set":
        return "Budget Set";
      case "budget_query":
        return "Budget Status";
      case "budget_meal":
        return "Budget Meals";
      case "store_trip":
        return storeTripConfirmed ? "Added to Pantry" : "Store Trip";
      case "mark_subscription":
        return "Subscription";
      case "reminder_check":
        return "Item Status";
      case "share_list":
        return "List Shared";
      default:
        return "Voxy";
    }
  };

  // --- Pantry query ---
  const renderPantryData = (): ReactNode => {
    if (!data?.items || data.items.length === 0) return null;

    return (
      <div className="chat-data-list">
        {data.items.map((item: Record<string, unknown>, index: number) => (
          <div key={(item.id as number) || index} className="chat-data-item pantry-item">
            <span className="item-name">{item.name as string}</span>
            <span className="item-details">
              {item.quantity as number} {item.unit as string}
              <span className={`stock-badge ${item.stock_status as string}`}>
                {item.stock_status === "out_of_stock" ? "Out" : item.stock_status as string}
              </span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  // --- Pantry add ---
  const renderPantryAdd = (): ReactNode => {
    if (!data?.added_items || data.added_items.length === 0) return null;

    return (
      <div className="chat-data-list pantry-add-list">
        {data.added_items.map((item, index) => (
          <div key={item.id || index} className="chat-data-item pantry-add-item">
            <span className="item-name">{item.name}</span>
            <span className="item-category-badge">{item.category}</span>
          </div>
        ))}
      </div>
    );
  };

  // --- Pantry remove ---
  const renderPantryRemove = (): ReactNode => {
    const removed = data?.removed_items as string[] | undefined;
    if (!removed || removed.length === 0) return null;

    return (
      <div className="chat-data-list">
        {removed.map((name: string, index: number) => (
          <div key={index} className="chat-data-item">
            <span className="item-name">{name}</span>
            <span className="stock-badge out_of_stock">Removed</span>
          </div>
        ))}
      </div>
    );
  };

  // --- Cooking deduct ---
  const renderCookingDeduct = (): ReactNode => {
    const deducted = data?.deducted_items as Array<Record<string, unknown>> | undefined;
    if (!deducted || deducted.length === 0) return null;

    return (
      <div className="chat-data-list">
        {deducted.map((item: Record<string, unknown>, index: number) => (
          <div key={index} className="chat-data-item">
            <span className="item-name">{item.name as string}</span>
            <span className="item-details">
              {item.old_quantity as number} &rarr; {item.new_quantity as number}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // --- Expense query ---
  const renderExpenseData = (): ReactNode => {
    if (!data) return null;

    return (
      <div className="chat-data-summary">
        <div className="expense-total">
          <span className="total-label">Total Spent</span>
          <span className="total-amount">${data.total?.toFixed(2)}</span>
        </div>
        <div className="expense-meta">
          <span>{data.count} transaction{data.count !== 1 ? "s" : ""}</span>
          <span>{data.time_period}</span>
          {data.category && <span>{data.category}</span>}
          {data.store && <span>{data.store}</span>}
        </div>
        {data.expenses && data.expenses.length > 0 && data.expenses.length <= 5 && (
          <div className="chat-data-list">
            {data.expenses.map((expense, index) => (
              <div key={expense.id || index} className="chat-data-item expense-item">
                <span className="item-name">{expense.store}</span>
                <span className="item-details">
                  ${expense.amount?.toFixed(2)}
                  <span className="expense-date">{expense.date}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- Expense delete ---
  const renderExpenseDelete = (): ReactNode => {
    const deleted = data?.deleted_expense;
    if (!deleted) return null;

    return (
      <div className="chat-data-list">
        <div className="chat-data-item">
          <span className="item-name">{deleted.store || "Expense"}</span>
          <span className="item-details">
            {deleted.amount != null && <span>${deleted.amount.toFixed(2)}</span>}
            {deleted.date && <span className="expense-date">{deleted.date}</span>}
          </span>
        </div>
        {deleted.items && (
          <div className="chat-data-item">
            <span className="item-name">Items</span>
            <span className="item-details">{deleted.items}</span>
          </div>
        )}
      </div>
    );
  };

  // --- Suggestion ---
  const renderSuggestionData = (): ReactNode => {
    if (!data?.items || data.items.length === 0) return null;

    const outOfStock = data.items.filter((i: Record<string, unknown>) => i.status === "out_of_stock");
    const lowStock = data.items.filter((i: Record<string, unknown>) => i.status === "low");

    return (
      <div className="chat-data-list shopping-list">
        {outOfStock.length > 0 && (
          <div className="shopping-section">
            <h4 className="shopping-section-title">
              <AlertTriangle size={16} /> Out of Stock
            </h4>
            {outOfStock.map((item: Record<string, unknown>, index: number) => (
              <div key={index} className="chat-data-item shopping-item urgent">
                <span className="item-name">{item.name as string}</span>
                {item.category ? <span className="item-category">{String(item.category)}</span> : null}
              </div>
            ))}
          </div>
        )}
        {lowStock.length > 0 && (
          <div className="shopping-section">
            <h4 className="shopping-section-title">Running Low</h4>
            {lowStock.map((item: Record<string, unknown>, index: number) => (
              <div key={index} className="chat-data-item shopping-item">
                <span className="item-name">{item.name as string}</span>
                {item.category ? <span className="item-category">{String(item.category)}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- Shopping complete ---
  const renderShoppingComplete = (): ReactNode => {
    const removed = data?.removed_items as string[] | undefined;
    const pantryAdded = data?.pantry_added as string[] | undefined;
    if ((!removed || removed.length === 0) && (!pantryAdded || pantryAdded.length === 0)) return null;

    return (
      <div className="chat-data-list">
        {removed && removed.length > 0 && removed.map((name: string, index: number) => (
          <div key={`r-${index}`} className="chat-data-item">
            <span className="item-name">{name}</span>
            <span className="stock-badge low">Off list</span>
          </div>
        ))}
        {pantryAdded && pantryAdded.length > 0 && pantryAdded.map((name: string, index: number) => (
          <div key={`p-${index}`} className="chat-data-item pantry-add-item">
            <span className="item-name">{name}</span>
            <span className="stock-badge full">In pantry</span>
          </div>
        ))}
      </div>
    );
  };

  // --- Shopping list add ---
  const renderShoppingListAdd = (): ReactNode => {
    if (!data?.added_items || data.added_items.length === 0) return null;

    return (
      <div className="chat-data-list">
        {data.added_items.map((item, index) => (
          <div key={item.id || index} className="chat-data-item">
            <span className="item-name">{item.name}</span>
            <span className="stock-badge full">Added</span>
          </div>
        ))}
      </div>
    );
  };

  // --- Shopping list remove ---
  const renderShoppingListRemove = (): ReactNode => {
    const removed = data?.removed_items as string[] | undefined;
    if (!removed || removed.length === 0) return null;

    return (
      <div className="chat-data-list">
        {removed.map((name: string, index: number) => (
          <div key={index} className="chat-data-item">
            <span className="item-name">{name}</span>
            <span className="stock-badge out_of_stock">Removed</span>
          </div>
        ))}
      </div>
    );
  };

  // --- Meal suggestions ---
  const renderMealSuggestions = (): ReactNode => {
    if (!data?.meals || data.meals.length === 0) return null;

    return (
      <div className="chat-data-list meal-suggestions">
        {data.expiring_items && data.expiring_items.length > 0 && (
          <div className="expiring-notice">
            <AlertTriangle size={16} />
            <span>Items expiring soon: {data.expiring_items.join(", ")}</span>
          </div>
        )}
        {data.meals.map((meal, index) => (
          <div key={index} className="meal-card">
            <div className="meal-header">
              <span className="meal-name">{meal.name}</span>
              <div className="meal-badges">
                {meal.time_minutes && (
                  <span className="meal-time-badge">
                    <Clock size={12} />
                    {meal.time_minutes} min
                  </span>
                )}
                {meal.uses_expiring && (
                  <span className="meal-expiring-badge">Uses expiring</span>
                )}
              </div>
            </div>
            <div className="meal-ingredients">
              {meal.ingredients_used && meal.ingredients_used.map((ing, i) => (
                <span key={i} className="ingredient-chip have">{ing}</span>
              ))}
              {meal.ingredients_needed && meal.ingredients_needed.map((ing, i) => (
                <span key={`need-${i}`} className="ingredient-chip need">{ing}</span>
              ))}
            </div>
            {meal.instructions && (
              <div className="meal-instructions">
                <span className="instructions-label">Instructions</span>
                <ol className="instructions-steps">
                  {Array.isArray(meal.instructions) ? (
                    meal.instructions.map((step, i) => (
                      <li key={i} className="instruction-step">{step}</li>
                    ))
                  ) : (
                    <li className="instruction-step">{meal.instructions}</li>
                  )}
                </ol>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // --- Meal plan week ---
  const renderMealPlanWeek = (): ReactNode => {
    const mealPlan = data?.meal_plan;
    if (!mealPlan || mealPlan.length === 0) return null;

    return (
      <div className="chat-data-list">
        {mealPlan.map((day, index) => {
          const dayName = String(day.day || `Day ${index + 1}`);
          const bObj = day.breakfast as Record<string, unknown> | undefined;
          const lObj = day.lunch as Record<string, unknown> | undefined;
          const dObj = day.dinner as Record<string, unknown> | undefined;
          const breakfast = String(bObj?.name || "\u2014");
          const lunch = String(lObj?.name || "\u2014");
          const dinner = String(dObj?.name || "\u2014");
          return (
            <div key={index} className="chat-data-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
              <span className="item-name">{dayName}</span>
              <span className="item-details" style={{ flexWrap: "wrap" }}>
                <span>{breakfast}</span>
                <span>/</span>
                <span>{lunch}</span>
                <span>/</span>
                <span>{dinner}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // --- Budget query ---
  const renderBudgetQuery = (): ReactNode => {
    const budgets = data?.budgets;
    if (!budgets || budgets.length === 0) return null;

    return (
      <div className="chat-data-list">
        {budgets.map((budget, index) => {
          const category = budget.category || "General";
          const amount = budget.amount || 0;
          const spent = budget.actual_spending || 0;
          const remaining = budget.remaining || 0;
          const pct = budget.percentage_used || 0;
          const isOver = remaining < 0;

          return (
            <div key={index} className="chat-data-item" style={{ flexDirection: "column", alignItems: "stretch", gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="item-name">{category}</span>
                <span className={`stock-badge ${isOver ? "out_of_stock" : pct > 80 ? "low" : "full"}`}>
                  {isOver ? "Over budget" : `${pct.toFixed(0)}% used`}
                </span>
              </div>
              <div style={{ width: "100%", height: "6px", background: "var(--bg-input)", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min(pct, 100)}%`,
                  height: "100%",
                  borderRadius: "3px",
                  background: isOver ? "var(--accent-danger, #ef4444)" : pct > 80 ? "var(--accent-warning, #f59e0b)" : "var(--accent-success, #22c55e)",
                }} />
              </div>
              <span className="item-details">
                <span>${spent.toFixed(2)} spent</span>
                <span>${amount.toFixed(2)} budget</span>
                <span>${Math.abs(remaining).toFixed(2)} {isOver ? "over" : "left"}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // --- Budget meal ---
  const renderBudgetMeal = (): ReactNode => {
    const meals = data?.meals;
    if (!meals || meals.length === 0) return null;

    return (
      <div className="chat-data-list meal-suggestions">
        {meals.map((meal, index) => {
          const m = meal as unknown as Record<string, unknown>;
          const cost = m.estimated_cost ?? m.buy_cost_estimate;
          const costStr = typeof cost === "number" ? `$${cost.toFixed(2)}` : `$${cost}`;
          const onHand = m.ingredients_on_hand as string[] | undefined;
          const toBuy = m.ingredients_to_buy as string[] | undefined;

          return (
            <div key={index} className="meal-card">
              <div className="meal-header">
                <span className="meal-name">{String(m.name || "Meal")}</span>
                <span className="meal-time-badge">{costStr}</span>
              </div>
              <div className="meal-ingredients">
                {onHand && onHand.map((ing: string, i: number) => (
                  <span key={i} className="ingredient-chip have">{ing}</span>
                ))}
                {toBuy && toBuy.map((ing: string, i: number) => (
                  <span key={`buy-${i}`} className="ingredient-chip need">{ing}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // --- Store trip (interactive) ---
  const updateStoreTripItem = (index: number, field: keyof PendingItem, value: string | number) => {
    if (!storeTripItems) return;
    const next = [...storeTripItems];
    (next[index] as unknown as Record<string, unknown>)[field] = value;
    setStoreTripItems(next);
  };

  const adjustStoreTripQty = (index: number, delta: number) => {
    if (!storeTripItems) return;
    const next = [...storeTripItems];
    next[index].quantity = Math.max(1, next[index].quantity + delta);
    setStoreTripItems(next);
  };

  const removeStoreTripItem = (index: number) => {
    if (!storeTripItems) return;
    setStoreTripItems(storeTripItems.filter((_, i) => i !== index));
  };

  const handleStoreTripConfirm = async () => {
    if (!storeTripItems || storeTripItems.length === 0) return;
    setStoreTripSubmitting(true);
    try {
      const token = await getToken();
      const amount = storeTripAmount ? parseFloat(storeTripAmount) : null;
      await fetch(`${API_BASE_URL}/api/pantry/store-trip`, {
        method: "POST",
        headers: getCsrfHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        }),
        credentials: "include",
        body: JSON.stringify({
          items: storeTripItems.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            category: i.category,
          })),
          store: data?.store || "Store",
          amount: amount && amount > 0 ? amount : null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
      if (amount && amount > 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      }
      setStoreTripConfirmed(true);
    } catch (err) {
      console.error("Error confirming store trip:", err);
    } finally {
      setStoreTripSubmitting(false);
    }
  };

  const renderStoreTrip = (): ReactNode => {
    if (storeTripConfirmed) {
      return (
        <div className="chat-data-list">
          {storeTripItems && storeTripItems.map((item, index) => (
            <div key={index} className="chat-data-item pantry-add-item">
              <span className="item-name">{item.name}</span>
              <span className="item-details">
                x{item.quantity}
                <span className="stock-badge full">Added</span>
              </span>
            </div>
          ))}
        </div>
      );
    }

    if (!storeTripItems || storeTripItems.length === 0) return null;

    return (
      <div className="store-trip-confirm">
        <div className="chat-data-list">
          {storeTripItems.map((item, index) => (
            <div key={index} className="chat-data-item store-trip-item">
              <input
                type="text"
                value={item.name}
                onChange={(e) => updateStoreTripItem(index, "name", e.target.value)}
                className="store-trip-name-input"
              />
              <div className="store-trip-qty-controls">
                <button
                  className="store-trip-qty-btn"
                  onClick={() => adjustStoreTripQty(index, -1)}
                  type="button"
                >
                  <Minus size={12} />
                </button>
                <span className="store-trip-qty-value">{item.quantity}</span>
                <button
                  className="store-trip-qty-btn"
                  onClick={() => adjustStoreTripQty(index, 1)}
                  type="button"
                >
                  <Plus size={12} />
                </button>
              </div>
              <button
                className="store-trip-remove-btn"
                onClick={() => removeStoreTripItem(index)}
                type="button"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="store-trip-amount-row">
          <label className="store-trip-amount-label">Total spent</label>
          <div className="store-trip-amount-input-wrapper">
            <span className="store-trip-dollar-sign">$</span>
            <input
              type="number"
              value={storeTripAmount}
              onChange={(e) => setStoreTripAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="store-trip-amount-input"
            />
          </div>
        </div>

        <div className="store-trip-actions">
          <button
            className="store-trip-confirm-btn"
            onClick={handleStoreTripConfirm}
            disabled={storeTripSubmitting || storeTripItems.length === 0}
          >
            {storeTripSubmitting ? "Adding..." : (
              <><Check size={16} /> Add {storeTripItems.length} Item{storeTripItems.length !== 1 ? "s" : ""} to Pantry</>
            )}
          </button>
        </div>
      </div>
    );
  };

  // Route to the appropriate data renderer based on intent
  const renderData = (): ReactNode => {
    switch (intent) {
      case "pantry_query":
        return renderPantryData();
      case "pantry_add":
        return renderPantryAdd();
      case "pantry_remove":
        return renderPantryRemove();
      case "cooking_deduct":
        return renderCookingDeduct();
      case "expense_query":
        return renderExpenseData();
      case "expense_delete":
        return renderExpenseDelete();
      case "suggestion":
        return renderSuggestionData();
      case "shopping_complete":
        return renderShoppingComplete();
      case "shopping_list_add":
        return renderShoppingListAdd();
      case "shopping_list_remove":
        return renderShoppingListRemove();
      case "meal_suggestion":
        return renderMealSuggestions();
      case "meal_plan_week":
        return renderMealPlanWeek();
      case "budget_query":
        return renderBudgetQuery();
      case "budget_meal":
        return renderBudgetMeal();
      case "store_trip":
        return renderStoreTrip();
      // These intents use only the response_text (no extra data rendering needed):
      // shopping_clear, budget_set, mark_subscription, reminder_check, share_list
      default:
        return null;
    }
  };

  return (
    <div className={`chat-response chat-${intent}`}>
      <div className="chat-response-header">
        {getIcon()}
        <h3>{getTitle()}</h3>
      </div>
      <div className="chat-response-text">
        {response_text.split("\n").map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
      {renderData()}
    </div>
  );
};

export default ChatResponseDisplay;
