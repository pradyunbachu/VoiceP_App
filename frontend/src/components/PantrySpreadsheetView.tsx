/**
 * PantrySpreadsheetView.tsx - Table/spreadsheet view for pantry items.
 *
 * Renders all pantry items in a sortable, editable table with inline
 * editing, status controls, and expiration/purchase date display.
 */
import { useState } from "react";
import type { PantryItem, StockStatus } from "../types/index";
import {
  Trash2,
  Edit2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Plus,
  Minus,
  CheckSquare,
  Square,
} from "lucide-react";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import { getStatusIcon, getStatusLabel, isExpiringSoon, isExpired } from "../lib/pantryUtils";
import "./Pantry.css";

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

interface Props {
  items: PantryItem[];
  editingId: number | null;
  editForm: EditFormData;
  isSelectMode: boolean;
  selectedItems: Set<number>;
  onEditFormChange: (form: EditFormData) => void;
  onStartEdit: (item: PantryItem) => void;
  onSaveEdit: (id: number) => Promise<void>;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: StockStatus) => void;
  onQuantityChange: (id: number, delta: number) => void;
  onToggleSelect: (id: number) => void;
  updatePending: boolean;
  deletePending: boolean;
}

type SortField = "name" | "category" | "quantity" | "stock_status" | "expiration_date" | "purchase_date";

