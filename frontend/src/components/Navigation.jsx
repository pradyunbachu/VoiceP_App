import { Mic, BarChart3, List, LogOut, Wallet, Sun, Moon, Package } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import "./Navigation.css";

const Navigation = ({ currentView, onViewChange, onLogout, user }) => {
  const { theme, toggleTheme } = useTheme();
  return (
    <nav className="navigation">
      <div className="nav-left">
        <div className="nav-logo" onClick={() => onViewChange("landing")}>
          <Mic size={20} />
          <span>Voxalyze</span>
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
        <button
          className={`nav-tab ${currentView === "record" ? "active" : ""}`}
          onClick={() => onViewChange("record")}
        >
          <Mic size={18} />
          <span className="nav-label-full">Record Expense</span>
          <span className="nav-label-short">Record</span>
        </button>
        <button
          className={`nav-tab ${currentView === "dashboard" ? "active" : ""}`}
          onClick={() => onViewChange("dashboard")}
        >
          <BarChart3 size={18} />
          <span className="nav-label-full">Dashboard</span>
          <span className="nav-label-short">Stats</span>
        </button>
        <button
          className={`nav-tab ${currentView === "expenses" ? "active" : ""}`}
          onClick={() => onViewChange("expenses")}
        >
          <List size={18} />
          <span className="nav-label-full">Expenses</span>
          <span className="nav-label-short">List</span>
        </button>
        <button
          className={`nav-tab ${currentView === "budgets" ? "active" : ""}`}
          onClick={() => onViewChange("budgets")}
        >
          <Wallet size={18} />
          <span className="nav-label-full">Budgets</span>
          <span className="nav-label-short">Budget</span>
        </button>
        <button
          className={`nav-tab ${currentView === "pantry" ? "active" : ""}`}
          onClick={() => onViewChange("pantry")}
        >
          <Package size={18} />
          <span className="nav-label-full">Pantry</span>
          <span className="nav-label-short">Pantry</span>
        </button>
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

