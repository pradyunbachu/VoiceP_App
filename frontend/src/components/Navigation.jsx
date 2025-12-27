import { Mic, BarChart3, List } from "lucide-react";
import "./Navigation.css";

const Navigation = ({ currentView, onViewChange }) => {
  return (
    <nav className="navigation">
      <div className="nav-logo" onClick={() => onViewChange("landing")}>
        <Mic size={20} />
        <span>Voxalyze</span>
      </div>
      <div className="nav-tabs">
        <button
          className={`nav-tab ${currentView === "record" ? "active" : ""}`}
          onClick={() => onViewChange("record")}
        >
          <Mic size={18} />
          <span>Record Expense</span>
        </button>
        <button
          className={`nav-tab ${currentView === "dashboard" ? "active" : ""}`}
          onClick={() => onViewChange("dashboard")}
        >
          <BarChart3 size={18} />
          <span>Dashboard</span>
        </button>
        <button
          className={`nav-tab ${currentView === "expenses" ? "active" : ""}`}
          onClick={() => onViewChange("expenses")}
        >
          <List size={18} />
          <span>Expenses</span>
        </button>
      </div>
    </nav>
  );
};

export default Navigation;