const PantrySpreadsheetView: React.FC<Props> = ({
  items,
  editingId,
  editForm,
  isSelectMode,
  selectedItems,
  onEditFormChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onStatusChange,
  onQuantityChange,
  onToggleSelect,
  updatePending,
  deletePending,
}) => {
  const [localSort, setLocalSort] = useState<{ field: SortField; order: "asc" | "desc" } | null>(null);

  const handleSort = (field: SortField) => {
    setLocalSort((prev) => {
      if (prev?.field === field) {
        return { field, order: prev.order === "asc" ? "desc" : "asc" };
      }
      return { field, order: "asc" };
    });
  };

  const sortedItems = localSort
    ? [...items].sort((a, b) => {
        const dir = localSort.order === "asc" ? 1 : -1;
        const field = localSort.field;
        const aVal = a[field] ?? "";
        const bVal = b[field] ?? "";
        if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
        return String(aVal).localeCompare(String(bVal)) * dir;
      })
    : items;

  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th className="spreadsheet-th" onClick={() => handleSort(field)}>
      <div className="spreadsheet-th-content">
        {label}
        <span className="spreadsheet-sort-icon">
          {localSort?.field === field ? (
            localSort.order === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
          ) : (
            <ChevronUp size={14} className="spreadsheet-sort-inactive" />
          )}
        </span>
      </div>
    </th>
  );

  const nextStatus = (s: StockStatus): StockStatus =>
    s === "full" ? "low" : s === "low" ? "out_of_stock" : "full";

  return (
    <div className="spreadsheet-container">
      <div className="spreadsheet-scroll">
        <table className="spreadsheet-table">
          <thead>
            <tr>
              {isSelectMode && <th className="spreadsheet-th spreadsheet-th-check" />}
              <SortHeader field="name" label="Name" />
              <SortHeader field="category" label="Category" />
              <SortHeader field="quantity" label="Qty" />
              <th className="spreadsheet-th">Unit</th>
              <SortHeader field="stock_status" label="Status" />
              <SortHeader field="expiration_date" label="Expires" />
              <SortHeader field="purchase_date" label="Purchased" />
              <th className="spreadsheet-th">Notes</th>
              <th className="spreadsheet-th spreadsheet-th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => {
              const isEditing = editingId === item.id;
              const expiring = isExpiringSoon(item.expiration_date);
              const expired = isExpired(item.expiration_date);

              return (
                <tr
                  key={item.id}
                  className={`spreadsheet-row ${isEditing ? "spreadsheet-row-editing" : ""} ${expired ? "spreadsheet-row-expired" : expiring ? "spreadsheet-row-expiring" : ""}`}
                >
                  {isSelectMode && (
                    <td className="spreadsheet-td spreadsheet-td-check">
                      <button className="spreadsheet-check-btn" onClick={() => onToggleSelect(item.id)}>
                        {selectedItems.has(item.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </td>
                  )}

                  {/* Name */}
                  <td className="spreadsheet-td spreadsheet-td-name">
                    {isEditing ? (
                      <input
                        className="spreadsheet-input"
                        value={editForm.name}
                        onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
                      />
                    ) : (
                      <span className="spreadsheet-name">{item.name}</span>
                    )}
                  </td>

                  {/* Category */}
                  <td className="spreadsheet-td">
                    {isEditing ? (
                      <select
                        className="spreadsheet-select"
                        value={editForm.category}
                        onChange={(e) => onEditFormChange({ ...editForm, category: e.target.value })}
                      >
                        {PANTRY_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="spreadsheet-category-badge">{item.category}</span>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="spreadsheet-td spreadsheet-td-qty">
                    {isEditing ? (
                      <input
                        className="spreadsheet-input spreadsheet-input-qty"
                        type="number"
                        step="0.1"
                        value={editForm.quantity}
                        onChange={(e) => onEditFormChange({ ...editForm, quantity: parseFloat(e.target.value) || 1 })}
                      />
                    ) : (
                      <div className="spreadsheet-qty-controls">
                        <button className="spreadsheet-qty-btn" onClick={() => onQuantityChange(item.id, -1)} title="Decrease">
                          <Minus size={12} />
                        </button>
                        <span className="spreadsheet-qty-value">{item.quantity}</span>
                        <button className="spreadsheet-qty-btn" onClick={() => onQuantityChange(item.id, 1)} title="Increase">
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </td>

                  {/* Unit */}
                  <td className="spreadsheet-td">
                    {isEditing ? (
                      <input
                        className="spreadsheet-input spreadsheet-input-unit"
                        value={editForm.unit}
                        onChange={(e) => onEditFormChange({ ...editForm, unit: e.target.value })}
                      />
                    ) : (
                      <span>{item.unit || "—"}</span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="spreadsheet-td">
                    {isEditing ? (
                      <select
                        className="spreadsheet-select"
                        value={editForm.stock_status}
                        onChange={(e) => onEditFormChange({ ...editForm, stock_status: e.target.value as StockStatus })}
                      >
                        <option value="full">In Stock</option>
                        <option value="low">Low</option>
                        <option value="out_of_stock">Out</option>
                      </select>
                    ) : (
                      <button
                        className={`spreadsheet-status-btn spreadsheet-status-${item.stock_status}`}
                        onClick={() => onStatusChange(item.id, nextStatus(item.stock_status))}
                        title={`Click to change status`}
                      >
                        {getStatusIcon(item.stock_status)}
                        <span>{getStatusLabel(item.stock_status)}</span>
                      </button>
                    )}
                  </td>

                  {/* Expiration */}
                  <td className="spreadsheet-td">
                    {isEditing ? (
                      <input
                        className="spreadsheet-input"
                        type="date"
                        value={editForm.expiration_date}
                        onChange={(e) => onEditFormChange({ ...editForm, expiration_date: e.target.value })}
                      />
                    ) : (
                      <span className={expired ? "spreadsheet-date-expired" : expiring ? "spreadsheet-date-expiring" : ""}>
                        {formatDate(item.expiration_date)}
                        {item.expiration_predicted && <span className="spreadsheet-predicted" title="AI predicted">~</span>}
                      </span>
                    )}
                  </td>

                  {/* Purchase Date */}
                  <td className="spreadsheet-td">
                    {isEditing ? (
                      <input
                        className="spreadsheet-input"
                        type="date"
                        value={editForm.purchase_date}
                        onChange={(e) => onEditFormChange({ ...editForm, purchase_date: e.target.value })}
                      />
                    ) : (
                      formatDate(item.purchase_date)
                    )}
                  </td>

                  {/* Notes */}
                  <td className="spreadsheet-td spreadsheet-td-notes">
                    {isEditing ? (
                      <input
                        className="spreadsheet-input"
                        value={editForm.notes}
                        onChange={(e) => onEditFormChange({ ...editForm, notes: e.target.value })}
                      />
                    ) : (
                      <span className="spreadsheet-notes-text">{item.notes || "—"}</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="spreadsheet-td spreadsheet-td-actions">
                    {isEditing ? (
                      <div className="spreadsheet-action-btns">
                        <button
                          className="spreadsheet-action-btn spreadsheet-save-btn"
                          onClick={() => onSaveEdit(item.id)}
                          disabled={updatePending}
                          title="Save"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          className="spreadsheet-action-btn spreadsheet-cancel-btn"
                          onClick={onCancelEdit}
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="spreadsheet-action-btns">
                        <button
                          className="spreadsheet-action-btn"
                          onClick={() => onStartEdit(item)}
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="spreadsheet-action-btn spreadsheet-delete-btn"
                          onClick={() => onDelete(item.id)}
                          disabled={deletePending}
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sortedItems.length === 0 && (
        <div className="spreadsheet-empty">No items match your filters</div>
      )}
    </div>
  );
};

export default PantrySpreadsheetView;
