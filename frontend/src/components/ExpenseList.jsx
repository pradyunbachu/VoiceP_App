import { useState, useMemo } from "react";
import { Trash2, Store, Calendar, DollarSign, Tag, Edit2, X, Check, ArrowUpDown, CheckSquare, Square, Search } from "lucide-react";
import { useUpdateExpense, useDeleteExpense, useBulkDeleteExpenses } from "../hooks";
import "./ExpenseList.css";

const ExpenseList = ({ expenses, showToast }) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sortBy, setSortBy] = useState("recent");
  const [selectedExpenses, setSelectedExpenses] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(null);

  // React Query mutations
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();
  const bulkDeleteMutation = useBulkDeleteExpenses();

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
      await updateMutation.mutateAsync({ id, data: editForm });
      setEditingId(null);
      if (showToast) {
        showToast("Expense updated successfully", "success");
      }
    } catch (error) {
      console.error("Error updating expense:", error);
      if (showToast) {
        showToast(`Failed to update expense: ${error.message || "Unknown error"}`, "error");
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
      await deleteMutation.mutateAsync(id);
      if (showToast) {
        showToast("Expense deleted successfully", "success");
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      if (showToast) {
        showToast("Error deleting expense", "error");
      }
    }
  };

  // Filter and sort expenses based on search, category, and sort option
  const sortedExpenses = useMemo(() => {
    let filtered = [...expenses];

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(expense =>
        (expense.store || "").toLowerCase().includes(query) ||
        (expense.items || "").toLowerCase().includes(query) ||
        (expense.category || "").toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (categoryFilter) {
      filtered = filtered.filter(expense =>
        (expense.category || "").toLowerCase().includes(categoryFilter.toLowerCase())
      );
    }

    switch (sortBy) {
      case "recent":
        return filtered.sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          return dateB - dateA;
        });

      case "expensive":
        return filtered.sort((a, b) => {
          const amountA = parseFloat(a.amount) || 0;
          const amountB = parseFloat(b.amount) || 0;
          return amountB - amountA;
        });

      case "name":
        return filtered.sort((a, b) => {
          const nameA = (a.store || "").toLowerCase();
          const nameB = (b.store || "").toLowerCase();
          return nameA.localeCompare(nameB);
        });

      default:
        return filtered;
    }
  }, [expenses, sortBy, searchQuery, categoryFilter]);

  const handleCategoryClick = (category) => {
    if (categoryFilter === category) {
      setCategoryFilter(null);
    } else {
      setCategoryFilter(category);
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter(null);
  };

  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode);
    setSelectedExpenses(new Set());
  };

  const toggleExpenseSelection = (expenseId) => {
    const newSelected = new Set(selectedExpenses);
    if (newSelected.has(expenseId)) {
      newSelected.delete(expenseId);
    } else {
      newSelected.add(expenseId);
    }
    setSelectedExpenses(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedExpenses.size === sortedExpenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(sortedExpenses.map(e => e.id)));
    }
  };

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
      const result = await bulkDeleteMutation.mutateAsync(Array.from(selectedExpenses));
      setSelectedExpenses(new Set());
      setIsSelectMode(false);
      if (showToast) {
        showToast(`${result.deleted_count || selectedExpenses.size} expense(s) deleted successfully`, "success");
      }
    } catch (error) {
      console.error("Error deleting expenses:", error);
      if (showToast) {
        showToast(`Failed to delete expenses: ${error.message || "Unknown error"}`, "error");
      }
    }
  };

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
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {(searchQuery || categoryFilter) && (
            <button className="clear-filters-button" onClick={clearFilters}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      {categoryFilter && (
        <div className="active-filter">
          <span>Filtering by: <strong>{categoryFilter}</strong></span>
          <button onClick={() => setCategoryFilter(null)}>
            <X size={14} />
          </button>
        </div>
      )}
      <div className="expense-controls">
        <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
          {isSelectMode && (
            <div className="bulk-actions">
              <button
                className="bulk-action-button"
                onClick={handleBulkDelete}
                disabled={selectedExpenses.size === 0 || bulkDeleteMutation.isPending}
              >
                <Trash2 size={16} />
                <span>{bulkDeleteMutation.isPending ? "Deleting..." : `Delete Selected (${selectedExpenses.size})`}</span>
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
                  <button
                    className="save-button"
                    onClick={() => handleSaveEdit(expense.id)}
                    disabled={updateMutation.isPending}
                  >
                    <Check size={16} />
                    <span>{updateMutation.isPending ? "Saving..." : "Save"}</span>
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
                        disabled={deleteMutation.isPending}
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
                      <button
                        key={index}
                        className={`expense-category ${categoryFilter === cat.trim() ? 'active' : ''}`}
                        onClick={() => handleCategoryClick(cat.trim())}
                        title={`Filter by ${cat.trim()}`}
                      >
                        <Tag size={14} />
                        <span>{cat.trim()}</span>
                      </button>
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
