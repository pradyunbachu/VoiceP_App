/**
 * Pantry.jsx - Main pantry management component for Voxal.
 *
 * Provides two view modes (shelf with drag-and-drop, list with infinite scroll),
 * CRUD operations for pantry items, bulk actions, filtering/sorting, CSV export,
 * and an auto-recategorize feature that deduplicates items and backfills dates.
 */
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ShowToast, PantryItem, StockStatus } from "../types/index";
import type { DragEndEvent } from "@dnd-kit/core";
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
  ShoppingCart,
  ChefHat,
} from "lucide-react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import { DEMO_PANTRY_ITEMS } from "../constants/demoPantry";
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
  useResyncPantry,
  useUndoDelete,
  useCreateShoppingListItem,
} from "../hooks";
import { exportPantryCsv } from "../lib/csvExport";
import { detectCategory } from "../lib/categoryDetection";
import { isExpired, isExpiringSoon } from "../lib/pantryUtils";
import LoadingSkeleton from "./LoadingSkeleton";
import PantryFilters from "./PantryFilters";
import PantryBulkActions from "./PantryBulkActions";
import PantryGroupSelector from "./PantryGroupSelector";
import PantryShelfView from "./PantryShelfView";
import PantryListView from "./PantryListView";
import "./Pantry.css";

interface Props {
  showToast: ShowToast;
  selectedGroupId: number | null | "demo";
  onSelectGroup: (groupId: number | null | "demo") => void;
  onCookExpiring?: (itemNames: string[]) => void;
}

type ViewMode = "shelf" | "list";

interface FormData {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiration_date: string;
  purchase_date: string;
  stock_status: StockStatus;
  notes: string;
}

interface EditFormData {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiration_date: string;
  purchase_date: string;
  stock_status: StockStatus;
  notes: string;
  expiration_predicted?: boolean;
}

