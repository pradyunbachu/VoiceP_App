import { useState, useMemo } from "react";
import { Trash2, Store, Calendar, DollarSign, Tag, Edit2, X, Check, ArrowUpDown, CheckSquare, Square } from "lucide-react";
import "./ExpenseList.css";

const ExpenseList = ({ expenses, onExpenseDeleted, onExpenseUpdated, token, showToast }) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sortBy, setSortBy] = useState("recent"); // "recent", "expensive", "name"
  const [selectedExpenses, setSelectedExpenses] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const handleEdit = (expense) => {
    setEditingId(expense.id);
    setEditForm({
      store: expense.store,
      items: expense.items,
      category: expense.category || "",
      amount: expense.amount || "",
      date: expense.date
    });
  };

  const handleSaveEdit = async (id) => {
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8000/api/expenses/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(editForm)
      });

      if (response.ok) {
        setEditingId(null);
        if (onExpenseUpdated) {
          onExpenseUpdated();
        }
        if (showToast) {
          showToast("Expense updated successfully", "success");
        }
      } else {
        const error = await response.json();
        if (showToast) {
          showToast(`Failed to update expense: ${error.detail || "Unknown error"}`, "error");
        }
      }
    } catch (error) {
      console.error("Error updating expense:", error);
      if (showToast) {
        showToast("Error updating expense", "error");
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) {
      return;
    }

    try {
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`http://localhost:8000/api/expenses/${id}`, {
        method: "DELETE",
        headers,
      });

      if (response.ok) {
        if (onExpenseDeleted) {
          onExpenseDeleted();
        }
        if (showToast) {
          showToast("Expense deleted successfully", "success");
        }
      } else {
        if (showToast) {
          showToast("Failed to delete expense", "error");
        }
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      if (showToast) {
        showToast("Error deleting expense", "error");
      }
    }
  };

  // Sort expenses based on selected option
  const sortedExpenses = useMemo(() => {
    const expensesCopy = [...expenses];
    
    switch (sortBy) {
      case "recent":
        // Sort by date (newest first)
        return expensesCopy.sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB - dateA; // Newest first
        });
      
      case "expensive":
        // Sort by amount (highest first)
        return expensesCopy.sort((a, b) => {
          const amountA = parseFloat(a.amount) || 0;
          const amountB = parseFloat(b.amount) || 0;
          return amountB - amountA; // Highest first
        });
      
      case "name":
        // Sort by store name (alphabetical)
        return expensesCopy.sort((a, b) => {
          const nameA = (a.store || "").toLowerCase();
          const nameB = (b.store || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });
      
      default:
        return expensesCopy;
    }
  }, [expenses, sortBy]);

  // Toggle select mode
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedExpenses(new Set());
  };

  // Toggle individual expense selection
  const toggleExpenseSelection = (expenseId) => {
    const newSelected = new Set(selectedExpenses);
    if (newSelected.has(expenseId)) {
      newSelected.delete(expenseId);
    } else {
      newSelected.add(expenseId);
    }
    setSelectedExpenses(newSelected);
  };

  // Select/deselect all
  const toggleSelectAll = () => {
    if (selectedExpenses.size === sortedExpenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(sortedExpenses.map(e => e.id)));
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedExpenses.size === 0) {
      if (showToast) {
        showToast("Please select expenses to delete", "warning");
      }
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedExpenses.size} expense(s)?`)) {
      return;
    }

    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8000/api/expenses/bulk`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ expense_ids: Array.from(selectedExpenses) })
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedExpenses(new Set());
        setIsSelectMode(false);
        if (onExpenseDeleted) {
          onExpenseDeleted();
        }
        if (showToast) {
          showToast(`${data.deleted_count || selectedExpenses.size} expense(s) deleted successfully`, "success");
        }
      } else {
        const error = await response.json();
        if (showToast) {
          showToast(`Failed to delete expenses: ${error.detail || "Unknown error"}`, "error");
        }
      }
    } catch (error) {
      console.error("Error deleting expenses:", error);
      if (showToast) {
        showToast("Error deleting expenses", "error");
      }
    }
  };

  // Bulk edit (opens edit form for first selected expense)
  const handleBulkEdit = () => {
    if (selectedExpenses.size === 0) {
      if (showToast) {
        showToast("Please select expenses to edit", "warning");
      }
      return;
    }

    if (selectedExpenses.size === 1) {
      const expenseId = Array.from(selectedExpenses)[0];
      const expense = sortedExpenses.find(e => e.id === expenseId);
      if (expense) {
        handleEdit(expense);
        setIsSelectMode(false);
        setSelectedExpenses(new Set());
      }
    } else {
      if (showToast) {
        showToast("Please select only one expense to edit at a time", "warning");
      }
    }
  };

  const allSelected = sortedExpenses.length > 0 && selectedExpenses.size === sortedExpenses.length;
  const someSelected = selectedExpenses.size > 0 && selectedExpenses.size < sortedExpenses.length;

  if (expenses.length === 0) {
    return (
      <div className="expense-list">
        <h2>Recent Expenses</h2>
        <p className="empty-state">
          No expenses yet. Record your first purchase!
        </p>
      </div>
    );
  }

  return (
    <div className="expense-list">
      <div className="expense-list-header">
        <h2>Recent Expenses</h2>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          {isSelectMode && (
            <div className="bulk-actions">
              <button
                className="bulk-action-button"
                onClick={handleBulkDelete}
                disabled={selectedExpenses.size === 0}
              >
                <Trash2 size={16} />
                <span>Delete Selected ({selectedExpenses.size})</span>
              </button>
              <button
                className="bulk-action-button"
                onClick={handleBulkEdit}
                disabled={selectedExpenses.size === 0}
              >
                <Edit2 size={16} />
                <span>Edit Selected</span>
              </button>
              <button
                className="bulk-action-button cancel"
                onClick={toggleSelectMode}
              >
                <X size={16} />
                <span>Cancel</span>
              </button>
            </div>
          )}
          {!isSelectMode && (
            <button
              className="select-mode-button"
              onClick={toggleSelectMode}
            >
              <CheckSquare size={18} />
              <span>Select</span>
            </button>
          )}
          <div className="sort-controls">
            <ArrowUpDown size={18} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="recent">Sort by Recent</option>
              <option value="expensive">Sort by Expensive</option>
              <option value="name">Sort by Name</option>
            </select>
          </div>
        </div>
      </div>
      {isSelectMode && (
        <div className="select-all-controls">
          <button
            className="select-all-button"
            onClick={toggleSelectAll}
          >
            {allSelected ? <CheckSquare size={18} /> : <Square size={18} />}
            <span>{allSelected ? "Deselect All" : "Select All"}</span>
            {someSelected && <span className="selection-count">({selectedExpenses.size} selected)</span>}
          </button>
        </div>
      )}
      <div className="expenses-container">
        {sortedExpenses.map((expense) => (
          <div key={expense.id} className={`expense-card ${selectedExpenses.has(expense.id) ? 'selected' : ''}`}>
            {isSelectMode && (
              <div className="expense-checkbox">
                <button
                  className="checkbox-button"
                  onClick={() => toggleExpenseSelection(expense.id)}
                >
                  {selectedExpenses.has(expense.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              </div>
            )}
            {editingId === expense.id ? (
              <div className="edit-form">
                <div className="edit-form-group">
                  <label>Store</label>
                  <input
                    type="text"
                    placeholder="Store name"
                    value={editForm.store}
                    onChange={(e) => setEditForm({...editForm, store: e.target.value})}
                  />
                </div>
                <div className="edit-form-group">
                  <label>Items</label>
                  <input
                    type="text"
                    placeholder="Items purchased"
                    value={editForm.items}
                    onChange={(e) => setEditForm({...editForm, items: e.target.value})}
                  />
                </div>
                <div className="edit-form-group">
                  <label>Category</label>
                  <input
                    type="text"
                    placeholder="Category (e.g., Groceries, Electronics)"
                    value={editForm.category}
                    onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                  />
                </div>
                <div className="edit-form-group">
                  <label>Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({...editForm, amount: e.target.value})}
                  />
                </div>
                <div className="edit-form-group">
                  <label>Date</label>
                  <input
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                  />
                </div>
                <div className="edit-actions">
                  <button className="save-button" onClick={() => handleSaveEdit(expense.id)}>
                    <Check size={16} />
                    <span>Save</span>
                  </button>
                  <button className="cancel-button" onClick={handleCancelEdit}>
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="expense-header" style={{ paddingLeft: isSelectMode ? '3rem' : '0' }}>
                  <div className="expense-store">
                    <Store size={18} />
                    <span>{expense.store}</span>
                  </div>
                  {!isSelectMode && (
                    <div className="expense-actions">
                      <button
                        className="edit-button"
                        onClick={() => handleEdit(expense)}
                        aria-label="Edit expense"
                        title="Edit expense"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="delete-button"
                        onClick={() => handleDelete(expense.id)}
                        aria-label="Delete expense"
                        title="Delete expense"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="expense-items">
                  <p>{expense.items}</p>
                </div>

                {expense.category && (
                  <div className="expense-categories">
                    {expense.category.split(",").map((cat, index) => (
                      <div key={index} className="expense-category">
                        <Tag size={14} />
                        <span>{cat.trim()}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="expense-footer">
                  {expense.amount && (
                    <div className="expense-amount">
                      <DollarSign size={16} />
                      <span>${parseFloat(expense.amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="expense-date">
                    <Calendar size={16} />
                    <span>{expense.date}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpenseList;
