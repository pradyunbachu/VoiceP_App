import { useState, useMemo } from "react";
import { Trash2, Store, Calendar, DollarSign, Tag, Edit2, X, Check, ArrowUpDown } from "lucide-react";
import "./ExpenseList.css";

const ExpenseList = ({ expenses, onExpenseDeleted, onExpenseUpdated, token }) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sortBy, setSortBy] = useState("recent"); // "recent", "expensive", "name"
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
      } else {
        const error = await response.json();
        alert(`Failed to update expense: ${error.detail || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error updating expense:", error);
      alert("Error updating expense");
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
        onExpenseDeleted();
      } else {
        alert("Failed to delete expense");
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      alert("Error deleting expense");
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
      <div className="expenses-container">
        {sortedExpenses.map((expense) => (
          <div key={expense.id} className="expense-card">
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
                <div className="expense-header">
                  <div className="expense-store">
                    <Store size={18} />
                    <span>{expense.store}</span>
                  </div>
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
