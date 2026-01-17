import { useState, useRef, useEffect, useMemo } from "react";
import {
  ShoppingCart,
  Trash2,
  Package,
  AlertTriangle,
  Circle,
  Plus,
  Check,
} from "lucide-react";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import {
  useShoppingList,
  useCreateShoppingListItem,
  useDeleteShoppingListItem,
  useClearShoppingList,
  usePantryItems,
} from "../hooks";
import LoadingSkeleton from "./LoadingSkeleton";
import "./ShoppingList.css";

const ShoppingList = ({ showToast }) => {
  const [newItemText, setNewItemText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef(null);
  const editInputRef = useRef(null);

  // React Query hooks
  const { data: shoppingItems = [], isLoading: loading } = useShoppingList();
  const { data: pantryItems = [] } = usePantryItems({});

  // Mutations
  const createMutation = useCreateShoppingListItem();
  const deleteMutation = useDeleteShoppingListItem();
  const clearMutation = useClearShoppingList();

  // Low/out of stock pantry items as suggestions
  const pantryNeeds = useMemo(() => {
    return pantryItems.filter(
      (item) =>
        item.stock_status === "low" || item.stock_status === "out_of_stock"
    );
  }, [pantryItems]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleAddItem = async (text) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    // Parse quantity if present (e.g., "2 milk" or "milk x3")
    let name = trimmedText;
    let quantity = 1;
    let unit = "";

    // Check for "2 milk" pattern
    const leadingNumMatch = trimmedText.match(/^(\d+\.?\d*)\s+(.+)$/);
    if (leadingNumMatch) {
      quantity = parseFloat(leadingNumMatch[1]);
      name = leadingNumMatch[2];
    }

    // Check for "milk x3" or "milk (3)" pattern
    const trailingNumMatch = trimmedText.match(/^(.+?)\s*[x×]\s*(\d+\.?\d*)$/i);
    if (trailingNumMatch) {
      name = trailingNumMatch[1];
      quantity = parseFloat(trailingNumMatch[2]);
    }

    try {
      await createMutation.mutateAsync({
        name: name,
        quantity: quantity,
        unit: unit,
        category: "",
        notes: "",
      });
      setNewItemText("");
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (error) {
      console.error("Error creating item:", error);
      if (showToast) showToast("Error adding item", "error");
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddItem(newItemText);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      console.error("Error deleting item:", error);
      if (showToast) showToast("Error removing item", "error");
    }
  };

  const handleClearAll = async () => {
    if (shoppingItems.length === 0) return;

    if (!window.confirm("Clear all items from your shopping list?")) {
      return;
    }

    try {
      await clearMutation.mutateAsync();
      if (showToast) showToast("Shopping list cleared", "success");
    } catch (error) {
      console.error("Error clearing list:", error);
      if (showToast) showToast("Error clearing list", "error");
    }
  };

  const handleAddFromPantry = async (pantryItem) => {
    try {
      await createMutation.mutateAsync({
        name: pantryItem.name,
        quantity: 1,
        unit: pantryItem.unit || "",
        category: pantryItem.category || "",
        notes: "",
      });
    } catch (error) {
      console.error("Error adding from pantry:", error);
    }
  };

  const isItemInShoppingList = (pantryItemName) => {
    return shoppingItems.some(
      (item) => item.name.toLowerCase() === pantryItemName.toLowerCase()
    );
  };

  const formatItemDisplay = (item) => {
    let display = item.name;
    if (item.quantity && item.quantity !== 1) {
      display = `${item.quantity}${item.unit ? ' ' + item.unit : ''} ${item.name}`;
    } else if (item.unit) {
      display = `${item.name} (${item.unit})`;
    }
    return display;
  };

  // Generate empty lines to fill the notepad
  const emptyLinesCount = Math.max(0, 12 - shoppingItems.length);
  const emptyLines = Array(emptyLinesCount).fill(null);

  return (
    <div className="shopping-list">
      {/* Header */}
      <div className="shopping-list-header">
        <div>
          <h2>
            <ShoppingCart size={28} /> Shopping List
          </h2>
          <p className="shopping-list-subtitle">
            Type items and press Enter to add
          </p>
        </div>
        {shoppingItems.length > 0 && (
          <button
            className="clear-all-btn"
            onClick={handleClearAll}
            disabled={clearMutation.isPending}
            title="Clear all items"
          >
            <Trash2 size={16} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Paper Notepad */}
      <div className="notepad-container">
        <div className="notepad">
          {/* Spiral binding */}
          <div className="notepad-binding">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="binding-ring" />
            ))}
          </div>

          {/* Notepad header */}
          <div className="notepad-header">
            <span className="notepad-title">Shopping List</span>
            <span className="notepad-count">
              {shoppingItems.length} {shoppingItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          {/* Notepad lines */}
          <div className="notepad-content">
            {loading ? (
              <div className="notepad-loading">
                <LoadingSkeleton type="text" count={5} />
              </div>
            ) : (
              <>
                {/* Existing items */}
                {shoppingItems.map((item, index) => (
                  <div key={item.id} className="notepad-line has-item">
                    <span className="line-number">{index + 1}</span>
                    <span className="line-bullet">•</span>
                    <span className="line-text">{formatItemDisplay(item)}</span>
                    <button
                      className="line-delete"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleteMutation.isPending}
                      title="Remove item"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* New item input line */}
                <div className="notepad-line input-line">
                  <span className="line-number">{shoppingItems.length + 1}</span>
                  <span className="line-bullet">•</span>
                  <input
                    ref={inputRef}
                    type="text"
                    className="line-input"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type item and press Enter..."
                    disabled={createMutation.isPending}
                  />
                </div>

                {/* Empty lines to fill the pad */}
                {emptyLines.map((_, index) => (
                  <div key={`empty-${index}`} className="notepad-line empty-line">
                    <span className="line-number">{shoppingItems.length + 2 + index}</span>
                    <span className="line-content"></span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Bottom margin */}
          <div className="notepad-footer" />
        </div>
      </div>

      {/* Pantry Needs Section */}
      {pantryNeeds.length > 0 && (
        <div className="pantry-needs-section">
          <h3>
            <Package size={18} /> Running Low in Pantry
          </h3>
          <div className="pantry-needs-chips">
            {pantryNeeds.map((item) => (
              <button
                key={item.id}
                className={`pantry-chip ${item.stock_status} ${isItemInShoppingList(item.name) ? 'added' : ''}`}
                onClick={() => !isItemInShoppingList(item.name) && handleAddFromPantry(item)}
                disabled={isItemInShoppingList(item.name) || createMutation.isPending}
              >
                {item.stock_status === "out_of_stock" ? (
                  <Circle size={12} className="chip-status" />
                ) : (
                  <AlertTriangle size={12} className="chip-status" />
                )}
                <span>{item.name}</span>
                {isItemInShoppingList(item.name) ? (
                  <Check size={14} className="chip-action" />
                ) : (
                  <Plus size={14} className="chip-action" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShoppingList;
