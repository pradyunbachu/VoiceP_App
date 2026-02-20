/**
 * Pantry.jsx - Main pantry management component for Voxal.
 *
 * Provides two view modes (shelf with drag-and-drop, list with infinite scroll),
 * CRUD operations for pantry items, bulk actions, filtering/sorting, CSV export,
 * and an auto-recategorize feature that deduplicates items and backfills dates.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Package,
  Plus,
  Check,
  X,
  AlertTriangle,
  CheckCircle,
  Circle,
  Calendar,
  Trash2,
  LayoutGrid,
  List,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import {
  usePantryItems,
  usePantryStats,
  useInfinitePantryItems,
  useContainerColumns,
  useCreatePantryItem,
  useUpdatePantryItem,
  useUpdatePantryStatus,
  useDeletePantryItem,
  useBulkDeletePantryItems,
  useBackfillDates,
  useUndoDelete,
} from "../hooks";
import { exportPantryCsv } from "../lib/csvExport";
import { detectCategory, isPantryItem } from "../lib/categoryDetection";
import LoadingSkeleton from "./LoadingSkeleton";
import PantryFilters from "./PantryFilters";
import PantryBulkActions from "./PantryBulkActions";
import PantryShelfView from "./PantryShelfView";
import PantryListView from "./PantryListView";
import "./Pantry.css";

const Pantry = ({ showToast }) => {
  // View mode state
  const [viewMode, setViewMode] = useState("shelf"); // 'shelf' or 'list'

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    quantity: 1,
    unit: "",
    category: "Other",
    expiration_date: "",
    purchase_date: new Date().toISOString().split("T")[0],
    stock_status: "full",
    notes: ""
  });
  const [editForm, setEditForm] = useState({});

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState("asc");

  // Selection state (for bulk operations)
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Debounce search input by 300ms to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Shelf view fetches all items at once (no pagination) because
  // dnd-kit requires all draggable items to be in the DOM simultaneously.
  const { data: shelfItems = [], isLoading: shelfLoading } = usePantryItems({
    category: categoryFilter || undefined,
    stock_status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  // List view uses cursor-based infinite scrolling for better performance
  // with large pantries -- pages are fetched as the user scrolls down.
  const {
    data: listInfiniteData,
    isLoading: listLoading,
    fetchNextPage: listFetchNextPage,
    hasNextPage: listHasNextPage,
    isFetchingNextPage: listIsFetchingNextPage,
  } = useInfinitePantryItems({
    category: categoryFilter || undefined,
    stock_status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  // Flatten all loaded infinite-scroll pages into a single array
  const listItems = listInfiniteData?.pages?.flatMap((p) => p.items) ?? [];

  // Unify data/loading behind the active view mode so the rest of the
  // component can reference `items` and `loading` without branching.
  const items = viewMode === 'shelf' ? shelfItems : listItems;
  const loading = viewMode === 'shelf' ? shelfLoading : listLoading;

  const { data: stats } = usePantryStats();

  // Mutations
  const createMutation = useCreatePantryItem();
  const updateMutation = useUpdatePantryItem();
  const statusMutation = useUpdatePantryStatus();
  const deleteMutation = useDeletePantryItem();
  const bulkDeleteMutation = useBulkDeletePantryItems();
  const backfillDatesMutation = useBackfillDates();
  const { scheduleDelete } = useUndoDelete(showToast);

  // Server-side filtering has already been applied via query params,
  // so no additional client-side filtering is needed.
  const filteredItems = items;

  // Dynamically compute how many columns fit in the container
  // (280px min card width, 16px gap) for responsive grid virtualization.
  const { columnCount, containerRef: gridContainerRef } = useContainerColumns(280, 16);
  const listScrollRef = useRef(null);

  // Merge the virtualizer scroll ref and the column-measuring ref
  // so both libraries can observe the same scroll container.
  const setListScrollRef = useCallback((node) => {
    listScrollRef.current = node;
    gridContainerRef(node);
  }, [gridContainerRef]);

  // Chunk flat item list into rows of `columnCount` for grid virtualization
  const rows = useMemo(() => {
    const result = [];
    for (let i = 0; i < listItems.length; i += columnCount) {
      result.push(listItems.slice(i, i + columnCount));
    }
    return result;
  }, [listItems, columnCount]);

  const listVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 280,
    overscan: 3,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 280,
  });

  // Trigger the next page fetch when the user scrolls near the bottom.
  // Fires when the last visible virtual row is within 2 rows of the end.
  const listVirtualItems = listVirtualizer.getVirtualItems();
  useEffect(() => {
    if (viewMode !== 'list' || listVirtualItems.length === 0) return;
    const lastRow = listVirtualItems[listVirtualItems.length - 1];
    if (lastRow.index >= rows.length - 2 && listHasNextPage && !listIsFetchingNextPage) {
      listFetchNextPage();
    }
  }, [viewMode, listVirtualItems, rows.length, listHasNextPage, listIsFetchingNextPage, listFetchNextPage]);

  // Group items by category for the shelf view. We initialize every
  // known category (even empty ones) so empty shelves render as
  // valid drag-and-drop targets.
  const itemsByCategory = useMemo(() => {
    const grouped = {};
    PANTRY_CATEGORIES.forEach(cat => {
      grouped[cat] = [];
    });
    filteredItems.forEach(item => {
      const cat = item.category || "Other";
      if (grouped[cat]) {
        grouped[cat].push(item);
      } else {
        // Fall back to "Other" for unrecognized categories
        grouped["Other"].push(item);
      }
    });
    return Object.entries(grouped);
  }, [filteredItems]);

  // Configure dnd-kit sensors: pointer requires 5px movement to
  // distinguish drags from clicks; keyboard sensor for accessibility.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // When a shelf item is dropped on a different category shelf,
  // persist the category change via an optimistic mutation.
  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over) return;

    const draggedItemId = active.id;
    const targetCategory = over.id;

    // Find the dragged item
    const draggedItem = items.find((item) => item.id === draggedItemId);
    if (!draggedItem) return;

    // If dropped on the same category, do nothing
    if (draggedItem.category === targetCategory) return;

    // Update the category (optimistic update happens in mutation)
    updateMutation.mutate(
      { id: draggedItemId, data: { ...draggedItem, category: targetCategory } },
      {
        onSuccess: () => {},
        onError: () => {
          if (showToast) showToast("Error updating item category", "error");
        },
      }
    );
  };

  // Create a new pantry item from the add-item form and reset form fields
  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(formData);
      setShowAddForm(false);
      setFormData({
        name: "",
        quantity: 1,
        unit: "",
        category: "Other",
        expiration_date: "",
        purchase_date: new Date().toISOString().split("T")[0],
        stock_status: "full",
        notes: ""
      });
    } catch (error) {
      console.error("Error creating item:", error);
      if (showToast) showToast(error.message || "Error adding item to pantry", "error");
    }
  };

  // Persist edits to an existing pantry item
  const handleUpdate = async (id) => {
    try {
      await updateMutation.mutateAsync({ id, data: editForm });
      setEditingId(null);
      setEditForm({});
    } catch (error) {
      console.error("Error updating item:", error);
      if (showToast) showToast(error.message || "Error updating item", "error");
    }
  };

  // Soft-delete with undo: optimistically removes from cache and
  // defers the real API call until the undo window expires.
  const handleDelete = (id) => {
    scheduleDelete({
      id,
      queryKeyPrefix: ["pantry"],
      filterFn: (item) => item.id !== id,
      dataKey: null,
      onDelete: async () => {
        try {
          await deleteMutation.mutateAsync(id);
        } catch (error) {
          console.error("Error deleting item:", error);
          if (showToast) showToast("Error deleting item", "error");
        }
      },
      message: "Item deleted",
    });
  };

  // Remove item from pantry (keeps the expense)
  const handleRemoveFromPantry = (id) => {
    scheduleDelete({
      id,
      queryKeyPrefix: ["pantry"],
      filterFn: (item) => item.id !== id,
      dataKey: null,
      onDelete: async () => {
        try {
          await deleteMutation.mutateAsync(id);
        } catch (error) {
          console.error("Error removing item:", error);
          if (showToast) showToast("Error removing item", "error");
        }
      },
      message: "Item removed from pantry",
    });
  };

  const handleStatusChange = (id, newStatus) => {
    statusMutation.mutate({ id, status: newStatus });
  };

  // Delete all currently selected items at once via undo-able bulk delete
  const handleBulkDelete = () => {
    if (selectedItems.size === 0) {
      if (showToast) showToast("Please select items to delete", "warning");
      return;
    }

    const idsToDelete = Array.from(selectedItems);
    const idSet = new Set(idsToDelete);
    const count = idsToDelete.length;
    setSelectedItems(new Set());

    scheduleDelete({
      id: `bulk-pantry-${Date.now()}`,
      queryKeyPrefix: ["pantry"],
      filterFn: (item) => !idSet.has(item.id),
      dataKey: null,
      onDelete: async () => {
        try {
          await bulkDeleteMutation.mutateAsync(idsToDelete);
        } catch (error) {
          console.error("Error bulk deleting:", error);
          if (showToast) showToast("Error deleting items", "error");
        }
      },
      message: `${count} item(s) deleted`,
    });
  };

  // Recategorize performs a two-pass cleanup of the pantry:
  //   Pass 1 - Deduplicates items with the same name (merges quantities).
  //   Pass 2 - Moves "Other" items to their detected category, merging
  //            with any existing item on the target shelf.
  // Afterwards, backfills missing purchase/expiration dates on the server.
  const handleRecategorize = () => {
    let mergedCount = 0;
    let movedCount = 0;

    // --- Pass 1: Deduplicate within every shelf (e.g. two "Bananas" both in Produce) ---
    // canonical keeps the first item per lowercase name; duplicates get merged into it
    const canonical = {};
    shelfItems.forEach((item) => {
      const key = item.name.toLowerCase().trim();
      if (!canonical[key]) {
        canonical[key] = { ...item };
      } else {
        // Duplicate — merge quantity into canonical and delete this one
        mergedCount++;
        canonical[key].quantity = (canonical[key].quantity || 1) + (item.quantity || 1);
        updateMutation.mutate(
          { id: canonical[key].id, data: { ...canonical[key] } },
          {
            onError: () => {
              if (showToast) showToast(`Error merging ${item.name}`, "error");
            },
          }
        );
        deleteMutation.mutate(item.id, {
          onError: () => {
            if (showToast) showToast(`Error removing duplicate ${item.name}`, "error");
          },
        });
      }
    });

    // --- Pass 2: Re-categorize "Other" items and merge if target shelf already has one ---
    const otherItems = Object.values(canonical).filter((item) => item.category === "Other");
    otherItems.forEach((item) => {
      const newCategory = detectCategory(item.name);
      if (newCategory === "Other") return;

      const key = item.name.toLowerCase().trim();
      // Check if an item with the same name already lives in a non-Other shelf
      const existing = Object.values(canonical).find(
        (c) => c.id !== item.id && c.name.toLowerCase().trim() === key && c.category !== "Other"
      );

      if (existing) {
        // Merge into the existing non-Other item
        mergedCount++;
        existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
        updateMutation.mutate(
          { id: existing.id, data: { ...existing } },
          {
            onError: () => {
              if (showToast) showToast(`Error merging ${item.name}`, "error");
            },
          }
        );
        deleteMutation.mutate(item.id, {
          onError: () => {
            if (showToast) showToast(`Error removing duplicate ${item.name}`, "error");
          },
        });
        delete canonical[key];
      } else {
        // Just move the category
        movedCount++;
        item.category = newCategory;
        updateMutation.mutate(
          { id: item.id, data: { ...item, category: newCategory } },
          {
            onError: () => {
              if (showToast) showToast(`Error re-categorizing ${item.name}`, "error");
            },
          }
        );
      }
    });

    const total = movedCount + mergedCount;
    if (total > 0) {
      const parts = [];
      if (movedCount > 0) parts.push(`${movedCount} re-categorized`);
      if (mergedCount > 0) parts.push(`${mergedCount} merged`);
      if (showToast) showToast(`${total} item(s) updated: ${parts.join(", ")}`, "success");
    }

    // Backfill missing dates and clear bogus expirations on non-food items
    backfillDatesMutation.mutate(undefined, {
      onSuccess: (result) => {
        const filled = (result.purchase_filled || 0) + (result.expiration_filled || 0) + (result.expiration_cleared || 0);
        if (filled > 0) {
          const dateParts = [];
          if (result.purchase_filled > 0) dateParts.push(`${result.purchase_filled} purchase date(s) added`);
          if (result.expiration_filled > 0) dateParts.push(`${result.expiration_filled} expiration(s) updated`);
          if (result.expiration_cleared > 0) dateParts.push(`${result.expiration_cleared} non-food expiration(s) cleared`);
          if (showToast) showToast(dateParts.join(", "), "success");
        } else if (total === 0) {
          if (showToast) showToast("All items are up to date", "success");
        }
      },
      onError: () => {
        if (showToast) showToast("Error backfilling dates", "error");
      },
    });
  };

  // Recategorize is always available — it deduplicates, re-categorizes,
  // and resyncs all expiration dates so predicted shelf lives stay accurate.

  // Populate the edit form with the selected item's current values
  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit || "",
      category: item.category || "Other",
      expiration_date: item.expiration_date || "",
      purchase_date: item.purchase_date || "",
      stock_status: item.stock_status || "full",
      notes: item.notes || "",
      expiration_predicted: item.expiration_predicted || false
    });
  };

  // Toggle an item's membership in the bulk-selection set
  const toggleItemSelection = (id) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  return (
    <div className="pantry">
      {/* Header */}
      <div className="pantry-header">
        <div>
          <h2><Package size={28} /> My Pantry</h2>
          <p className="pantry-subtitle">Track your groceries and household items</p>
        </div>
        <div className="header-actions">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'shelf' ? 'active' : ''}`}
              onClick={() => setViewMode('shelf')}
              title="Shelf View"
            >
              <LayoutGrid size={18} />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <List size={18} />
            </button>
          </div>
          <button
            className="export-pantry-button"
            onClick={() => exportPantryCsv(shelfItems)}
            disabled={shelfItems.length === 0}
            title="Export pantry items to CSV"
          >
            <Download size={18} />
            <span>Export CSV</span>
          </button>
          <button
            className="recategorize-button"
            onClick={handleRecategorize}
            title="Re-categorize, deduplicate, and resync expiration dates"
          >
            <RefreshCw size={18} />
            <span>Re-categorize</span>
          </button>
          <button className="add-item-button" onClick={() => setShowAddForm(!showAddForm)}>
            <Plus size={18} />
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="pantry-stats">
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--stat-blue)' }}>
              <Package size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.total_items}</span>
              <span className="stat-label">Total Items</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--stat-green)' }}>
              <CheckCircle size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.full_stock}</span>
              <span className="stat-label">In Stock</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--stat-amber)' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.low_stock}</span>
              <span className="stat-label">Low Stock</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: 'var(--stat-red)' }}>
              <Circle size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.out_of_stock}</span>
              <span className="stat-label">Out of Stock</span>
            </div>
          </div>
          {stats.expiring_soon > 0 && (
            <div className="stat-card">
              <div className="stat-icon" style={{ background: 'var(--stat-orange)' }}>
                <Calendar size={20} />
              </div>
              <div className="stat-content">
                <span className="stat-value">{stats.expiring_soon}</span>
                <span className="stat-label">Expiring Soon</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Item Form */}
      {showAddForm && (
        <form className="pantry-form" onSubmit={handleCreate}>
          <h3>Add New Item</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Item Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Milk, Bread, Eggs"
                required
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                {PANTRY_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value) || 1})}
              />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({...formData, unit: e.target.value})}
                placeholder="e.g., lbs, oz, count"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Expiration Date</label>
              <input
                type="date"
                value={formData.expiration_date}
                onChange={(e) => setFormData({...formData, expiration_date: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Purchase Date</label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData({...formData, purchase_date: e.target.value})}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Stock Status</label>
              <select
                value={formData.stock_status}
                onChange={(e) => setFormData({...formData, stock_status: e.target.value})}
              >
                <option value="full">Full / In Stock</option>
                <option value="low">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
            <div className="form-group">
              <label>Notes</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="save-button" disabled={createMutation.isPending}>
              <Check size={16} />
              <span>{createMutation.isPending ? "Adding..." : "Add Item"}</span>
            </button>
            <button type="button" className="cancel-button" onClick={() => setShowAddForm(false)}>
              <X size={16} />
              <span>Cancel</span>
            </button>
          </div>
        </form>
      )}

      {/* Filters and Search */}
      <PantryFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {/* Bulk controls */}
      <PantryBulkActions
        isSelectMode={isSelectMode}
        selectedCount={selectedItems.size}
        onEnterSelect={() => setIsSelectMode(true)}
        onCancelSelect={() => { setIsSelectMode(false); setSelectedItems(new Set()); }}
        onBulkDelete={handleBulkDelete}
        isDeleting={bulkDeleteMutation.isPending}
      />

      {/* Items Display */}
      {loading ? (
        <div className="loading-state">
          <LoadingSkeleton type="card" count={6} />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Package size={48} />
          </div>
          <h3>No items in your pantry</h3>
          <p>Add items manually or they will appear here when you log grocery expenses</p>
          <button className="empty-state-cta" onClick={() => setShowAddForm(true)}>
            <Plus size={18} />
            <span>Add your first item</span>
          </button>
        </div>
      ) : viewMode === 'shelf' ? (
        <PantryShelfView
          itemsByCategory={itemsByCategory}
          sensors={sensors}
          onDragEnd={handleDragEnd}
          onEdit={startEdit}
          onRemove={handleRemoveFromPantry}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <PantryListView
          rows={rows}
          virtualizer={listVirtualizer}
          scrollRef={setListScrollRef}
          isFetchingNextPage={listIsFetchingNextPage}
          editingId={editingId}
          editForm={editForm}
          isSelectMode={isSelectMode}
          selectedItems={selectedItems}
          onEditFormChange={setEditForm}
          onStartEdit={startEdit}
          onSaveEdit={handleUpdate}
          onCancelEdit={() => setEditingId(null)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onToggleSelect={toggleItemSelection}
          updatePending={updateMutation.isPending}
          deletePending={deleteMutation.isPending}
        />
      )}

      {/* Edit Modal for Shelf View */}
      {viewMode === 'shelf' && editingId && (
        <div className="shelf-edit-modal" onClick={() => setEditingId(null)}>
          <div className="shelf-edit-content" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Item</h3>
            <div className="edit-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({...editForm, quantity: parseFloat(e.target.value) || 1})}
                  />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({...editForm, unit: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                  >
                    {PANTRY_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={editForm.stock_status}
                    onChange={(e) => setEditForm({...editForm, stock_status: e.target.value})}
                  >
                    <option value="full">In Stock</option>
                    <option value="low">Low Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>
                    Expiration Date
                    {editForm.expiration_predicted && <span className="predicted-label">(estimated)</span>}
                  </label>
                  <input
                    type="date"
                    value={editForm.expiration_date}
                    onChange={(e) => setEditForm({...editForm, expiration_date: e.target.value, expiration_predicted: false})}
                  />
                </div>
                <div className="form-group">
                  <label>Purchase Date</label>
                  <input
                    type="date"
                    value={editForm.purchase_date}
                    onChange={(e) => setEditForm({...editForm, purchase_date: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                />
              </div>
              <div className="form-actions">
                <button
                  className="save-button"
                  onClick={() => handleUpdate(editingId)}
                  disabled={updateMutation.isPending}
                >
                  <Check size={16} /> {updateMutation.isPending ? "Saving..." : "Save"}
                </button>
                <button className="delete-btn" onClick={() => { handleDelete(editingId); setEditingId(null); }}>
                  <Trash2 size={16} /> Delete
                </button>
                <button className="cancel-button" onClick={() => setEditingId(null)}>
                  <X size={16} /> Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pantry;