const Pantry: React.FC<Props> = ({ showToast, selectedGroupId, onSelectGroup, onCookExpiring }) => {

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("shelf");

  // Form state
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: "",
    quantity: 1,
    unit: "",
    category: "Other",
    expiration_date: "",
    purchase_date: new Date().toISOString().split("T")[0],
    stock_status: "full" as StockStatus,
    notes: ""
  });
  const [editForm, setEditForm] = useState<EditFormData>({} as EditFormData);

  // Filter and sort state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortOrder, setSortOrder] = useState<string>("asc");

  // Selection state (for bulk operations)
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState<boolean>(false);

  // Debounce search input by 300ms to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const isDemoMode = selectedGroupId === "demo";
  const apiGroupId = isDemoMode ? undefined : (selectedGroupId ?? undefined);

  // Shelf view fetches all items at once (no pagination) because
  // dnd-kit requires all draggable items to be in the DOM simultaneously.
  const { data: shelfItems = [] as PantryItem[], isLoading: shelfLoading } = usePantryItems({
    category: categoryFilter || undefined,
    stock_status: (statusFilter as StockStatus) || undefined,
    search: debouncedSearch || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    group_id: apiGroupId,
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
    stock_status: (statusFilter as StockStatus) || undefined,
    search: debouncedSearch || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    group_id: apiGroupId,
  });

  // Flatten all loaded infinite-scroll pages into a single array
  const listItems: PantryItem[] = listInfiniteData?.pages?.flatMap((p: { items: PantryItem[] }) => p.items) ?? [];

  // In demo mode, use hardcoded items with optional client-side filtering
  const demoFiltered = useMemo<PantryItem[]>(() => {
    if (!isDemoMode) return [];
    let result = DEMO_PANTRY_ITEMS;
    if (categoryFilter) result = result.filter((i) => i.category === categoryFilter);
    if (statusFilter) result = result.filter((i) => i.stock_status === statusFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }
    return result;
  }, [isDemoMode, categoryFilter, statusFilter, debouncedSearch]);

  // Unify data/loading behind the active view mode so the rest of the
  // component can reference `items` and `loading` without branching.
  const items: PantryItem[] = isDemoMode
    ? demoFiltered
    : (viewMode === 'shelf' ? (shelfItems as PantryItem[]) : listItems);
  const loading: boolean = isDemoMode ? false : (viewMode === 'shelf' ? shelfLoading : listLoading);

  const { data: stats } = usePantryStats(apiGroupId as number | undefined);

  // Fetch all out-of-stock items (used for "Discard Out of Stock" button)
  const { data: oosItems } = usePantryItems({ stock_status: 'out_of_stock', group_id: apiGroupId });
  const outOfStockItems: PantryItem[] = Array.isArray(oosItems) ? oosItems : [];

  // Mutations
  const createMutation = useCreatePantryItem();
  const updateMutation = useUpdatePantryItem();
  const statusMutation = useUpdatePantryStatus();
  const deleteMutation = useDeletePantryItem();
  const bulkDeleteMutation = useBulkDeletePantryItems();
  const resyncMutation = useResyncPantry();
  const { scheduleDelete } = useUndoDelete(showToast);
  const addToShoppingListMutation = useCreateShoppingListItem();

  // Derive low stock and expiring-soon items for action banners
  const lowStockItems = useMemo<PantryItem[]>(() => {
    return items.filter((item) => item.stock_status === "low" || item.stock_status === "out_of_stock");
  }, [items]);

  const expiringItems = useMemo<PantryItem[]>(() => {
    return items.filter((item) => isExpiringSoon(item.expiration_date) && !isExpired(item.expiration_date));
  }, [items]);

  const handleAddLowStockToList = async () => {
    if (lowStockItems.length === 0) return;
    let added = 0;
    for (const item of lowStockItems) {
      try {
        await addToShoppingListMutation.mutateAsync({
          name: item.name,
          quantity: 1,
          unit: item.unit || "",
          category: item.category || "",
          notes: "",
        });
        added++;
      } catch { /* skip duplicates or errors */ }
    }
    if (added > 0) {
      showToast(`Added ${added} item${added !== 1 ? "s" : ""} to shopping list`, "success");
    }
  };

  const handleCookExpiring = () => {
    if (expiringItems.length === 0 || !onCookExpiring) return;
    onCookExpiring(expiringItems.map((item) => item.name));
  };

  // Server-side filtering has already been applied via query params,
  // so no additional client-side filtering is needed.
  const filteredItems: PantryItem[] = items;

  // Dynamically compute how many columns fit in the container
  // (280px min card width, 16px gap) for responsive grid virtualization.
  const { columnCount, containerRef: gridContainerRef } = useContainerColumns(280, 16);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  // Merge the virtualizer scroll ref and the column-measuring ref
  // so both libraries can observe the same scroll container.
  const setListScrollRef = useCallback((node: HTMLDivElement | null) => {
    listScrollRef.current = node;
    gridContainerRef(node);
  }, [gridContainerRef]);

  // Chunk flat item list into rows of `columnCount` for grid virtualization
  const rows = useMemo<PantryItem[][]>(() => {
    const result: PantryItem[][] = [];
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
    measureElement: (el: Element) => el?.getBoundingClientRect().height ?? 280,
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
  const itemsByCategory = useMemo<[string, PantryItem[]][]>(() => {
    const grouped: Record<string, PantryItem[]> = {};
    PANTRY_CATEGORIES.forEach((cat: string) => {
      grouped[cat] = [];
    });
    filteredItems.forEach((item: PantryItem) => {
      const cat = item.category || "Other";
      if (grouped[cat]) {
        grouped[cat].push(item);
      } else {
        // Fall back to "Other" for unrecognized categories
        grouped["Other"].push(item);
      }
    });
    return Object.entries(grouped) as [string, PantryItem[]][];
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
  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;

    if (!over) return;

    const draggedItemId = active.id;
    const targetCategory = over.id as string;

    // Find the dragged item
    const draggedItem = items.find((item) => item.id === draggedItemId);
    if (!draggedItem) return;

    // If dropped on the same category, do nothing
    if (draggedItem.category === targetCategory) return;

    // Update the category (optimistic update happens in mutation)
    updateMutation.mutate(
      { id: draggedItemId as number, data: { ...draggedItem, category: targetCategory } },
      {
        onSuccess: () => {},
        onError: () => {
          if (showToast) showToast("Error updating item category", "error");
        },
      }
    );
  };

  // Create a new pantry item from the add-item form and reset form fields
  const handleCreate = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
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
        stock_status: "full" as StockStatus,
        notes: ""
      });
    } catch (error: unknown) {
      console.error("Error creating item:", error);
      if (showToast) showToast((error as Error).message || "Error adding item to pantry", "error");
    }
  };

  // Persist edits to an existing pantry item.
  // When the name changed but the user didn't manually pick a new category,
  // auto-recategorize based on the updated name.
  const handleUpdate = async (id: number): Promise<void> => {
    try {
      const original = items.find((item) => item.id === id);
      let data = { ...editForm };
      if (original && data.name && data.name !== original.name) {
        // Name changed — recategorize if the category wasn't manually changed
        if (data.category === original.category) {
          const detected = detectCategory(data.name);
          if (detected !== "Other" || original.category === "Other") {
            data = { ...data, category: detected };
          }
        }
      }
      await updateMutation.mutateAsync({ id, data });
      setEditingId(null);
      setEditForm({} as EditFormData);
    } catch (error: unknown) {
      console.error("Error updating item:", error);
      if (showToast) showToast((error as Error).message || "Error updating item", "error");
    }
  };

  // Soft-delete with undo: optimistically removes from cache and
  // defers the real API call until the undo window expires.
  const handleDelete = (id: number): void => {
    scheduleDelete({
      id,
      queryKeyPrefix: ["pantry"],
      filterFn: (item: PantryItem) => item.id !== id,
      dataKey: null,
      onDelete: async () => {
        try {
          await deleteMutation.mutateAsync(id);
        } catch (error: unknown) {
          console.error("Error deleting item:", error);
          if (showToast) showToast("Error deleting item", "error");
        }
      },
      message: "Item deleted",
    });
  };

  // Remove item from pantry (keeps the expense)
  const handleRemoveFromPantry = (id: number): void => {
    scheduleDelete({
      id,
      queryKeyPrefix: ["pantry"],
      filterFn: (item: PantryItem) => item.id !== id,
      dataKey: null,
      onDelete: async () => {
        try {
          await deleteMutation.mutateAsync(id);
        } catch (error: unknown) {
          console.error("Error removing item:", error);
          if (showToast) showToast("Error removing item", "error");
        }
      },
      message: "Item removed from pantry",
    });
  };

  const handleStatusChange = (id: number, newStatus: StockStatus): void => {
    statusMutation.mutate({ id, status: newStatus });
  };

  const handleQuantityChange = (id: number, delta: number): void => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, (item.quantity || 1) + delta);
    const newStatus: StockStatus = newQty === 0 ? "out_of_stock" : newQty === 1 ? "low" : item.stock_status === "out_of_stock" ? "full" : item.stock_status;
    updateMutation.mutate({ id, data: { quantity: newQty, stock_status: newStatus } });
  };

  // Delete all currently selected items at once via undo-able bulk delete
  const handleBulkDelete = (): void => {
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
      filterFn: (item: PantryItem) => !idSet.has(item.id),
      dataKey: null,
      onDelete: async () => {
        try {
          await bulkDeleteMutation.mutateAsync(idsToDelete);
        } catch (error: unknown) {
          console.error("Error bulk deleting:", error);
          if (showToast) showToast("Error deleting items", "error");
        }
      },
      message: `${count} item(s) deleted`,
    });
  };

  // Discard all out-of-stock items at once via undo-able bulk delete
  const handleDiscardOutOfStock = (): void => {
    if (outOfStockItems.length === 0) {
      if (showToast) showToast("No out of stock items to discard", "info");
      return;
    }

    const idsToDelete = outOfStockItems.map((item) => item.id);
    const idSet = new Set(idsToDelete);
    const count = idsToDelete.length;

    scheduleDelete({
      id: `discard-oos-${Date.now()}`,
      queryKeyPrefix: ["pantry"],
      filterFn: (item: PantryItem) => !idSet.has(item.id),
      dataKey: null,
      onDelete: async () => {
        try {
          await bulkDeleteMutation.mutateAsync(idsToDelete);
        } catch (error: unknown) {
          console.error("Error discarding out of stock items:", error);
          if (showToast) showToast("Error discarding items", "error");
        }
      },
      message: `${count} out of stock item(s) discarded`,
    });
  };

  // Resync performs a full server-side refresh of the pantry:
  //   - Deduplicates items with the same name (merges quantities)
  //   - Re-categorizes items using current detection logic
  //   - Refreshes all predicted expiration dates (picks up shelf life data updates)
  //   - Backfills missing purchase/expiration dates
  const handleResync = (): void => {
    resyncMutation.mutate(undefined, {
      onSuccess: (result: any) => {
        const parts: string[] = [];
        if (result.name_corrected > 0) parts.push(`${result.name_corrected} name(s) corrected`);
        if (result.recategorized > 0) parts.push(`${result.recategorized} re-categorized`);
        if (result.merged > 0) parts.push(`${result.merged} merged`);
        if (result.purchase_filled > 0) parts.push(`${result.purchase_filled} purchase date(s) added`);
        if (result.expiration_filled > 0) parts.push(`${result.expiration_filled} expiration(s) updated`);
        if (result.expiration_cleared > 0) parts.push(`${result.expiration_cleared} non-food expiration(s) cleared`);
        if (parts.length > 0) {
          if (showToast) showToast(parts.join(", "), "success");
        } else {
          if (showToast) showToast("All items are up to date", "success");
        }
      },
      onError: () => {
        if (showToast) showToast("Error syncing pantry", "error");
      },
    });
  };

  // Populate the edit form with the selected item's current values
  const startEdit = (item: PantryItem): void => {
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
  const toggleItemSelection = (id: number): void => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  // Select all items whose expiration date has passed
  const handleSelectAllExpired = (): void => {
    const expiredIds = items
      .filter((item) => isExpired(item.expiration_date))
      .map((item) => item.id);
    setSelectedItems(new Set(expiredIds));
  };

  return (
    <div className="pantry">
      {/* Header */}
      <div className="pantry-header">
        <div>
          <h2><Package size={28} /> {isDemoMode ? "Demo Pantry" : "My Pantry"}</h2>
          <p className="pantry-subtitle">
            {isDemoMode ? "Sample items to explore features — switch to My Pantry to manage your own" : "Track your groceries and household items"}
          </p>
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
          {!isDemoMode && (
            <>
              <button
                className="export-pantry-button"
                onClick={() => exportPantryCsv(shelfItems as PantryItem[])}
                disabled={(shelfItems as PantryItem[]).length === 0}
                title="Export pantry items to CSV"
              >
                <Download size={18} />
                <span>Export CSV</span>
              </button>
              <button
                className="recategorize-button"
                onClick={handleResync}
                disabled={resyncMutation.isPending}
                title="Resync categories, expiration dates, and deduplicate items"
              >
                <RefreshCw size={18} className={resyncMutation.isPending ? "spin" : ""} />
                <span>{resyncMutation.isPending ? "Syncing..." : "Resync"}</span>
              </button>
              <button className="add-item-button" onClick={() => setShowAddForm(!showAddForm)}>
                <Plus size={18} />
                <span>Add Item</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      {stats && !isDemoMode && (
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

      {/* Kitchen Action Banners */}
      {!isDemoMode && (lowStockItems.length > 0 || expiringItems.length > 0) && (
        <div className="pantry-action-banners">
          {lowStockItems.length > 0 && (
            <button
              className="pantry-action-banner pantry-action-banner--shopping"
              onClick={handleAddLowStockToList}
              disabled={addToShoppingListMutation.isPending}
            >
              <ShoppingCart size={16} />
              <span>
                {addToShoppingListMutation.isPending
                  ? "Adding..."
                  : `Add ${lowStockItems.length} low stock item${lowStockItems.length !== 1 ? "s" : ""} to shopping list`}
              </span>
            </button>
          )}
          {expiringItems.length > 0 && onCookExpiring && (
            <button
              className="pantry-action-banner pantry-action-banner--chef"
              onClick={handleCookExpiring}
            >
              <ChefHat size={16} />
              <span>Cook with {expiringItems.length} expiring item{expiringItems.length !== 1 ? "s" : ""}</span>
            </button>
          )}
        </div>
      )}

      {/* Group Selector */}
      <PantryGroupSelector
        selectedGroupId={selectedGroupId}
        onSelectGroup={onSelectGroup}
        showToast={showToast}
      />

      {/* Add Item Form */}
      {showAddForm && !isDemoMode && (
        <form className="pantry-form" onSubmit={handleCreate}>
          <h3>Add New Item</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Item Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Milk, Bread, Eggs"
                required
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select
                value={formData.category}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, category: e.target.value})}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, quantity: parseFloat(e.target.value) || 1})}
              />
            </div>
            <div className="form-group">
              <label>Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, unit: e.target.value})}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, expiration_date: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Purchase Date</label>
              <input
                type="date"
                value={formData.purchase_date}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, purchase_date: e.target.value})}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Stock Status</label>
              <select
                value={formData.stock_status}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, stock_status: e.target.value as StockStatus})}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, notes: e.target.value})}
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
      {!isDemoMode && <PantryBulkActions
        isSelectMode={isSelectMode}
        selectedCount={selectedItems.size}
        onEnterSelect={() => setIsSelectMode(true)}
        onCancelSelect={() => { setIsSelectMode(false); setSelectedItems(new Set()); }}
        onBulkDelete={handleBulkDelete}
        onSelectAllExpired={handleSelectAllExpired}
        onDiscardOutOfStock={handleDiscardOutOfStock}
        outOfStockCount={outOfStockItems.length}
        isDiscarding={bulkDeleteMutation.isPending}
        isDeleting={bulkDeleteMutation.isPending}
      />}

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
          onQuantityChange={handleQuantityChange}
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
          onQuantityChange={handleQuantityChange}
          onToggleSelect={toggleItemSelection}
          updatePending={updateMutation.isPending}
          deletePending={deleteMutation.isPending}
        />
      )}

      {/* Edit Modal for Shelf View */}
      {viewMode === 'shelf' && editingId && !isDemoMode && (
        <div className="shelf-edit-modal" onClick={() => setEditingId(null)}>
          <div className="shelf-edit-content" onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}>
            <h3>Edit Item</h3>
            <div className="edit-form">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, name: e.target.value})}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editForm.quantity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, quantity: parseFloat(e.target.value) || 1})}
                  />
                </div>
                <div className="form-group">
                  <label>Unit</label>
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, unit: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={editForm.category}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({...editForm, category: e.target.value})}
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
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({...editForm, stock_status: e.target.value as StockStatus})}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, expiration_date: e.target.value, expiration_predicted: false})}
                  />
                </div>
                <div className="form-group">
                  <label>Purchase Date</label>
                  <input
                    type="date"
                    value={editForm.purchase_date}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, purchase_date: e.target.value})}
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, notes: e.target.value})}
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
