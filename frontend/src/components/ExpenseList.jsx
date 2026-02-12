import { useState, useEffect } from "react";
import { Trash2, Store, Calendar, DollarSign, Tag, Edit2, X, Check, ArrowUpDown, CheckSquare, Square, Search, Plus, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { useExpenses, useUpdateExpense, useDeleteExpense, useBulkDeleteExpenses, usePantryItems } from "../hooks";
import { exportExpensesCsv } from "../lib/csvExport";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config/api";
import AddToPantryModal from "./AddToPantryModal";
import LoadingSkeleton from "./LoadingSkeleton";
import "./ExpenseList.css";

const SORT_MAP = {
  recent: { sortBy: "date", sortOrder: "desc" },
  expensive: { sortBy: "amount", sortOrder: "desc" },
  name: { sortBy: "store", sortOrder: "asc" },
};

const ExpenseList = ({ showToast }) => {
  const { getToken } = useAuth();
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sortBy, setSortBy] = useState("recent");
  const [selectedExpenses, setSelectedExpenses] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [pantryModalExpense, setPantryModalExpense] = useState(null);
  const [addedToPantry, setAddedToPantry] = useState(new Set());
  const [page, setPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page on search change
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when category or sort changes
  useEffect(() => {
    setPage(1);
  }, [categoryFilter, sortBy]);

  const { sortBy: sortField, sortOrder } = SORT_MAP[sortBy] || SORT_MAP.recent;

  // Fetch expenses with pagination and server-side filtering
  const { data: expenseData, isLoading } = useExpenses({
    page,
    pageSize: 20,
    search: debouncedSearch || undefined,
    category: categoryFilter || undefined,
    sortBy: sortField,
    sortOrder,
  });

  const expenses = expenseData?.expenses || [];
  const totalCount = expenseData?.total_count ?? 0;
  const totalPages = expenseData?.total_pages ?? 1;
  const hasNext = expenseData?.has_next ?? false;
  const hasPrev = expenseData?.has_prev ?? false;

  // React Query mutations
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();
  const bulkDeleteMutation = useBulkDeleteExpenses();
  // Fetch pantry items to check if expense items are already in pantry
  const { data: pantryItems = [] } = usePantryItems();

  // Check if an expense's items are already in the pantry
  const isExpenseInPantry = (expenseId) => {
    return addedToPantry.has(expenseId) || pantryItems.some(item => item.source_expense_id === expenseId);
  };

  const handleAddToPantry = (expense) => {
    if (addedToPantry.has(expense.id)) return;
    setPantryModalExpense(expense);
  };

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
      if (showToast) showToast("Expense updated successfully", "success");
    } catch (error) {
      console.error("Error updating expense:", error);
      if (showToast) showToast(`Failed to update expense: ${error.message || "Unknown error"}`, "error");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    try {
      await deleteMutation.mutateAsync(id);
      if (showToast) showToast("Expense deleted successfully", "success");
    } catch (error) {
      console.error("Error deleting expense:", error);
      if (showToast) showToast("Error deleting expense", "error");
    }
  };

  const handleCategoryClick = (category) => {
    setCategoryFilter(prev => prev === category ? null : category);
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
    if (selectedExpenses.size === expenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(expenses.map(e => e.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedExpenses.size === 0) {
      if (showToast) showToast("Please select expenses to delete", "warning");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${selectedExpenses.size} expense(s)?`)) return;
    try {
      const result = await bulkDeleteMutation.mutateAsync(Array.from(selectedExpenses));
      setSelectedExpenses(new Set());
      setIsSelectMode(false);
      if (showToast) showToast(`${result.deleted_count || selectedExpenses.size} expense(s) deleted successfully`, "success");
    } catch (error) {
      console.error("Error deleting expenses:", error);
      if (showToast) showToast(`Failed to delete expenses: ${error.message || "Unknown error"}`, "error");
    }
  };

  const handleBulkEdit = () => {
    if (selectedExpenses.size === 0) {
      if (showToast) showToast("Please select expenses to edit", "warning");
      return;
    }
    if (selectedExpenses.size === 1) {
      const expenseId = Array.from(selectedExpenses)[0];
      const expense = expenses.find(e => e.id === expenseId);
      if (expense) {
        handleEdit(expense);
        setIsSelectMode(false);
        setSelectedExpenses(new Set());
      }
    } else {
      if (showToast) showToast("Please select only one expense to edit at a time", "warning");
    }
  };

  const handleExportCsv = async () => {
    try {
      const token = getToken();
      const urlParams = new URLSearchParams();
      urlParams.append('export', 'true');
      if (debouncedSearch) urlParams.append('search', debouncedSearch);
      if (categoryFilter) urlParams.append('category', categoryFilter);
      urlParams.append('sort_by', sortField);
      urlParams.append('sort_order', sortOrder);

      const response = await fetch(`${API_BASE_URL}/api/expenses?${urlParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch expenses for export');
      const data = await response.json();
      exportExpensesCsv(data.expenses || []);
    } catch (error) {
      console.error("Export error:", error);
      if (showToast) showToast("Failed to export expenses", "error");
    }
  };

  const allSelected = expenses.length > 0 && selectedExpenses.size === expenses.length;
  const someSelected = selectedExpenses.size > 0 && selectedExpenses.size < expenses.length;

  if (isLoading && !expenseData) {
    return (
      <div className="expense-list">
        <h2>Recent Expenses</h2>
        <LoadingSkeleton type="card" count={3} />
      </div>
    );
  }

  if (totalCount === 0 && !debouncedSearch && !categoryFilter) {
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
            <>
              <button
                className="select-mode-button"
                onClick={toggleSelectMode}
              >
                <CheckSquare size={18} />
                <span>Select</span>
              </button>
              <button
                className="select-mode-button export-button"
                onClick={handleExportCsv}
                disabled={totalCount === 0}
                title="Export filtered expenses to CSV"
              >
                <Download size={18} />
                <span>Export CSV</span>
              </button>
            </>
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
        {expenses.map((expense) => (
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
                  <div className="expense-footer-left">
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
                  {!isExpenseInPantry(expense.id) && expense.category?.toLowerCase().includes('groceries') && (
                    <button
                      className="add-to-pantry-button"
                      onClick={() => handleAddToPantry(expense)}
                      title="Add to pantry"
                    >
                      <Plus size={14} />
                      <span>Add to Pantry</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination-controls">
          <button
            className="pagination-button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={!hasPrev}
          >
            <ChevronLeft size={18} />
            <span>Prev</span>
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="pagination-button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={!hasNext}
          >
            <span>Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Empty state for search/filter with no results */}
      {expenses.length === 0 && (debouncedSearch || categoryFilter) && (
        <div className="empty-state">
          <p>No expenses match your search. Try different keywords or clear filters.</p>
          <button className="clear-filters-button" onClick={clearFilters}>Clear Filters</button>
        </div>
      )}

      {pantryModalExpense && (
        <AddToPantryModal
          expense={pantryModalExpense}
          onClose={() => setPantryModalExpense(null)}
          onSuccess={() => {
            setAddedToPantry(prev => new Set([...prev, pantryModalExpense.id]));
            if (showToast) showToast("Added to pantry successfully", "success");
          }}
        />
      )}
    </div>
  );
};

export default ExpenseList;
