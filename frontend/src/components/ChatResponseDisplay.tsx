/**
 * ChatResponseDisplay.jsx - Renders structured voice assistant responses.
 *
 * Takes the parsed chatResponse object (intent, response text, data) from
 * the voice assistant and renders an intent-specific card. Supports pantry
 * queries, pantry additions, expense queries, shopping suggestions, and
 * meal suggestions -- each with a tailored data layout.
 */
import type { FC, ReactNode } from "react";
import { ShoppingCart, Package, DollarSign, HelpCircle, AlertTriangle, UtensilsCrossed, Clock, CheckCircle } from "lucide-react";
import type { ChatResponse } from "../types";
import "./ChatResponseDisplay.css";

interface Props {
  chatResponse: ChatResponse | null;
}

const ChatResponseDisplay: FC<Props> = ({ chatResponse }) => {
  if (!chatResponse) return null;

  const { intent, sub_intent, response_text, data } = chatResponse;

  // Map intent to its corresponding icon
  const getIcon = (): ReactNode => {
    switch (intent) {
      case "pantry_query":
        return <Package size={24} />;
      case "pantry_add":
        return <CheckCircle size={24} />;
      case "expense_query":
        return <DollarSign size={24} />;
      case "suggestion":
        return <ShoppingCart size={24} />;
      case "meal_suggestion":
        return <UtensilsCrossed size={24} />;
      default:
        return <HelpCircle size={24} />;
    }
  };

  // Capitalize the meal type for the section heading (e.g. "Dinner Ideas")
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
      case "expense_query":
        return "Spending";
      case "suggestion":
        return "Shopping List";
      case "meal_suggestion":
        return getMealTypeLabel();
      default:
        return "Help";
    }
  };

  // Render a list of pantry items returned by a pantry query
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

  // Render expense summary with total, transaction count, and optional item list
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
        {/* Only show individual expenses for small result sets to avoid clutter */}
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

  // Render shopping suggestions split into out-of-stock and low-stock sections
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

  // Render items that were just added to the pantry via voice command
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

  // Render meal suggestion cards with ingredient chips (have vs. need)
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
              {/* Green chips = ingredients user already has */}
              {meal.ingredients_used && meal.ingredients_used.map((ing, i) => (
                <span key={i} className="ingredient-chip have">{ing}</span>
              ))}
              {/* Red/neutral chips = ingredients user still needs */}
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

  // Route to the appropriate data renderer based on intent
  const renderData = (): ReactNode => {
    switch (intent) {
      case "pantry_query":
        return renderPantryData();
      case "pantry_add":
        return renderPantryAdd();
      case "expense_query":
        return renderExpenseData();
      case "suggestion":
        return renderSuggestionData();
      case "meal_suggestion":
        return renderMealSuggestions();
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
