import { useState, useRef, useEffect } from "react";
import { Mic, BarChart3, List, LogOut, Wallet, Sun, Moon, Package, ChevronDown, DollarSign, UtensilsCrossed, ShoppingCart, Sparkles } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import "./Navigation.css";

const Navigation = ({ currentView, onViewChange, onLogout, user }) => {
  const { theme, toggleTheme } = useTheme();
  const [financeOpen, setFinanceOpen] = useState(false);
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const financeRef = useRef(null);
  const kitchenRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (financeRef.current && !financeRef.current.contains(event.target)) {
        setFinanceOpen(false);
      }
      if (kitchenRef.current && !kitchenRef.current.contains(event.target)) {
        setKitchenOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isFinanceView = ["dashboard", "expenses", "budgets", "insights"].includes(currentView);
  const isKitchenView = ["pantry", "shopping-list"].includes(currentView);

  const handleFinanceItemClick = (view) => {
    onViewChange(view);
    setFinanceOpen(false);
  };

  const handleKitchenItemClick = (view) => {
    onViewChange(view);
    setKitchenOpen(false);
  };

  return (
    <nav className="navigation">
      <div className="nav-left">
        <div className="nav-logo" onClick={() => onViewChange("dashboard")}>
          <Mic size={20} />
          <span>voxal</span>
        </div>
        <button
          className="nav-theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      <div className="nav-tabs">
        {/* VoxAssistant Tab */}
        <button
          className={`nav-tab ${currentView === "record" ? "active" : ""}`}
          onClick={() => onViewChange("record")}
        >
          <Mic size={18} />
          <span className="nav-label-full">VoxAssistant</span>
          <span className="nav-label-short">Assist</span>
        </button>

        {/* VoxFinance Dropdown */}
        <div className="nav-dropdown" ref={financeRef}>
          <button
            className={`nav-tab nav-dropdown-trigger ${isFinanceView ? "active" : ""}`}
            onClick={() => {
              setFinanceOpen(!financeOpen);
              setKitchenOpen(false);
            }}
          >
            <DollarSign size={18} />
            <span className="nav-label-full">VoxFinance</span>
            <span className="nav-label-short">Finance</span>
            <ChevronDown size={14} className={`dropdown-arrow ${financeOpen ? "open" : ""}`} />
          </button>
          {financeOpen && (
            <div className="nav-dropdown-menu">
              <button
                className={`nav-dropdown-item ${currentView === "dashboard" ? "active" : ""}`}
                onClick={() => handleFinanceItemClick("dashboard")}
              >
                <BarChart3 size={16} />
                <span>Dashboard</span>
              </button>
              <button
                className={`nav-dropdown-item ${currentView === "expenses" ? "active" : ""}`}
                onClick={() => handleFinanceItemClick("expenses")}
              >
                <List size={16} />
                <span>Expenses</span>
              </button>
              <button
                className={`nav-dropdown-item ${currentView === "budgets" ? "active" : ""}`}
                onClick={() => handleFinanceItemClick("budgets")}
              >
                <Wallet size={16} />
                <span>Budgets</span>
              </button>
              <button
                className={`nav-dropdown-item ${currentView === "insights" ? "active" : ""}`}
                onClick={() => handleFinanceItemClick("insights")}
              >
                <Sparkles size={16} />
                <span>Insights</span>
              </button>
            </div>
          )}
        </div>

        {/* VoxKitchen Dropdown */}
        <div className="nav-dropdown" ref={kitchenRef}>
          <button
            className={`nav-tab nav-dropdown-trigger ${isKitchenView ? "active" : ""}`}
            onClick={() => {
              setKitchenOpen(!kitchenOpen);
              setFinanceOpen(false);
            }}
          >
            <UtensilsCrossed size={18} />
            <span className="nav-label-full">VoxKitchen</span>
            <span className="nav-label-short">Kitchen</span>
            <ChevronDown size={14} className={`dropdown-arrow ${kitchenOpen ? "open" : ""}`} />
          </button>
          {kitchenOpen && (
            <div className="nav-dropdown-menu">
              <button
                className={`nav-dropdown-item ${currentView === "pantry" ? "active" : ""}`}
                onClick={() => handleKitchenItemClick("pantry")}
              >
                <Package size={16} />
                <span>Pantry</span>
              </button>
              <button
                className={`nav-dropdown-item ${currentView === "shopping-list" ? "active" : ""}`}
                onClick={() => handleKitchenItemClick("shopping-list")}
              >
                <ShoppingCart size={16} />
                <span>Shopping List</span>
              </button>
            </div>
          )}
        </div>

      </div>
      <div className="nav-user">
        {user && <span className="nav-username">{user.username}</span>}
        <button className="nav-logout" onClick={onLogout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
};

export default Navigation;
