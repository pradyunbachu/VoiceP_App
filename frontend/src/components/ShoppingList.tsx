/**
 * ShoppingList.jsx - Shopping list with autocomplete and pantry integration.
 *
 * Lets users add items via a text input with grocery autocomplete suggestions,
 * view/delete items, and see real-time pantry stock info next to each shopping
 * item (via AI-powered semantic matching). Also surfaces low/out-of-stock
 * pantry items as one-click "add to list" chips at the bottom.
 */
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
  WifiOff,
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
  useCreatePantryItem,
} from "../hooks";
import { useOnlineStatus } from "../hooks/queries/useShoppingList";
import ShoppingListGroupSelector from "./ShoppingListGroupSelector";
import { SkeletonShoppingList } from "./Skeleton";
import SwipeableRow from "./SwipeableRow";
import { usePantrySelection } from "../context/PantryContext";
import type { ShowToast, ShoppingListItem, PantryItem, PantryMatch, GroceryItem, StockStatus } from "../types";
import "./ShoppingList.css";

interface Props {
  showToast: ShowToast;
}

const ShoppingList: React.FC<Props> = ({ showToast }) => {
  const { selectedGroupId: selectedPantryGroup } = usePantrySelection();
  const [newItemText, setNewItemText] = useState<string>("");
  const [suggestions, setSuggestions] = useState<GroceryItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const suggestionsRef = useRef<HTMLUListElement | null>(null);
  const isOnline = useOnlineStatus();

  // Fetch shopping items, optionally scoped to a shared group
  const { data: shoppingItems = [], isLoading: loading } = useShoppingList(
    selectedGroupId ? { group_id: selectedGroupId } : {}
  );
  const pantryGroupId = selectedPantryGroup ?? undefined;
  const { data: pantryItems = [] as PantryItem[] } = usePantryItems({ group_id: pantryGroupId });

  // AI-powered semantic matching: maps each shopping item to its closest
  // pantry counterpart (e.g. "2% milk" matches pantry's "Milk").
  const { data: pantryMatches = {} } = useShoppingPantryMatches(shoppingItems, pantryItems as PantryItem[]);

  // Mutations
  const createMutation = useCreateShoppingListItem();
  const deleteMutation = useDeleteShoppingListItem();
  const clearMutation = useClearShoppingList();
  const addToPantryMutation = useCreatePantryItem();
  const { scheduleDelete } = useUndoDelete(showToast);

  // Grocery autocomplete suggestions hook
  const {
    selectedIndex,
    isOpen: suggestionsOpen,
    getSuggestions,
    navigateUp,
    navigateDown,
    resetSelection,
    applySuggestion,
  } = useGrocerySuggestions();

  // Dismiss the autocomplete dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        resetSelection();
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [resetSelection]);

  // Derive pantry items that are low or out of stock for the "Running Low" section
  const pantryNeeds = useMemo(() => {
    return (pantryItems as PantryItem[]).filter(
      (item: PantryItem) =>
        item.stock_status === "low" || item.stock_status === "out_of_stock"
    );
  }, [pantryItems]);

  // Auto-focus edit input when inline editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Parse optional quantity from input text (e.g. "2 milk" or "milk x3")
  // then create the shopping list item via API.
  const handleAddItem = async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

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
    const trailingNumMatch = trimmedText.match(/^(.+?)\s*[x\u00d7]\s*(\d+\.?\d*)$/i);
    if (trailingNumMatch) {
      name = trailingNumMatch[1];
      quantity = parseFloat(trailingNumMatch[2]);
    }

    try {
      const itemData: {
        name: string;
        quantity: number;
        unit: string;
        category: string;
        notes: string;
        group_id?: number;
      } = {
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
      if (showToast) showToast("Error adding item", "error", 6000, {
        label: "Retry",
        onClick: () => handleAddItem(text),
      });
    }
  };

  // Update suggestions as the user types
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewItemText(value);
    const results = getSuggestions(value);
    setSuggestions(results);
  };

  // Apply a selected autocomplete suggestion to the input
  const handleSelectSuggestion = (suggestion: GroceryItem) => {
    const newText = applySuggestion(newItemText, suggestion.name);
    setNewItemText(newText);
    setSuggestions([]);
    resetSelection();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Keyboard navigation for the autocomplete dropdown and Enter-to-add
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      // Enter with a highlighted suggestion applies it instead of adding
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

  // Undo-able delete for a single shopping list item
  const handleDelete = (id: number) => {
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

  // Clear the entire shopping list with undo support
  const handleClearAll = () => {
    if (shoppingItems.length === 0) return;

    const count = shoppingItems.length;

    scheduleDelete({
      id: `clear-shopping-${Date.now()}`,
      queryKeyPrefix: ["shoppingList"],
      filterFn: () => false, // remove all items from the optimistic cache
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

  // One-click add a low/out-of-stock pantry item to the shopping list
  const handleAddFromPantry = async (pantryItem: PantryItem) => {
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

  // Add a shopping item to the pantry and remove it from the list ("bought it")
  const handleAddToPantry = async (item: ShoppingListItem) => {
    try {
      await addToPantryMutation.mutateAsync({
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || "",
        category: item.category || "",
        stock_status: "full",
        expiration_date: "",
        purchase_date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      // Remove from shopping list after adding to pantry
      await deleteMutation.mutateAsync(item.id);
      showToast(`${item.name} added to pantry`, "success");
    } catch (error) {
      console.error("Error adding to pantry:", error);
      showToast("Error adding item to pantry", "error");
    }
  };

  // Check if a pantry item is already represented in the shopping list
  // using the semantic match map (compares as strings for type safety).
  const isItemInShoppingList = (pantryItemId: number) => {
    return Object.values(pantryMatches).some(
      (matchedPantry: PantryMatch) => String(matchedPantry?.id) === String(pantryItemId)
    );
  };

  // Format display text with quantity and unit when present
  const formatItemDisplay = (item: ShoppingListItem) => {
    let display = item.name;
    if (item.quantity && item.quantity !== 1) {
      display = `${item.quantity}${item.unit ? ' ' + item.unit : ''} ${item.name}`;
    } else if (item.unit) {
      display = `${item.name} (${item.unit})`;
    }
    return display;
  };

  // Look up the pantry match for a shopping item by ID.
  // JSON keys are always strings, so we check both string and raw ID.
  const getPantryMatch = (shoppingItemId: number): PantryMatch | null => {
    return pantryMatches[String(shoppingItemId)] || pantryMatches[shoppingItemId as unknown as string] || null;
  };

  // Map stock status to icon, label, and CSS class
  const getStockStatusInfo = (status: StockStatus) => {
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
            disabled={clearMutation.isPending || !isOnline}
            title="Clear all items"
          >
            <Trash2 size={16} />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="shopping-offline-banner">
          <WifiOff size={14} />
          <span>You're offline — viewing your cached list</span>
        </div>
      )}

      {/* Group Selector */}
      <ShoppingListGroupSelector
        selectedGroupId={selectedGroupId}
        onSelectGroup={setSelectedGroupId}
        showToast={showToast}
      />

      {/* Modern List Card */}
      <div className="list-card">
        {/* Add item input with autocomplete */}
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
            disabled={createMutation.isPending || !isOnline}
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
                  onMouseDown={(e: React.MouseEvent) => {
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
              <SkeletonShoppingList count={5} />
            </div>
          ) : shoppingItems.length === 0 ? (
            <div className="list-empty">
              <ShoppingCart size={48} strokeWidth={1} />
              <p>Your shopping list is empty</p>
              <span>Add items above to get started</span>
            </div>
          ) : (
            <ul className="shopping-items">
              {shoppingItems.map((item: ShoppingListItem) => {
                const pantryMatch = getPantryMatch(item.id);
                const stockInfo = pantryMatch ? getStockStatusInfo(pantryMatch.stock_status) : null;

                return (
                  <li key={item.id}>
                    <SwipeableRow
                      actions={[
                        {
                          icon: <Package size={18} />,
                          label: "Pantry",
                          color: "white",
                          bg: "var(--accent-primary)",
                          onClick: () => handleAddToPantry(item),
                        },
                        {
                          icon: <Trash2 size={18} />,
                          label: "Delete",
                          color: "white",
                          bg: "var(--accent-danger)",
                          onClick: () => handleDelete(item.id),
                        },
                      ]}
                    >
                      <div className="shopping-item">
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
                        <div className="item-actions">
                          <button
                            className="item-add-to-pantry"
                            onClick={() => handleAddToPantry(item)}
                            disabled={addToPantryMutation.isPending || !isOnline}
                            title="Bought — add to pantry"
                          >
                            <Package size={16} />
                          </button>
                          <button
                            className="item-delete"
                            onClick={() => handleDelete(item.id)}
                            disabled={deleteMutation.isPending || !isOnline}
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </SwipeableRow>
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

      {/* Pantry Needs Section -- surfaces low/out-of-stock items as quick-add chips */}
      {pantryNeeds.length > 0 && (
        <div className="pantry-needs-section">
          <h3>
            <Package size={18} /> Running Low in Pantry
          </h3>
          <div className="pantry-needs-chips">
            {pantryNeeds.map((item: PantryItem) => {
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
