import { useState, useMemo, useEffect } from "react";
import {
  Package,
  Plus,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  AlertTriangle,
  CheckCircle,
  Circle,
  Calendar,
  Tag,
  ArrowUpDown,
  CheckSquare,
  Square,
  ShoppingCart,
  LayoutGrid,
  List,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import {
  usePantryItems,
  usePantryStats,
  useCreatePantryItem,
  useUpdatePantryItem,
  useUpdatePantryStatus,
  useDeletePantryItem,
  useBulkDeletePantryItems,
} from "../hooks";
import { exportPantryCsv } from "../lib/csvExport";
import LoadingSkeleton from "./LoadingSkeleton";
import "./Pantry.css";

// Draggable shelf item component
const DraggableShelfItem = ({ item, isExpiringSoon, isExpired, getStatusIcon, onEdit, onRemove, onStatusChange }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: item.id });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 1000 : 1,
  };

  const statusOptions = [
    { value: 'full', label: 'Full', icon: <CheckCircle size={11} /> },
    { value: 'low', label: 'Low', icon: <AlertTriangle size={11} /> },
    { value: 'out_of_stock', label: 'Out', icon: <Circle size={11} /> },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shelf-item ${item.stock_status} ${isExpired ? 'expired' : ''} ${isExpiringSoon && !isExpired ? 'expiring-soon' : ''} ${isDragging ? 'dragging' : ''}`}
      title={`${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}${item.expiration_date ? `\nExpires: ${new Date(item.expiration_date).toLocaleDateString()}` : ''}${item.notes ? `\n${item.notes}` : ''}`}
      {...attributes}
      {...listeners}
    >
      <button
        className="shelf-item-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(item.id);
        }}
        title="Remove from pantry"
      >
        <X size={10} />
      </button>
      <div className="shelf-item-content" onClick={(e) => {
        e.stopPropagation();
        onEdit(item);
      }}>
        <div className="shelf-item-name">{item.name}</div>
        {item.quantity && (
          <div className="shelf-item-qty">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</div>
        )}
        {isExpiringSoon && !isExpired && (
          <div className="shelf-item-badge expiring">Exp Soon</div>
        )}
        {isExpired && (
          <div className="shelf-item-badge expired">Expired</div>
        )}
      </div>
      <div
        className="shelf-item-status-buttons"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {statusOptions.map((status) => (
          <button
            key={status.value}
            className={`shelf-status-btn ${status.value} ${item.stock_status === status.value ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange(item.id, status.value);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={status.label}
          >
            {status.icon}
            <span className="shelf-status-label">{status.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// Droppable shelf component
const DroppableShelf = ({ category, children, isEmpty }) => {
  const { setNodeRef, isOver } = useDroppable({ id: category });

  return (
    <div className={`shelf ${isOver ? 'drag-over' : ''}`}>
      <div className="shelf-label">{category}</div>
      <div ref={setNodeRef} className="shelf-surface">
        <div className="shelf-items">
          {children}
          {isEmpty && (
            <div className="shelf-empty-hint">Drop items here</div>
          )}
        </div>
      </div>
      <div className="shelf-bracket left"></div>
      <div className="shelf-bracket right"></div>
    </div>
  );
};

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
  const [listPage, setListPage] = useState(1);

  // Selection state (for bulk operations)
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setListPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page on filter changes
  useEffect(() => {
    setListPage(1);
  }, [categoryFilter, statusFilter, sortBy, sortOrder]);

  // Shelf view: fetch all items (no pagination) for drag-and-drop
  const { data: shelfItems = [], isLoading: shelfLoading } = usePantryItems({
    category: categoryFilter || undefined,
    stock_status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
  });

  // List view: paginated fetch
  const { data: listData, isLoading: listLoading } = usePantryItems({
    category: categoryFilter || undefined,
    stock_status: statusFilter || undefined,
    search: debouncedSearch || undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    paginate: true,
    page: listPage,
    page_size: 20,
  });

  const items = viewMode === 'shelf' ? shelfItems : (listData?.items || []);
  const loading = viewMode === 'shelf' ? shelfLoading : listLoading;
  const listTotalPages = listData?.total_pages ?? 1;
  const listHasNext = listData?.has_next ?? false;
  const listHasPrev = listData?.has_prev ?? false;

  const { data: stats } = usePantryStats();

  // Mutations
  const createMutation = useCreatePantryItem();
  const updateMutation = useUpdatePantryItem();
  const statusMutation = useUpdatePantryStatus();
  const deleteMutation = useDeletePantryItem();
  const bulkDeleteMutation = useBulkDeletePantryItems();

  // For shelf view, use items directly (server handles search now)
  const filteredItems = items;

  // Group items by category for shelf view - show ALL categories
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
        grouped["Other"].push(item);
      }
    });
    // Return ALL categories (including empty ones)
    return Object.entries(grouped);
  }, [filteredItems]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Handle drag end - update category when dropped on different shelf
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
        onSuccess: () => {
          if (showToast) showToast(`Moved "${draggedItem.name}" to ${targetCategory}`, "success");
        },
        onError: () => {
          if (showToast) showToast("Error updating item category", "error");
        },
      }
    );
  };

  // CRUD handlers
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
      if (showToast) showToast("Item added to pantry", "success");
    } catch (error) {
      console.error("Error creating item:", error);
      if (showToast) showToast(error.message || "Error adding item to pantry", "error");
    }
  };

  const handleUpdate = async (id) => {
    try {
      await updateMutation.mutateAsync({ id, data: editForm });
      setEditingId(null);
      setEditForm({});
      if (showToast) showToast("Item updated successfully", "success");
    } catch (error) {
      console.error("Error updating item:", error);
      if (showToast) showToast(error.message || "Error updating item", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this item?")) return;

    try {
      await deleteMutation.mutateAsync(id);
      if (showToast) showToast("Item deleted successfully", "success");
    } catch (error) {
      console.error("Error deleting item:", error);
      if (showToast) showToast("Error deleting item", "error");
    }
  };

  // Remove item from pantry (keeps the expense)
  const handleRemoveFromPantry = async (id) => {
    try {
      await deleteMutation.mutateAsync(id);
      if (showToast) showToast("Item removed from pantry", "success");
    } catch (error) {
      console.error("Error removing item:", error);
      if (showToast) showToast("Error removing item", "error");
    }
  };

  const handleStatusChange = (id, newStatus) => {
    statusMutation.mutate({ id, status: newStatus });
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      if (showToast) showToast("Please select items to delete", "warning");
      return;
    }

    if (!window.confirm(`Delete ${selectedItems.size} item(s)?`)) return;

    try {
      await bulkDeleteMutation.mutateAsync(Array.from(selectedItems));
      setSelectedItems(new Set());
      // Stay in select mode so user can continue selecting more items
      if (showToast) showToast("Items deleted successfully", "success");
    } catch (error) {
      console.error("Error bulk deleting:", error);
      if (showToast) showToast("Error deleting items", "error");
    }
  };

  // Helper functions
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
      notes: item.notes || ""
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "full":
        return <CheckCircle size={16} className="status-icon full" />;
      case "low":
        return <AlertTriangle size={16} className="status-icon low" />;
      case "out_of_stock":
        return <Circle size={16} className="status-icon out" />;
      default:
        return <Circle size={16} />;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "full": return "In Stock";
      case "low": return "Low";
      case "out_of_stock": return "Out";
      default: return status;
    }
  };

  const isExpiringSoon = (expirationDate) => {
    if (!expirationDate) return false;
    const expDate = new Date(expirationDate);
    const today = new Date();
    const daysUntilExpiry = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7 && daysUntilExpiry >= 0;
  };

  const isExpired = (expirationDate) => {
    if (!expirationDate) return false;
    const expDate = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expDate < today;
  };

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
            onClick={() => exportPantryCsv(filteredItems)}
            disabled={filteredItems.length === 0}
            title="Export pantry items to CSV"
          >
            <Download size={18} />
            <span>Export CSV</span>
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
            <div className="stat-icon" style={{ background: '#3b82f6' }}>
              <Package size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.total_items}</span>
              <span className="stat-label">Total Items</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#22c55e' }}>
              <CheckCircle size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.full_stock}</span>
              <span className="stat-label">In Stock</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#f59e0b' }}>
              <AlertTriangle size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.low_stock}</span>
              <span className="stat-label">Low Stock</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ background: '#ef4444' }}>
              <Circle size={20} />
            </div>
            <div className="stat-content">
              <span className="stat-value">{stats.out_of_stock}</span>
              <span className="stat-label">Out of Stock</span>
            </div>
          </div>
          {stats.expiring_soon > 0 && (
            <div className="stat-card">
              <div className="stat-icon" style={{ background: '#f97316' }}>
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
      <div className="pantry-controls">
        <div className="search-container">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search pantry..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-controls">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All Categories</option>
            {PANTRY_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="full">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
          <div className="sort-control">
            <ArrowUpDown size={16} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="category">Category</option>
              <option value="expiration_date">Expiration</option>
              <option value="stock_status">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Bulk controls */}
      <div className="bulk-controls">
        {!isSelectMode ? (
          <button className="select-mode-button" onClick={() => setIsSelectMode(true)}>
            <CheckSquare size={18} />
            <span>Select Items</span>
          </button>
        ) : (
          <div className="bulk-actions">
            <button
              className="bulk-delete-button"
              onClick={handleBulkDelete}
              disabled={selectedItems.size === 0 || bulkDeleteMutation.isPending}
            >
              <Trash2 size={16} />
              <span>{bulkDeleteMutation.isPending ? "Deleting..." : `Delete (${selectedItems.size})`}</span>
            </button>
            <button
              className="cancel-select-button"
              onClick={() => { setIsSelectMode(false); setSelectedItems(new Set()); }}
            >
              <X size={16} />
              <span>Cancel</span>
            </button>
          </div>
        )}
      </div>

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
        /* SHELF VIEW with drag and drop */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="pantry-shelves">
            {itemsByCategory.map(([category, categoryItems]) => (
              <DroppableShelf
                key={category}
                category={category}
                isEmpty={categoryItems.length === 0}
              >
                {categoryItems.map((item) => (
                  <DraggableShelfItem
                    key={item.id}
                    item={item}
                    isExpiringSoon={isExpiringSoon(item.expiration_date)}
                    isExpired={isExpired(item.expiration_date)}
                    getStatusIcon={getStatusIcon}
                    onEdit={startEdit}
                    onRemove={handleRemoveFromPantry}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </DroppableShelf>
            ))}
          </div>
        </DndContext>
      ) : (
        /* LIST VIEW */
        <div className="pantry-items">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={`pantry-card ${item.stock_status} ${selectedItems.has(item.id) ? 'selected' : ''} ${isExpired(item.expiration_date) ? 'expired' : ''} ${isExpiringSoon(item.expiration_date) ? 'expiring-soon' : ''}`}
            >
              {isSelectMode && (
                <button
                  className="checkbox-button"
                  onClick={() => toggleItemSelection(item.id)}
                >
                  {selectedItems.has(item.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                </button>
              )}

              {editingId === item.id ? (
                <div className="edit-form">
                  <div className="edit-row">
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      placeholder="Item name"
                    />
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                    >
                      {PANTRY_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="edit-row">
                    <input
                      type="number"
                      step="0.1"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({...editForm, quantity: parseFloat(e.target.value) || 1})}
                      placeholder="Qty"
                    />
                    <input
                      type="text"
                      value={editForm.unit}
                      onChange={(e) => setEditForm({...editForm, unit: e.target.value})}
                      placeholder="Unit"
                    />
                  </div>
                  <div className="edit-row">
                    <input
                      type="date"
                      value={editForm.expiration_date}
                      onChange={(e) => setEditForm({...editForm, expiration_date: e.target.value})}
                    />
                    <select
                      value={editForm.stock_status}
                      onChange={(e) => setEditForm({...editForm, stock_status: e.target.value})}
                    >
                      <option value="full">In Stock</option>
                      <option value="low">Low Stock</option>
                      <option value="out_of_stock">Out of Stock</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                    placeholder="Notes"
                    className="edit-notes"
                  />
                  <div className="edit-actions">
                    <button
                      className="save-btn"
                      onClick={() => handleUpdate(item.id)}
                      disabled={updateMutation.isPending}
                    >
                      <Check size={16} /> {updateMutation.isPending ? "Saving..." : "Save"}
                    </button>
                    <button className="cancel-btn" onClick={() => setEditingId(null)}>
                      <X size={16} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="pantry-card-header">
                    <div className="item-name">
                      <span className="name">{item.name}</span>
                      {item.quantity && (
                        <span className="item-quantity">
                          {item.quantity}{item.unit ? ` ${item.unit}` : ""}
                        </span>
                      )}
                    </div>
                    {!isSelectMode && (
                      <div className="item-actions">
                        <button className="edit-button" onClick={() => startEdit(item)} title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="delete-button"
                          onClick={() => handleDelete(item.id)}
                          title="Delete"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="pantry-card-body">
                    {item.category && (
                      <span className="item-category">
                        <Tag size={14} />
                        {item.category}
                      </span>
                    )}

                    <div className="status-selector">
                      {["full", "low", "out_of_stock"].map((status) => (
                        <button
                          key={status}
                          className={`status-button ${status} ${item.stock_status === status ? 'active' : ''}`}
                          onClick={() => handleStatusChange(item.id, status)}
                        >
                          {getStatusIcon(status)}
                          <span>{getStatusLabel(status)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pantry-card-footer">
                    {item.expiration_date && (
                      <span className={`expiration ${isExpired(item.expiration_date) ? 'expired' : ''} ${isExpiringSoon(item.expiration_date) ? 'expiring' : ''}`}>
                        <Calendar size={14} />
                        {isExpired(item.expiration_date) ? 'Expired: ' : 'Exp: '}
                        {new Date(item.expiration_date).toLocaleDateString()}
                      </span>
                    )}
                    {item.purchase_date && (
                      <span className="purchase-date">
                        <ShoppingCart size={14} />
                        {new Date(item.purchase_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {item.notes && (
                    <div className="item-notes">{item.notes}</div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* List View Pagination */}
      {viewMode === 'list' && listTotalPages > 1 && (
        <div className="pantry-pagination">
          <button
            className="pagination-button"
            onClick={() => setListPage(p => Math.max(1, p - 1))}
            disabled={!listHasPrev}
          >
            <ChevronLeft size={18} />
            <span>Prev</span>
          </button>
          <span className="pagination-info">
            Page {listPage} of {listTotalPages}
          </span>
          <button
            className="pagination-button"
            onClick={() => setListPage(p => Math.min(listTotalPages, p + 1))}
            disabled={!listHasNext}
          >
            <span>Next</span>
            <ChevronRight size={18} />
          </button>
        </div>
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
              <div className="form-group">
                <label>Expiration Date</label>
                <input
                  type="date"
                  value={editForm.expiration_date}
                  onChange={(e) => setEditForm({...editForm, expiration_date: e.target.value})}
                />
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
