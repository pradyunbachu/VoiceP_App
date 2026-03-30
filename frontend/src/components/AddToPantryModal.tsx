/**
 * AddToPantryModal.jsx - Modal for adding grocery expense items to the pantry.
 *
 * Parses the comma-separated items string from an expense, attempts to extract
 * quantities/units (e.g. "2 lbs chicken", "eggs x12"), auto-detects categories,
 * and lets the user review/edit before submitting selected items to the pantry.
 */
import React, { useState } from "react";
import { Package, X, Check, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import { detectCategory, isPantryItem } from "../lib/categoryDetection";
import { parseQuantityFromItem } from "../lib/quantityParser";
import { useAddFromExpense } from "../hooks";
import type { Expense } from "../types";
import "./AddToPantryModal.css";

interface ParsedItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  expiration_date: string;
  selected: boolean;
}

interface Props {
  expense: Expense;
  onClose: () => void;
  onSuccess?: () => void;
}

const AddToPantryModal: React.FC<Props> = ({ expense, onClose, onSuccess }) => {

  // Split the comma-separated expense items string and parse each one.
  // Non-pantry items (e.g. cleaning supplies) are pre-deselected via isPantryItem.
  const parseItems = (itemsString: string | undefined): ParsedItem[] => {
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

  const [items, setItems] = useState<ParsedItem[]>(parseItems(expense?.items));

  // React Query mutation
  const addFromExpenseMutation = useAddFromExpense();

  const handleItemChange = (index: number, field: keyof ParsedItem, value: string | number | boolean): void => {
    const newItems = [...items];
    (newItems[index] as unknown as Record<string, unknown>)[field] = value;
    setItems(newItems);
  };

  const toggleItemSelection = (index: number): void => {
    const newItems = [...items];
    newItems[index].selected = !newItems[index].selected;
    setItems(newItems);
  };

  const removeItem = (index: number): void => {
    setItems(items.filter((_, i) => i !== index));
  };

  const addItem = (): void => {
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
  const handleSubmit = async (): Promise<void> => {
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
          unit: item.unit || undefined,
          category: item.category,
        })),
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error("Error adding to pantry:", error);
    }
  };

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const selectedCount = items.filter((i) => i.selected).length;

  const toggleExpanded = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
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
          <div className="expense-info">
            <span className="store-name">{expense?.store}</span>
            <span className="expense-date">{expense?.date}</span>
          </div>

          <div className="pantry-items-list">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`pantry-item-row ${item.selected ? "selected" : ""}`}>
                {/* Compact row: checkbox + name + qty + expand toggle */}
                <div className="item-compact-row">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => toggleItemSelection(index)}
                    className="item-checkbox"
                  />
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleItemChange(index, "name", e.target.value)
                    }
                    placeholder="Item name"
                    className="item-name-input"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleItemChange(index, "quantity", parseFloat(e.target.value) || 1)
                    }
                    min="0"
                    step="0.1"
                    className="item-quantity-input item-qty-compact"
                  />
                  {item.unit && <span className="item-unit-label">{item.unit}</span>}
                  <button
                    className="item-expand-btn"
                    onClick={() => toggleExpanded(index)}
                    title="Edit details"
                  >
                    {expandedIndex === index ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button
                    className="remove-item-btn"
                    onClick={() => removeItem(index)}
                    title="Remove item">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Expanded details — only shown when toggled */}
                {expandedIndex === index && (
                  <div className="item-details">
                    <div className="detail-field">
                      <label>Unit</label>
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
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
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
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
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          handleItemChange(index, "expiration_date", e.target.value)
                        }
                        className="item-expiry-input"
                      />
                    </div>
                  </div>
                )}
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
