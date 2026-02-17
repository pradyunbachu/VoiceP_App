import { useState, useRef, useEffect, useMemo } from "react";
import {
  ShoppingCart,
  Trash2,
  Package,
  AlertTriangle,
  Circle,
  Plus,
  Check,
  CheckCircle,
} from "lucide-react";
import {
  useShoppingList,
  useShoppingPantryMatches,
  useCreateShoppingListItem,
  useDeleteShoppingListItem,
  useClearShoppingList,
  usePantryItems,
  useGrocerySuggestions,
  useUndoDelete,
} from "../hooks";
import ShoppingListGroupSelector from "./ShoppingListGroupSelector";
import LoadingSkeleton from "./LoadingSkeleton";
import "./ShoppingList.css";

const ShoppingList = ({ showToast }) => {
  const [newItemText, setNewItemText] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const inputRef = useRef(null);
  const editInputRef = useRef(null);
  const suggestionsRef = useRef(null);

  // React Query hooks
  const { data: shoppingItems = [], isLoading: loading } = useShoppingList(
    selectedGroupId ? { group_id: selectedGroupId } : {}
  );
  const { data: pantryItems = [] } = usePantryItems({});

  // Semantic matching of shopping items to pantry items (uses AI)
  const { data: pantryMatches = {} } = useShoppingPantryMatches(shoppingItems, pantryItems);

  // Mutations
  const createMutation = useCreateShoppingListItem();
  const deleteMutation = useDeleteShoppingListItem();
  const clearMutation = useClearShoppingList();
  const { scheduleDelete } = useUndoDelete(showToast);

  // Grocery autocomplete suggestions
  const {
    selectedIndex,
    isOpen: suggestionsOpen,
    getSuggestions,
    navigateUp,
    navigateDown,
    resetSelection,
    applySuggestion,
  } = useGrocerySuggestions();

  // Click outside to dismiss suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target) &&
        inputRef.current &&
        !inputRef.current.contains(e.target)
      ) {
        resetSelection();
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [resetSelection]);

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
      const itemData = {
        name: name,
        quantity: quantity,
        unit: unit,
        category: "",
        notes: "",
      };
      if (selectedGroupId) {
        itemData.group_id = selectedGroupId;
      }
      await createMutation.mutateAsync(itemData);
      setNewItemText("");
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (error) {
      console.error("Error creating item:", error);
      if (showToast) showToast("Error adding item", "error");
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setNewItemText(value);
    const results = getSuggestions(value);
    setSuggestions(results);
  };

  const handleSelectSuggestion = (suggestion) => {
    const newText = applySuggestion(newItemText, suggestion.name);
    setNewItemText(newText);
    setSuggestions([]);
    resetSelection();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (suggestionsOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateDown(suggestions.length - 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateUp();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        resetSelection();
        setSuggestions([]);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && selectedIndex >= 0) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddItem(newItemText);
    }
  };

  const handleDelete = (id) => {
    scheduleDelete({
      id,
      queryKeyPrefix: ["shoppingList"],
      filterFn: (item) => item.id !== id,
      dataKey: null,
      onDelete: async () => {
        try {
          await deleteMutation.mutateAsync(id);
        } catch (error) {
          console.error("Error deleting item:", error);
          if (showToast) showToast("Error removing item", "error");
        }
      },
      message: "Item removed",
    });
  };

  const handleClearAll = () => {
    if (shoppingItems.length === 0) return;

    const count = shoppingItems.length;

    scheduleDelete({
      id: `clear-shopping-${Date.now()}`,
      queryKeyPrefix: ["shoppingList"],
      filterFn: () => false, // remove all items
      dataKey: null,
      onDelete: async () => {
        try {
          await clearMutation.mutateAsync();
        } catch (error) {
          console.error("Error clearing list:", error);
          if (showToast) showToast("Error clearing list", "error");
        }
      },
      message: `${count} item(s) cleared`,
    });
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

  // Check if a pantry item is already in the shopping list (using semantic matching)
  const isItemInShoppingList = (pantryItemId) => {
    // Check if any shopping item matches this pantry item
    // Compare as strings since JSON keys/IDs can be inconsistent types
    return Object.values(pantryMatches).some(
      (matchedPantry) => String(matchedPantry?.id) === String(pantryItemId)
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

  // Get pantry match for a shopping item (uses AI-powered semantic matching)
  // Note: JSON keys are strings, so convert ID to string for lookup
  const getPantryMatch = (shoppingItemId) => {
    return pantryMatches[String(shoppingItemId)] || pantryMatches[shoppingItemId] || null;
  };

  // Get stock status icon and color
  const getStockStatusInfo = (status) => {
    switch (status) {
      case "full":
        return { icon: <CheckCircle size={12} />, label: "In Stock", className: "stock-full" };
      case "low":
        return { icon: <AlertTriangle size={12} />, label: "Low", className: "stock-low" };
      case "out_of_stock":
        return { icon: <Circle size={12} />, label: "Out", className: "stock-out" };
      default:
        return null;
    }
  };

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

      {/* Group Selector */}
      <ShoppingListGroupSelector
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        showToast={showToast}
      />

      {/* Modern List Card */}
      <div className="list-card">
        {/* Add item input */}
        <div className="add-item-container" role="combobox" aria-expanded={suggestionsOpen} aria-haspopup="listbox">
          <Plus size={20} className="add-item-icon" />
          <input
            ref={inputRef}
            type="text"
            className="add-item-input"
            value={newItemText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Add an item..."
            disabled={createMutation.isPending}
            aria-autocomplete="list"
            aria-controls="grocery-suggestions"
            aria-activedescendant={selectedIndex >= 0 ? `suggestion-${selectedIndex}` : undefined}
          />
          {suggestionsOpen && suggestions.length > 0 && (
            <ul
              id="grocery-suggestions"
              ref={suggestionsRef}
              className="suggestions-dropdown"
              role="listbox"
            >
              {suggestions.map((item, index) => (
                <li
                  key={item.name}
                  id={`suggestion-${index}`}
                  className={`suggestion-item${index === selectedIndex ? " selected" : ""}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectSuggestion(item);
                  }}
                >
                  <span className="suggestion-name">{item.name}</span>
                  <span className="suggestion-category">{item.category}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* List content */}
        <div className="list-content">
          {loading ? (
            <div className="list-loading">
              <LoadingSkeleton type="text" count={5} />
            </div>
          ) : shoppingItems.length === 0 ? (
            <div className="list-empty">
              <ShoppingCart size={48} strokeWidth={1} />
              <p>Your shopping list is empty</p>
              <span>Add items above to get started</span>
            </div>
          ) : (
            <ul className="shopping-items">
              {shoppingItems.map((item) => {
                const pantryMatch = getPantryMatch(item.id);
                const stockInfo = pantryMatch ? getStockStatusInfo(pantryMatch.stock_status) : null;

                return (
                  <li key={item.id} className="shopping-item">
                    <Circle size={18} className="item-bullet" />
                    <div className="item-content">
                      <span className="item-text">{formatItemDisplay(item)}</span>
                      {pantryMatch && (
                        <div className={`pantry-stock-info ${stockInfo?.className || ''}`}>
                          <Package size={12} />
                          <span className="stock-qty">
                            {pantryMatch.quantity}{pantryMatch.unit ? ` ${pantryMatch.unit}` : ''} in pantry
                          </span>
                          {stockInfo && (
                            <span className={`stock-badge ${stockInfo.className}`}>
                              {stockInfo.icon}
                              {stockInfo.label}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      className="item-delete"
                      onClick={() => handleDelete(item.id)}
                      disabled={deleteMutation.isPending}
                      title="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Item count footer */}
        {shoppingItems.length > 0 && (
          <div className="list-footer">
            <span className="item-count">
              {shoppingItems.length} {shoppingItems.length === 1 ? 'item' : 'items'}
            </span>
          </div>
        )}
      </div>

      {/* Pantry Needs Section */}
      {pantryNeeds.length > 0 && (
        <div className="pantry-needs-section">
          <h3>
            <Package size={18} /> Running Low in Pantry
          </h3>
          <div className="pantry-needs-chips">
            {pantryNeeds.map((item) => {
              const isInList = isItemInShoppingList(item.id);
              return (
                <button
                  key={item.id}
                  className={`pantry-chip ${item.stock_status} ${isInList ? 'added' : ''}`}
                  onClick={() => !isInList && handleAddFromPantry(item)}
                  disabled={isInList || createMutation.isPending}
                >
                  {item.stock_status === "out_of_stock" ? (
                    <Circle size={12} className="chip-status" />
                  ) : (
                    <AlertTriangle size={12} className="chip-status" />
                  )}
                  <span>{item.name}</span>
                  {isInList ? (
                    <Check size={14} className="chip-action" />
                  ) : (
                    <Plus size={14} className="chip-action" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShoppingList;
