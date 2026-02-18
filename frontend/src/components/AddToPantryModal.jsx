/**
 * AddToPantryModal.jsx - Modal for adding grocery expense items to the pantry.
 *
 * Parses the comma-separated items string from an expense, attempts to extract
 * quantities/units (e.g. "2 lbs chicken", "eggs x12"), auto-detects categories,
 * and lets the user review/edit before submitting selected items to the pantry.
 */
import { useState } from "react";
import { Package, X, Check, Plus, Trash2 } from "lucide-react";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import { detectCategory, isPantryItem } from "../lib/categoryDetection";
import { useAddFromExpense } from "../hooks";
import "./AddToPantryModal.css";

const AddToPantryModal = ({ expense, onClose, onSuccess }) => {
  // Extract quantity, unit, and name from a single item string.
  // Supports patterns like "6 chocolates", "2 lbs chicken", "eggs x12", "eggs (12)".
  const parseQuantityFromItem = (itemStr) => {
    const trimmed = itemStr.trim();

    // Pattern 1: leading number -- "6 chocolates", "2 lbs chicken"
    const leadingNumMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
    if (leadingNumMatch) {
      const qty = parseFloat(leadingNumMatch[1]);
      let rest = leadingNumMatch[2].trim();

      // Check for unit words between quantity and name
      const unitMatch = rest.match(
        /^(lbs?|oz|kg|g|gallons?|liters?|bags?|boxes?|cans?|bottles?|packs?|dozen)\s+(?:of\s+)?(.+)$/i
      );
      if (unitMatch) {
        return { quantity: qty, unit: unitMatch[1], name: unitMatch[2] };
      }
      return { quantity: qty, unit: "", name: rest };
    }

    // Pattern 2: trailing "x" multiplier -- "chocolates x6"
    const trailingXMatch = trimmed.match(/^(.+?)\s*x\s*(\d+(?:\.\d+)?)$/i);
    if (trailingXMatch) {
      return {
        quantity: parseFloat(trailingXMatch[2]),
        unit: "",
        name: trailingXMatch[1].trim(),
      };
    }

    // Pattern 3: parenthesized quantity -- "chocolates (6)"
    const parenMatch = trimmed.match(/^(.+?)\s*\((\d+(?:\.\d+)?)\)$/);
    if (parenMatch) {
      return {
        quantity: parseFloat(parenMatch[2]),
        unit: "",
        name: parenMatch[1].trim(),
      };
    }

    // No quantity found -- default to 1
    return { quantity: 1, unit: "", name: trimmed };
  };

  // Split the comma-separated expense items string and parse each one.
  // Non-pantry items (e.g. cleaning supplies) are pre-deselected via isPantryItem.
  const parseItems = (itemsString) => {
    if (!itemsString) return [];
    return itemsString.split(",").map((item, index) => {
      const parsed = parseQuantityFromItem(item);
      return {
        id: index,
        name: parsed.name,
        quantity: parsed.quantity,
        unit: parsed.unit,
        category: detectCategory(parsed.name),
        expiration_date: "",
        selected: isPantryItem(parsed.name),
      };
    });
  };

  const [items, setItems] = useState(parseItems(expense?.items));

  // React Query mutation
  const addFromExpenseMutation = useAddFromExpense();

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const toggleItemSelection = (index) => {
    const newItems = [...items];
    newItems[index].selected = !newItems[index].selected;
    setItems(newItems);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now(),
        name: "",
        quantity: 1,
        unit: "",
        category: "Other",
        expiration_date: "",
        selected: true,
      },
    ]);
  };

  // Submit only the selected, non-empty items to the pantry API
  const handleSubmit = async () => {
    const selectedItems = items.filter((i) => i.selected && i.name.trim());

    if (selectedItems.length === 0) {
      onClose();
      return;
    }

    try {
      await addFromExpenseMutation.mutateAsync({
        expenseId: expense.id,
        items: selectedItems.map((item) => ({
          name: item.name.trim(),
          quantity: item.quantity,
          unit: item.unit || null,
          category: item.category,
          expiration_date: item.expiration_date || null,
        })),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Error adding to pantry:", error);
    }
  };

  const selectedCount = items.filter((i) => i.selected).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Package size={24} />
            <h3>Add to Pantry</h3>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Select items from your grocery purchase to add to your pantry:
          </p>

          <div className="expense-info">
            <span className="store-name">{expense?.store}</span>
            <span className="expense-date">{expense?.date}</span>
          </div>

          <div className="pantry-items-list">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`pantry-item-row ${
                  item.selected ? "selected" : ""
                }`}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggleItemSelection(index)}
                  className="item-checkbox"
                />
                <div className="item-fields">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) =>
                      handleItemChange(index, "name", e.target.value)
                    }
                    placeholder="Item name"
                    className="item-name-input"
                  />
                  <div className="item-details">
                    <div className="detail-field">
                      <label>Qty</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            "quantity",
                            parseFloat(e.target.value) || 1
                          )
                        }
                        min="0"
                        step="0.1"
                        className="item-quantity-input"
                      />
                    </div>
                    <div className="detail-field">
                      <label>Unit</label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) =>
                          handleItemChange(index, "unit", e.target.value)
                        }
                        placeholder="lbs, oz..."
                        className="item-unit-input"
                      />
                    </div>
                    <div className="detail-field">
                      <label>Category</label>
                      <select
                        value={item.category}
                        onChange={(e) =>
                          handleItemChange(index, "category", e.target.value)
                        }
                        className="item-category-select">
                        {PANTRY_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="detail-field">
                      <label>Expires</label>
                      <input
                        type="date"
                        value={item.expiration_date}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            "expiration_date",
                            e.target.value
                          )
                        }
                        className="item-expiry-input"
                      />
                    </div>
                  </div>
                </div>
                <button
                  className="remove-item-btn"
                  onClick={() => removeItem(index)}
                  title="Remove item">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button className="add-more-btn" onClick={addItem}>
            <Plus size={16} />
            <span>Add Another Item</span>
          </button>
        </div>

        <div className="modal-footer">
          <button className="skip-btn" onClick={onClose}>
            Skip
          </button>
          <button
            className="confirm-btn"
            onClick={handleSubmit}
            disabled={addFromExpenseMutation.isPending || selectedCount === 0}>
            {addFromExpenseMutation.isPending ? (
              "Adding..."
            ) : (
              <>
                <Check size={16} />
                <span>
                  Add {selectedCount} Item{selectedCount !== 1 ? "s" : ""} to
                  Pantry
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToPantryModal;
