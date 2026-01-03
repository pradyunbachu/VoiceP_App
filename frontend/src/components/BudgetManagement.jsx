import { useState, useEffect } from "react";
import { DollarSign, Plus, Trash2, Edit2, Check, X, AlertTriangle, Calendar } from "lucide-react";
import { CATEGORIES } from "../constants/categories";
import LoadingSkeleton from "./LoadingSkeleton";
import "./BudgetManagement.css";

const BudgetManagement = ({ token, onBudgetChange, showToast }) => {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filterMonth, setFilterMonth] = useState(null);
  const [filterYear, setFilterYear] = useState(null);
  const [formData, setFormData] = useState({
    category: "",
    amount: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    recurring: false,
    repeatInterval: "",
    repeatUnit: "",
  });
  const [editForm, setEditForm] = useState({
    category: "",
    amount: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    recurring: false,
    repeatInterval: "",
    repeatUnit: "",
  });

  const fetchBudgets = async () => {
    setLoading(true);
    try {
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Build URL with optional month/year filters
      let url = "http://localhost:8000/api/budgets/check";
      const params = new URLSearchParams();
      if (filterMonth) params.append("month", filterMonth);
      if (filterYear) params.append("year", filterYear);
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setBudgets(data.budgets || []);
      } else {
        throw new Error("Failed to fetch budgets");
      }
    } catch (error) {
      console.error("Error fetching budgets:", error);
      if (showToast) {
        showToast("Failed to load budgets", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBudgets();
  }, [token, filterMonth, filterYear]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("http://localhost:8000/api/budgets", {
        method: "POST",
        headers,
        body: JSON.stringify({
          category: formData.category,
          amount: parseFloat(formData.amount),
          month: parseInt(formData.month),
          year: parseInt(formData.year),
          recurring: formData.repeatInterval && formData.repeatUnit,
          repeat_interval: formData.repeatInterval ? parseInt(formData.repeatInterval) : null,
          repeat_unit: formData.repeatUnit || null,
        }),
      });

      if (response.ok) {
        setShowAddForm(false);
        // Reset form to current month/year
        const now = new Date();
        setFormData({
          category: "",
          amount: "",
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          recurring: false,
        });
        fetchBudgets();
        if (onBudgetChange) {
          onBudgetChange();
        }
        if (showToast) {
          showToast("Budget created successfully", "success");
        }
      } else {
        let errorMsg = "Failed to create budget";
        try {
          const error = await response.json();
          errorMsg = error.detail || error.message || errorMsg;
        } catch (e) {
          // If response is not JSON, use status text
          errorMsg = response.statusText || `Error ${response.status}`;
        }
        if (showToast) {
          showToast(errorMsg, "error");
        }
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error creating budget:", error);
      if (showToast) {
        const errorMsg = error.message || "Failed to create budget. Please check if the database is initialized.";
        if (!error.message || !error.message.includes("Failed to create")) {
          showToast(errorMsg, "error");
        }
      }
      throw error;
    }
  };

  const handleUpdate = async (id) => {
    try {
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8000/api/budgets/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          category: editForm.category,
          amount: parseFloat(editForm.amount),
          month: parseInt(editForm.month),
          year: parseInt(editForm.year),
          recurring: editForm.repeatInterval && editForm.repeatUnit,
          repeat_interval: editForm.repeatInterval ? parseInt(editForm.repeatInterval) : null,
          repeat_unit: editForm.repeatUnit || null,
        }),
      });

      if (response.ok) {
        setEditingId(null);
        const now = new Date();
        setEditForm({
          category: "",
          amount: "",
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          recurring: false,
          repeatInterval: "",
          repeatUnit: "",
        });
        fetchBudgets();
        if (onBudgetChange) {
          onBudgetChange();
        }
        if (showToast) {
          showToast("Budget updated successfully", "success");
        }
      } else {
        const errorMsg = "Failed to update budget";
        if (showToast) {
          showToast(errorMsg, "error");
        }
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error updating budget:", error);
      if (showToast && !error.message.includes("Failed to update")) {
        showToast(error.message || "Failed to update budget", "error");
      }
      throw error;
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this budget?")) {
      return;
    }

    try {
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8000/api/budgets/${id}`, {
        method: "DELETE",
        headers,
      });

      if (response.ok) {
        fetchBudgets();
        if (onBudgetChange) {
          onBudgetChange();
        }
        if (showToast) {
          showToast("Budget deleted successfully", "success");
        }
      } else {
        const errorMsg = "Failed to delete budget";
        if (showToast) {
          showToast(errorMsg, "error");
        }
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error deleting budget:", error);
      if (showToast && !error.message.includes("Failed to delete")) {
        showToast(error.message || "Failed to delete budget", "error");
      }
      throw error;
    }
  };

  const startEdit = (budget) => {
    setEditingId(budget.id);
    setEditForm({
      category: budget.category || "",
      amount: budget.amount.toString(),
      month: budget.month,
      year: budget.year,
      recurring: budget.recurring || false,
      repeatInterval: (budget.repeat_interval || budget.repeat_interval === 0) ? budget.repeat_interval.toString() : "",
      repeatUnit: budget.repeat_unit || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    const now = new Date();
    setEditForm({
      category: "",
      amount: "",
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      recurring: false,
      repeatInterval: "",
      repeatUnit: "",
    });
  };

  const getAlertColor = (alertLevel) => {
    switch (alertLevel) {
      case "exceeded":
        return "#dc2626";
      case "warning":
        return "#eab308";
      case "caution":
        return "#f59e0b";
      default:
        return "#22c55e";
    }
  };

  const getAlertIcon = (alertLevel) => {
    if (alertLevel === "exceeded" || alertLevel === "warning") {
      return <AlertTriangle size={18} />;
    }
    return null;
  };

  const currentMonth = new Date().toLocaleString("default", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="budget-management">
        <h2>Budget Management</h2>
        <LoadingSkeleton type="card" count={3} />
      </div>
    );
  }

  return (
    <div className="budget-management">
      <div className="budget-header">
        <div>
          <h2>Budget Management</h2>
          <p className="budget-subtitle">Track your spending against monthly budgets</p>
        </div>
        <button
          className="add-budget-button"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus size={18} />
          <span>Add Budget</span>
        </button>
      </div>

      {showAddForm && (
        <form className="budget-form" onSubmit={handleCreate}>
          <h3>Create New Budget</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                required
              >
                <option value="">Select Category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Month</label>
              <select
                value={formData.month}
                onChange={(e) => setFormData({...formData, month: parseInt(e.target.value)})}
                required
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Year</label>
              <input
                type="number"
                min="2020"
                max="2100"
                value={formData.year}
                onChange={(e) => setFormData({...formData, year: parseInt(e.target.value)})}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{gridColumn: '1 / -1'}}>
              <label>Repeat Budget</label>
              <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
                <span style={{color: '#a0a0a0'}}>Every</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.repeatInterval}
                  onChange={(e) => setFormData({...formData, repeatInterval: e.target.value})}
                  placeholder="1"
                  style={{
                    width: '80px',
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontFamily: "'Ubuntu', sans-serif",
                  }}
                />
                <select
                  value={formData.repeatUnit}
                  onChange={(e) => setFormData({...formData, repeatUnit: e.target.value})}
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1rem',
                    fontFamily: "'Ubuntu', sans-serif",
                    cursor: 'pointer',
                  }}
                >
                  <option value="">No repeat</option>
                  <option value="weeks">Week(s)</option>
                  <option value="months">Month(s)</option>
                  <option value="years">Year(s)</option>
                </select>
              </div>
              {formData.repeatInterval && formData.repeatUnit && (
                <small style={{color: '#a0a0a0', marginTop: '0.5rem', display: 'block'}}>
                  This will automatically create the same budget every {formData.repeatInterval} {formData.repeatUnit}.
                </small>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="submit-button">
              <Check size={16} />
              <span>Create Budget</span>
            </button>
            <button
              type="button"
              className="cancel-button"
              onClick={() => {
                setShowAddForm(false);
        // Reset form to current month/year
        const now = new Date();
        setFormData({
          category: "",
          amount: "",
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          recurring: false,
        });
              }}
            >
              <X size={16} />
              <span>Cancel</span>
            </button>
          </div>
        </form>
      )}

      {budgets.length === 0 ? (
        <div className="empty-budget-state">
          <h3>No budgets set</h3>
          <p>Create a budget to track your spending and get alerts when you're approaching limits.</p>
        </div>
      ) : (
        <div className="budgets-list">
          {budgets.map((budget) => (
            <div key={budget.id} className="budget-card">
              {editingId === budget.id ? (
                <div className="budget-edit-form">
                  <h4 style={{color: '#ffffff', marginBottom: '1rem'}}>Edit Budget</h4>
                  <div className="edit-form-row">
                    <div className="edit-form-group">
                      <label>Category</label>
                      <select
                        value={editForm.category || ""}
                        onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                        className="edit-form-select"
                      >
                        <option value="">Select Category</option>
                        {CATEGORIES.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="edit-form-group">
                      <label>Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.amount}
                        onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                        className="edit-form-input"
                      />
                    </div>
                  </div>
                  <div className="edit-form-row">
                    <div className="edit-form-group">
                      <label>Month</label>
                      <select
                        value={editForm.month}
                        onChange={(e) => setEditForm({...editForm, month: parseInt(e.target.value)})}
                        className="edit-form-select"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="edit-form-group">
                      <label>Year</label>
                      <input
                        type="number"
                        min="2020"
                        max="2100"
                        value={editForm.year}
                        onChange={(e) => setEditForm({...editForm, year: parseInt(e.target.value)})}
                        className="edit-form-input"
                      />
                    </div>
                  </div>
                  <div className="edit-form-row">
                    <div className="edit-form-group" style={{gridColumn: '1 / -1'}}>
                      <label>Repeat Budget</label>
                      <div style={{display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap'}}>
                        <span style={{color: '#a0a0a0'}}>Every</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={editForm.repeatInterval}
                          onChange={(e) => setEditForm({...editForm, repeatInterval: e.target.value})}
                          placeholder="1"
                          className="edit-form-input"
                          style={{width: '80px'}}
                        />
                        <select
                          value={editForm.repeatUnit || ""}
                          onChange={(e) => setEditForm({...editForm, repeatUnit: e.target.value})}
                          className="edit-form-select"
                        >
                          <option value="">No repeat</option>
                          <option value="weeks">Week(s)</option>
                          <option value="months">Month(s)</option>
                          <option value="years">Year(s)</option>
                        </select>
                      </div>
                      {editForm.repeatInterval && editForm.repeatUnit && (
                        <small style={{color: '#a0a0a0', marginTop: '0.5rem', display: 'block'}}>
                          This will automatically create the same budget every {editForm.repeatInterval} {editForm.repeatUnit}.
                        </small>
                      )}
                    </div>
                  </div>
                  <div className="edit-actions">
                    <button
                      className="save-button"
                      onClick={() => handleUpdate(budget.id)}
                    >
                      <Check size={16} />
                      <span>Save</span>
                    </button>
                    <button
                      className="cancel-button"
                      onClick={cancelEdit}
                    >
                      <X size={16} />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="budget-card-header">
                    <div className="budget-category">
                      <DollarSign size={20} />
                      <span>{budget.category}</span>
                    </div>
                    <div className="budget-actions">
                      <button
                        className="edit-budget-button"
                        onClick={() => startEdit(budget)}
                        title="Edit budget"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="delete-budget-button"
                        onClick={() => handleDelete(budget.id)}
                        title="Delete budget"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="budget-stats">
                    <div className="budget-stat">
                      <span className="stat-label">Budget</span>
                      <span className="stat-value">${budget.amount.toFixed(2)}</span>
                    </div>
                    <div className="budget-stat">
                      <span className="stat-label">Spent</span>
                      <span className="stat-value spent">${budget.actual_spending.toFixed(2)}</span>
                    </div>
                    <div className="budget-stat">
                      <span className="stat-label">Remaining</span>
                      <span className={`stat-value ${budget.remaining < 0 ? "negative" : ""}`}>
                        ${budget.remaining.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="budget-progress">
                    <div className="progress-bar-container">
                      <div
                        className="progress-bar"
                        style={{
                          width: `${Math.min(budget.percentage_used, 100)}%`,
                          backgroundColor: getAlertColor(budget.alert_level),
                        }}
                      />
                    </div>
                    <div className="progress-info">
                      <span className="progress-percentage">
                        {budget.percentage_used.toFixed(1)}% used
                      </span>
                      {budget.alert_level !== "ok" && (
                        <span
                          className="alert-badge"
                          style={{ color: getAlertColor(budget.alert_level) }}
                        >
                          {getAlertIcon(budget.alert_level)}
                          {budget.alert_level === "exceeded" && " Budget Exceeded"}
                          {budget.alert_level === "warning" && " Warning: 90%+ Used"}
                          {budget.alert_level === "caution" && " Caution: 75%+ Used"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="budget-period">
                    <Calendar size={14} />
                    <span>
                      {new Date(budget.year, budget.month - 1).toLocaleString("default", {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                    {budget.recurring && budget.repeat_interval && budget.repeat_unit && (
                      <span className="recurring-badge" style={{marginLeft: '0.5rem', fontSize: '0.85rem', color: '#22c55e', fontWeight: '600'}}>
                        Repeats every {budget.repeat_interval} {budget.repeat_unit}
                      </span>
                    )}
                    {budget.actual_spending === 0 && (
                      <span className="budget-note" style={{marginLeft: '0.5rem', fontSize: '0.85rem', color: '#707070'}}>
                        (Only expenses in this month/year are counted)
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BudgetManagement;

