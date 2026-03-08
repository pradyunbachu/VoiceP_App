/*
 * Navigation.jsx
 * Main app navigation bar rendered at the top of the authenticated layout.
 * Contains the logo/home link, a light/dark theme toggle, and grouped
 * dropdown menus for Finance (Dashboard, Expenses, Budgets, Insights,
 * Compare) and Kitchen (Pantry, Shopping List) sections. Dropdowns close
 * on outside click. Also shows the current username and a logout button.
 */
import { useState, useRef, useEffect } from "react";
import type { FC } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, BarChart3, List, LogOut, Wallet, Package, ChevronDown, DollarSign, ShoppingCart, Sparkles, ArrowLeftRight, ChefHat, Home, Settings } from "lucide-react";
import type { AppView, AppUser } from "../types";
import "./Navigation.css";

interface Props {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  onLogout: () => void;
  user: AppUser | null;
}

const Navigation: FC<Props> = ({ currentView, onViewChange, onLogout, user }) => {
  const [financeOpen, setFinanceOpen] = useState<boolean>(false);
  const financeRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (financeRef.current && !financeRef.current.contains(event.target as Node)) {
        setFinanceOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isFinanceView = ["dashboard", "expenses", "budgets", "insights", "comparisons"].includes(currentView);

  const handleFinanceItemClick = (view: AppView): void => {
    onViewChange(view);
    setFinanceOpen(false);
  };

  return (
    <nav className="navigation">
      <div className="nav-left">
        <div className="nav-logo" onClick={() => onViewChange("home")}>
          <Mic size={20} />
          <span>voxal</span>
        </div>
      </div>
      <div className="nav-tabs" data-tutorial="nav-tabs">
        {/* Home Tab */}
        <button
          className={`nav-tab ${currentView === "home" ? "active" : ""}`}
          onClick={() => onViewChange("home")}
        >
          <Home size={18} />
          <span className="nav-label-full">Home</span>
        </button>

        {/* Pantry Tab */}
        <button
          className={`nav-tab ${currentView === "pantry" ? "active" : ""}`}
          onClick={() => onViewChange("pantry")}
          data-tutorial="kitchen-tab"
        >
          <Package size={18} />
          <span className="nav-label-full">Pantry</span>
        </button>

        {/* Shopping List Tab */}
        <button
          className={`nav-tab ${currentView === "shopping-list" ? "active" : ""}`}
          onClick={() => onViewChange("shopping-list")}
        >
          <ShoppingCart size={18} />
          <span className="nav-label-full">Shopping</span>
        </button>

        {/* Chef Tab */}
        <button
          className={`nav-tab ${currentView === "chef" ? "active" : ""}`}
          onClick={() => onViewChange("chef")}
        >
          <ChefHat size={18} />
          <span className="nav-label-full">Chef</span>
        </button>

        {/* Finance Dropdown */}
        <div className="nav-dropdown" ref={financeRef}>
          <button
            className={`nav-tab nav-dropdown-trigger ${isFinanceView ? "active" : ""}`}
            onClick={() => {
              setFinanceOpen(!financeOpen);
            }}
            data-tutorial="finance-tab"
          >
            <DollarSign size={18} />
            <span className="nav-label-full">Finance</span>
            <ChevronDown size={14} className={`dropdown-arrow ${financeOpen ? "open" : ""}`} />
          </button>
          <AnimatePresence>
            {financeOpen && (
              <motion.div
                className="nav-dropdown-menu"
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
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
                <button
                  className={`nav-dropdown-item ${currentView === "comparisons" ? "active" : ""}`}
                  onClick={() => handleFinanceItemClick("comparisons")}
                >
                  <ArrowLeftRight size={16} />
                  <span>Compare</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
      <div className="nav-user">
        {user && (
          user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt={user.username}
              className="nav-avatar"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="nav-avatar nav-avatar-fallback">
              {user.username.charAt(0).toUpperCase()}
            </div>
          )
        )}
        <button
          className={`nav-settings ${currentView === "settings" ? "active" : ""}`}
          onClick={() => onViewChange("settings")}
          title="Settings"
        >
          <Settings size={18} />
        </button>
        <button className="nav-logout" onClick={onLogout} title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </nav>
  );
};

export default Navigation;
