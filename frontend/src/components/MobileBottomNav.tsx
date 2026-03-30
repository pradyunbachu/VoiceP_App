/**
 * MobileBottomNav.tsx - Bottom tab bar for mobile navigation.
 *
 * Renders a fixed bottom bar on screens ≤768px with the 5 primary views
 * (Home, Pantry, Shopping, Chef, More). The "More" tab opens a sheet
 * with the remaining views (Planner, Finance, Settings).
 */
import { useState, useRef, useEffect } from "react";
import type { FC } from "react";
import {
  Home,
  Package,
  ShoppingCart,
  ChefHat,
  MoreHorizontal,
  CalendarDays,
  BarChart3,
  List,
  Wallet,
  ArrowLeftRight,
  Settings,
  Heart,
  X,
} from "lucide-react";
import type { AppView } from "../types";
import "./MobileBottomNav.css";

interface Props {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

const MobileBottomNav: FC<Props> = ({ currentView, onViewChange }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close "More" sheet on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  const isMoreView = [
    "meal-planner", "saved-recipes", "dashboard", "expenses", "budgets",
    "insights", "comparisons", "settings",
  ].includes(currentView);

  const handleNav = (view: AppView) => {
    setMoreOpen(false);
    onViewChange(view);
  };

  return (
    <>
      <nav className="mobile-bottom-nav">
        <button
          className={`mobile-nav-tab ${currentView === "home" ? "active" : ""}`}
          onClick={() => handleNav("home")}
        >
          <Home size={20} />
          <span>Home</span>
        </button>
        <button
          className={`mobile-nav-tab ${currentView === "pantry" ? "active" : ""}`}
          onClick={() => handleNav("pantry")}
        >
          <Package size={20} />
          <span>Pantry</span>
        </button>
        <button
          className={`mobile-nav-tab ${currentView === "shopping-list" ? "active" : ""}`}
          onClick={() => handleNav("shopping-list")}
        >
          <ShoppingCart size={20} />
          <span>Shop</span>
        </button>
        <button
          className={`mobile-nav-tab ${currentView === "chef" ? "active" : ""}`}
          onClick={() => handleNav("chef")}
        >
          <ChefHat size={20} />
          <span>Chef</span>
        </button>
        <button
          className={`mobile-nav-tab ${isMoreView || moreOpen ? "active" : ""}`}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* More sheet */}
      {moreOpen && (
        <div className="mobile-more-overlay">
          <div className="mobile-more-sheet" ref={sheetRef}>
            <div className="mobile-more-header">
              <span>More</span>
              <button className="mobile-more-close" onClick={() => setMoreOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="mobile-more-grid">
              <button
                className={`mobile-more-item ${currentView === "meal-planner" ? "active" : ""}`}
                onClick={() => handleNav("meal-planner")}
              >
                <CalendarDays size={22} />
                <span>Planner</span>
              </button>
              <button
                className={`mobile-more-item ${currentView === "saved-recipes" ? "active" : ""}`}
                onClick={() => handleNav("saved-recipes")}
              >
                <Heart size={22} />
                <span>Saved</span>
              </button>
              <button
                className={`mobile-more-item ${currentView === "dashboard" ? "active" : ""}`}
                onClick={() => handleNav("dashboard")}
              >
                <BarChart3 size={22} />
                <span>Dashboard</span>
              </button>
              <button
                className={`mobile-more-item ${currentView === "expenses" ? "active" : ""}`}
                onClick={() => handleNav("expenses")}
              >
                <List size={22} />
                <span>Expenses</span>
              </button>
              <button
                className={`mobile-more-item ${currentView === "budgets" ? "active" : ""}`}
                onClick={() => handleNav("budgets")}
              >
                <Wallet size={22} />
                <span>Budgets</span>
              </button>
              <button
                className={`mobile-more-item ${currentView === "insights" ? "active" : ""}`}
                onClick={() => handleNav("insights")}
              >
                <BarChart3 size={22} />
                <span>Insights</span>
              </button>
              <button
                className={`mobile-more-item ${currentView === "comparisons" ? "active" : ""}`}
                onClick={() => handleNav("comparisons")}
              >
                <ArrowLeftRight size={22} />
                <span>Compare</span>
              </button>
              <button
                className={`mobile-more-item ${currentView === "settings" ? "active" : ""}`}
                onClick={() => handleNav("settings")}
              >
                <Settings size={22} />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileBottomNav;
