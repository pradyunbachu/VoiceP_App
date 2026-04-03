/**
 * AddToPantryModal — Modal for adding grocery expense items to the pantry.
 * Clean inline rows: checkbox + name + (- qty +) + unit dropdown + delete.
 */
import React, { useState } from "react";
import { Package, X, Check, Plus, Trash2, Minus } from "lucide-react";
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

const COMMON_UNITS = ["", "lb", "oz", "kg", "g", "gal", "L", "ct", "bag", "box", "bunch", "can", "pack", "piece"];

interface Props {
  expense: Expense;
  onClose: () => void;
  onSuccess?: () => void;
}

const AddToPantryModal: React.FC<Props> = ({ expense, onClose, onSuccess }) => {
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
  const addFromExpenseMutation = useAddFromExpense();

  const updateItem = (index: number, field: keyof ParsedItem, value: string | number | boolean): void => {
    const next = [...items];
    (next[index] as unknown as Record<string, unknown>)[field] = value;
    setItems(next);
  };

  const adjustQty = (index: number, delta: number): void => {
    const next = [...items];
    next[index].quantity = Math.max(0, +(next[index].quantity + delta).toFixed(1));
    setItems(next);
  };

  const toggleItem = (index: number): void => {
    const next = [...items];
    next[index].selected = !next[index].selected;
    setItems(next);
  };

  const removeItem = (index: number): void => setItems(items.filter((_, i) => i !== index));

  const addItem = (): void => {
    setItems([...items, { id: Date.now(), name: "", quantity: 1, unit: "", category: "Other", expiration_date: "", selected: true }]);
  };

  const handleSubmit = async (): Promise<void> => {
    const selected = items.filter((i) => i.selected && i.name.trim());
    if (selected.length === 0) { onClose(); return; }
    try {
      await addFromExpenseMutation.mutateAsync({
        expenseId: expense.id,
        items: selected.map((i) => ({ name: i.name.trim(), quantity: i.quantity, unit: i.unit || undefined, category: i.category })),
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
      <div className="modal-content" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Package size={20} />
            <h3>Add to Pantry</h3>
          </div>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          <div className="expense-info">
            <span className="store-name">{expense?.store}</span>
            <span className="expense-date">{expense?.date}</span>
          </div>

          <div className="pantry-items-list">
            {items.map((item, index) => (
              <div key={item.id} className={`pantry-item-row${item.selected ? " selected" : ""}`}>
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggleItem(index)}
                  className="item-checkbox"
                />

                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(index, "name", e.target.value)}
                  placeholder="Item name"
                  className="item-name-input"
                />

                <div className="item-qty-group">
                  <button className="item-qty-btn" onClick={() => adjustQty(index, -1)} type="button">
                    <Minus size={12} />
                  </button>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                    min="0"
                    step="0.1"
                    className="item-qty-input"
                  />
                  <button className="item-qty-btn" onClick={() => adjustQty(index, 1)} type="button">
                    <Plus size={12} />
                  </button>
                </div>

                <select
                  value={item.unit}
                  onChange={(e) => updateItem(index, "unit", e.target.value)}
                  className="item-unit-select"
                >
                  {COMMON_UNITS.map((u) => (
                    <option key={u} value={u}>{u || "unit"}</option>
                  ))}
                </select>

                <button className="item-delete-btn" onClick={() => removeItem(index)} type="button">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button className="add-more-btn" onClick={addItem} type="button">
            <Plus size={14} />
            <span>Add Another Item</span>
          </button>
        </div>

        <div className="modal-footer">
          <button className="skip-btn" onClick={onClose}>Skip</button>
          <button
            className="confirm-btn"
            onClick={handleSubmit}
            disabled={addFromExpenseMutation.isPending || selectedCount === 0}
          >
            {addFromExpenseMutation.isPending ? "Adding..." : (
              <><Check size={16} /> Add {selectedCount} Item{selectedCount !== 1 ? "s" : ""} to Pantry</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToPantryModal;
