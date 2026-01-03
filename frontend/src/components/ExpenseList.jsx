import { useState, useEffect } from "react";
import { Trash2, Store, Calendar, DollarSign, Tag, Edit2, X, Check, Search, Filter, ArrowUpDown, XCircle } from "lucide-react";
import { CATEGORIES } from "../constants/categories";
import LoadingSkeleton from "./LoadingSkeleton";
import "./ExpenseList.css";

const ExpenseList = ({ expenses: initialExpenses, onExpenseDeleted, onExpenseUpdated, token, onExpensesChange, showToast }) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [expenses, setExpenses] = useState(initialExpenses || []);
  const [loading, setLoading] = useState(false);
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    category: "",
    store: "",
    minAmount: "",
    maxAmount: "",
    startDate: "",
    endDate: "",
  });
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");

  // Fetch expenses with filters
  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      
      if (searchQuery) params.append("search", searchQuery);
      if (filters.category) params.append("category", filters.category);
      if (filters.store) params.append("store", filters.store);
      if (filters.minAmount) params.append("min_amount", filters.minAmount);
      if (filters.maxAmount) params.append("max_amount", filters.maxAmount);
      if (filters.startDate) params.append("start_date", filters.startDate);
      if (filters.endDate) params.append("end_date", filters.endDate);
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);

      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(`http://localhost:8000/api/expenses?${params.toString()}`, {
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setExpenses(data.expenses || []);
        if (onExpensesChange) {
          onExpensesChange(data.expenses || []);
        }
      } else {
        throw new Error("Failed to fetch expenses");
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchExpenses();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, sortBy, sortOrder]);

  // Update when initialExpenses changes
  useEffect(() => {
    if (initialExpenses) {
      setExpenses(initialExpenses);
    }
  }, [initialExpenses]);

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
        fetchExpenses();
        if (onExpenseUpdated) {
          onExpenseUpdated();
        }
        if (showToast) {
          showToast("Expense updated successfully", "success");
        }
      } else {
        const error = await response.json();
        const errorMsg = error.detail || "Failed to update expense";
        if (showToast) {
          showToast(errorMsg, "error");
        }
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error updating expense:", error);
      if (showToast && !error.message.includes("Failed to update")) {
        showToast(error.message || "Failed to update expense", "error");
      }
      throw error;
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
        fetchExpenses();
        if (onExpenseDeleted) {
          onExpenseDeleted();
        }
        if (showToast) {
          showToast("Expense deleted successfully", "success");
        }
      } else {
        const errorMsg = "Failed to delete expense";
        if (showToast) {
          showToast(errorMsg, "error");
        }
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      if (showToast && !error.message.includes("Failed to delete")) {
        showToast(error.message || "Failed to delete expense", "error");
      }
      throw error;
    }
  };

  const clearFilters = () => {
    setSearchQuery("");
    setFilters({
      category: "",
      store: "",
      minAmount: "",
      maxAmount: "",
      startDate: "",
      endDate: "",
    });
  };

  const hasActiveFilters = searchQuery || Object.values(filters).some(v => v !== "");

  // Get unique categories and stores for filter dropdowns
  const allCategories = [...new Set(expenses.flatMap(e => e.category ? e.category.split(",").map(c => c.trim()) : []))].filter(Boolean);
  const allStores = [...new Set(expenses.map(e => e.store))].filter(Boolean);

  if (loading && expenses.length === 0) {
    return (
      <div className="expense-list">
        <h2>Expenses</h2>
        <LoadingSkeleton type="card" count={5} />
      </div>
    );
  }

  return (
    <div className="expense-list">
      <div className="expense-list-header">
        <h2>Expenses {expenses.length > 0 && <span className="expense-count">({expenses.length})</span>}</h2>
      </div>

      {/* Search and Filter Bar */}
      <div className="search-filter-bar">
        <div className="search-container">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder="Search expenses by store, items, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              className="clear-search"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <XCircle size={16} />
            </button>
          )}
        </div>

        <div className="filter-controls">
          <button
            className={`filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={18} />
            <span>Filters</span>
            {hasActiveFilters && <span className="filter-badge"></span>}
          </button>

          <div className="sort-controls">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
              <option value="store">Sort by Store</option>
              <option value="created_at">Sort by Created</option>
            </select>
            <button
              className="sort-order-button"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              title={`Sort ${sortOrder === "asc" ? "Descending" : "Ascending"}`}
            >
              <ArrowUpDown size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="filter-panel">
          <div className="filter-row">
            <div className="filter-group">
              <label>Category</label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
              >
                <option value="">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Store</label>
              <select
                value={filters.store}
                onChange={(e) => setFilters({...filters, store: e.target.value})}
              >
                <option value="">All Stores</option>
                {allStores.map(store => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Min Amount</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filters.minAmount}
                onChange={(e) => setFilters({...filters, minAmount: e.target.value})}
              />
            </div>

            <div className="filter-group">
              <label>Max Amount</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={filters.maxAmount}
                onChange={(e) => setFilters({...filters, maxAmount: e.target.value})}
              />
            </div>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label>Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              />
            </div>

            <div className="filter-group">
              <label>End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button className="clear-filters-button" onClick={clearFilters}>
              <XCircle size={16} />
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {/* Expenses List */}
      {loading && expenses.length > 0 ? (
        <LoadingSkeleton type="card" count={3} />
      ) : expenses.length === 0 ? (
        <div className="empty-state-container">
          <h3>No expenses found</h3>
          <p>
            {hasActiveFilters
              ? "Try adjusting your search or filters"
              : "Record your first expense to get started!"}
          </p>
          {hasActiveFilters && (
            <button className="clear-filters-link" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="expenses-container">
          {expenses.map((expense) => (
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
      )}
    </div>
  );
};

export default ExpenseList;
