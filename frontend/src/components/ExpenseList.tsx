/*
 * ExpenseList.jsx
 * Paginated, virtualized list of the user's expenses with search, category
 * filtering, and sorting (by date, amount, or store name). Uses TanStack
 * Virtual for windowed rendering and infinite scroll to load more pages on
 * demand. Supports inline editing, single/bulk delete with undo, select-all,
 * CSV export, and an "Add to Pantry" action for grocery-category items.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Trash2, Store, Calendar, DollarSign, Tag, Edit2, X, Check, ArrowUpDown, CheckSquare, Square, Search, Plus, Download, Loader } from "lucide-react";
import { useInfiniteExpenses, useUpdateExpense, useDeleteExpense, useBulkDeleteExpenses, usePantryItems, useUndoDelete } from "../hooks";
import { exportExpensesCsv } from "../lib/csvExport";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config/api";
import AddToPantryModal from "./AddToPantryModal";
import MixingBowlLoader from "./MixingBowlLoader";
import type { ShowToast, Expense, PantryItem } from "../types";
import "./ExpenseList.css";

interface SortConfig {
  sortBy: string;
  sortOrder: string;
}

interface EditForm {
  store?: string;
  items?: string;
  category?: string;
  amount?: number | string;
  date?: string;
}

const SORT_MAP: Record<string, SortConfig> = {
  recent: { sortBy: "date", sortOrder: "desc" },
  expensive: { sortBy: "amount", sortOrder: "desc" },
  name: { sortBy: "store", sortOrder: "asc" },
};

interface Props {
  showToast: ShowToast;
}

const ExpenseList: React.FC<Props> = ({ showToast }) => {
  const { getToken } = useAuth();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({});
  const [sortBy, setSortBy] = useState<string>("recent");
  const [selectedExpenses, setSelectedExpenses] = useState<Set<number>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [pantryModalExpense, setPantryModalExpense] = useState<Expense | null>(null);
  const [addedToPantry, setAddedToPantry] = useState<Set<number>>(new Set());

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { sortBy: sortField, sortOrder } = SORT_MAP[sortBy] || SORT_MAP.recent;

  // Fetch expenses with infinite query
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteExpenses({
    search: debouncedSearch || undefined,
    category: categoryFilter || undefined,
    sortBy: sortField,
    sortOrder,
  });

  const expenses: Expense[] = data?.pages?.flatMap((p) => p.expenses) ?? [];
  const totalCount: number = data?.pages?.[0]?.total_count ?? 0;

  // Virtualizer setup
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: expenses.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 160,
    overscan: 5,
    measureElement: (el: Element) => el?.getBoundingClientRect().height ?? 160,
  });

  // Infinite scroll trigger
  const virtualItems = virtualizer.getVirtualItems();
  useEffect(() => {
    if (virtualItems.length === 0) return;
    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= expenses.length - 5 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualItems, expenses.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // React Query mutations
  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();
  const bulkDeleteMutation = useBulkDeleteExpenses();
  const { scheduleDelete } = useUndoDelete(showToast);
  // Fetch pantry items to check if expense items are already in pantry
  const { data: pantryItems = [] } = usePantryItems();

  // Check if an expense's items are already in the pantry
  const isExpenseInPantry = (expenseId: number): boolean => {
    return addedToPantry.has(expenseId) || (pantryItems as PantryItem[]).some((item: PantryItem) => item.source_expense_id === expenseId);
  };

  const handleAddToPantry = (expense: Expense): void => {
    if (addedToPantry.has(expense.id)) return;
    setPantryModalExpense(expense);
  };

  const handleEdit = (expense: Expense): void => {
    setEditingId(expense.id);
    setEditForm({
      store: expense.store,
      items: expense.items,
      category: expense.category || "",
      amount: expense.amount || "",
      date: expense.date
    });
  };

  const handleSaveEdit = async (id: number): Promise<void> => {
    try {
      await updateMutation.mutateAsync({ id, data: { ...editForm, amount: editForm.amount !== undefined ? Number(editForm.amount) : undefined } });
      setEditingId(null);
    } catch (error) {
      const err = error as Error;
      console.error("Error updating expense:", err);
      if (showToast) showToast(`Failed to update expense: ${err.message || "Unknown error"}`, "error");
    }
  };

  const handleCancelEdit = (): void => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = (id: number): void => {
    scheduleDelete({
      id,
      queryKeyPrefix: ["expenses"],
      filterFn: (item: Record<string, unknown>) => item.id !== id,
      dataKey: "expenses",
      onDelete: async () => {
        try {
          await deleteMutation.mutateAsync(id);
        } catch (error) {
          console.error("Error deleting expense:", error);
          if (showToast) showToast("Error deleting expense", "error");
        }
      },
      message: "Expense deleted",
    });
  };

  const handleCategoryClick = (category: string): void => {
    setCategoryFilter(prev => prev === category ? null : category);
  };

  const clearFilters = (): void => {
    setSearchQuery("");
    setCategoryFilter(null);
  };

  const toggleSelectMode = (): void => {
    setIsSelectMode(!isSelectMode);
    setSelectedExpenses(new Set());
  };

  const toggleExpenseSelection = (expenseId: number): void => {
    const newSelected = new Set(selectedExpenses);
    if (newSelected.has(expenseId)) {
      newSelected.delete(expenseId);
    } else {
      newSelected.add(expenseId);
    }
    setSelectedExpenses(newSelected);
  };

  const toggleSelectAll = (): void => {
    if (selectedExpenses.size === expenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(expenses.map(e => e.id)));
    }
  };

  const handleBulkDelete = (): void => {
    if (selectedExpenses.size === 0) {
      if (showToast) showToast("Please select expenses to delete", "warning");
      return;
    }
    const idsToDelete = Array.from(selectedExpenses);
    const idSet = new Set(idsToDelete);
    const count = idsToDelete.length;
    setSelectedExpenses(new Set());
    setIsSelectMode(false);

    scheduleDelete({
      id: `bulk-expenses-${Date.now()}`,
      queryKeyPrefix: ["expenses"],
      filterFn: (item: Record<string, unknown>) => !idSet.has(item.id as number),
      dataKey: "expenses",
      onDelete: async () => {
        try {
          await bulkDeleteMutation.mutateAsync(idsToDelete);
        } catch (error) {
          const err = error as Error;
          console.error("Error deleting expenses:", err);
          if (showToast) showToast(`Failed to delete expenses: ${err.message || "Unknown error"}`, "error");
        }
      },
      message: `${count} expense(s) deleted`,
    });
  };

  const handleBulkEdit = (): void => {
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

  const handleExportCsv = async (): Promise<void> => {
    try {
      const token = await getToken();
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

  if (isLoading && !data) {
    return (
      <div className="expense-list">
        <h2>Recent Expenses</h2>
        <MixingBowlLoader size="lg" label="Loading expenses..." />
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
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
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value)}
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

      {/* Virtualized scroll container */}
      <div ref={scrollContainerRef} className="expenses-scroll-container">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const expense = expenses[virtualRow.index];
            if (!expense) return null;
            return (
              <div
                key={expense.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className={`expense-card ${selectedExpenses.has(expense.id) ? 'selected' : ''}`}>
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
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, store: e.target.value})}
                        />
                      </div>
                      <div className="edit-form-group">
                        <label>Items</label>
                        <input
                          type="text"
                          placeholder="Items purchased"
                          value={editForm.items}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, items: e.target.value})}
                        />
                      </div>
                      <div className="edit-form-group">
                        <label>Category</label>
                        <input
                          type="text"
                          placeholder="Category (e.g., Groceries, Electronics)"
                          value={editForm.category}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, category: e.target.value})}
                        />
                      </div>
                      <div className="edit-form-group">
                        <label>Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={editForm.amount}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, amount: e.target.value})}
                        />
                      </div>
                      <div className="edit-form-group">
                        <label>Date</label>
                        <input
                          type="date"
                          value={editForm.date}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, date: e.target.value})}
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
                              <span>${parseFloat(String(expense.amount)).toFixed(2)}</span>
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
              </div>
            );
          })}
        </div>

        {/* Loading spinner at bottom */}
        {isFetchingNextPage && (
          <div className="infinite-scroll-loading">
            <Loader size={20} className="spinner" />
            <span>Loading more...</span>
          </div>
        )}
      </div>

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
          }}
        />
      )}
    </div>
  );
};

export default ExpenseList;
