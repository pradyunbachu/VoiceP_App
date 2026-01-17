import { ShoppingCart, Package, DollarSign, HelpCircle, AlertTriangle } from "lucide-react";
import "./ChatResponseDisplay.css";

const ChatResponseDisplay = ({ chatResponse }) => {
  if (!chatResponse) return null;

  const { intent, sub_intent, response_text, data } = chatResponse;

  const getIcon = () => {
    switch (intent) {
      case "pantry_query":
        return <Package size={24} />;
      case "expense_query":
        return <DollarSign size={24} />;
      case "suggestion":
        return <ShoppingCart size={24} />;
      default:
        return <HelpCircle size={24} />;
    }
  };

  const getTitle = () => {
    switch (intent) {
      case "pantry_query":
        return "Pantry";
      case "expense_query":
        return "Spending";
      case "suggestion":
        return "Shopping List";
      default:
        return "Help";
    }
  };

  const renderPantryData = () => {
    if (!data?.items || data.items.length === 0) return null;

    return (
      <div className="chat-data-list">
        {data.items.map((item, index) => (
          <div key={item.id || index} className="chat-data-item pantry-item">
            <span className="item-name">{item.name}</span>
            <span className="item-details">
              {item.quantity} {item.unit}
              <span className={`stock-badge ${item.stock_status}`}>
                {item.stock_status === "out_of_stock" ? "Out" : item.stock_status}
              </span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderExpenseData = () => {
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

  const renderSuggestionData = () => {
    if (!data?.items || data.items.length === 0) return null;

    const outOfStock = data.items.filter((i) => i.status === "out_of_stock");
    const lowStock = data.items.filter((i) => i.status === "low");

    return (
      <div className="chat-data-list shopping-list">
        {outOfStock.length > 0 && (
          <div className="shopping-section">
            <h4 className="shopping-section-title">
              <AlertTriangle size={16} /> Out of Stock
            </h4>
            {outOfStock.map((item, index) => (
              <div key={index} className="chat-data-item shopping-item urgent">
                <span className="item-name">{item.name}</span>
                {item.category && <span className="item-category">{item.category}</span>}
              </div>
            ))}
          </div>
        )}
        {lowStock.length > 0 && (
          <div className="shopping-section">
            <h4 className="shopping-section-title">Running Low</h4>
            {lowStock.map((item, index) => (
              <div key={index} className="chat-data-item shopping-item">
                <span className="item-name">{item.name}</span>
                {item.category && <span className="item-category">{item.category}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderData = () => {
    switch (intent) {
      case "pantry_query":
        return renderPantryData();
      case "expense_query":
        return renderExpenseData();
      case "suggestion":
        return renderSuggestionData();
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
