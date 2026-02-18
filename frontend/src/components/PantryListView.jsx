/**
 * PantryListView.jsx - Virtualized grid list view for pantry items.
 *
 * Uses @tanstack/react-virtual to render only the visible rows of pantry
 * cards, supporting infinite scroll. Each card shows item details, inline
 * editing, stock status controls, and expiration/purchase date badges.
 */
import {
  Trash2,
  Edit2,
  Check,
  X,
  Calendar,
  Tag,
  CheckSquare,
  Square,
  ShoppingCart,
  Loader,
} from "lucide-react";
import { PANTRY_CATEGORIES } from "../constants/pantryCategories";
import { getStatusIcon, getStatusLabel, isExpiringSoon, isExpired } from "../lib/pantryUtils";
import "./Pantry.css";

const PantryListView = ({
  rows,
  virtualizer,
  scrollRef,
  isFetchingNextPage,
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
  onToggleSelect,
  updatePending,
  deletePending,
}) => {
  return (
    <div ref={scrollRef} className="pantry-list-scroll-container">
      {/* Outer container sized to the total virtual height so the
          scrollbar reflects the full list length */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const rowItems = rows[virtualRow.index];
          if (!rowItems) return null;
          return (
            <div
              key={virtualRow.index}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                // Position each row via translateY for smooth virtual scrolling
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="pantry-items-virtual-row">
                {rowItems.map((item) => (
                  <div
                    key={item.id}
                    className={`pantry-card ${item.stock_status} ${selectedItems.has(item.id) ? 'selected' : ''} ${isExpired(item.expiration_date) ? 'expired' : ''} ${isExpiringSoon(item.expiration_date) ? 'expiring-soon' : ''}`}
                  >
                    {/* Bulk-select checkbox shown only in select mode */}
                    {isSelectMode && (
                      <button
                        className="checkbox-button"
                        onClick={() => onToggleSelect(item.id)}
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
                            onChange={(e) => onEditFormChange({...editForm, name: e.target.value})}
                            placeholder="Item name"
                          />
                          <select
                            value={editForm.category}
                            onChange={(e) => onEditFormChange({...editForm, category: e.target.value})}
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
                            onChange={(e) => onEditFormChange({...editForm, quantity: parseFloat(e.target.value) || 1})}
                            placeholder="Qty"
                          />
                          <input
                            type="text"
                            value={editForm.unit}
                            onChange={(e) => onEditFormChange({...editForm, unit: e.target.value})}
                            placeholder="Unit"
                          />
                        </div>
                        <div className="edit-row">
                          <input
                            type="date"
                            value={editForm.expiration_date}
                            onChange={(e) => onEditFormChange({...editForm, expiration_date: e.target.value, expiration_predicted: false})}
                            title="Expiration date"
                          />
                          <input
                            type="date"
                            value={editForm.purchase_date}
                            onChange={(e) => onEditFormChange({...editForm, purchase_date: e.target.value})}
                            title="Purchase date"
                          />
                        </div>
                        <div className="edit-row">
                          <select
                            value={editForm.stock_status}
                            onChange={(e) => onEditFormChange({...editForm, stock_status: e.target.value})}
                          >
                            <option value="full">In Stock</option>
                            <option value="low">Low Stock</option>
                            <option value="out_of_stock">Out of Stock</option>
                          </select>
                        </div>
                        <input
                          type="text"
                          value={editForm.notes}
                          onChange={(e) => onEditFormChange({...editForm, notes: e.target.value})}
                          placeholder="Notes"
                          className="edit-notes"
                        />
                        <div className="edit-actions">
                          <button
                            className="save-btn"
                            onClick={() => onSaveEdit(item.id)}
                            disabled={updatePending}
                          >
                            <Check size={16} /> {updatePending ? "Saving..." : "Save"}
                          </button>
                          <button className="cancel-btn" onClick={onCancelEdit}>
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
                              <button className="edit-button" onClick={() => onStartEdit(item)} title="Edit">
                                <Edit2 size={16} />
                              </button>
                              <button
                                className="delete-button"
                                onClick={() => onDelete(item.id)}
                                title="Delete"
                                disabled={deletePending}
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
                                onClick={() => onStatusChange(item.id, status)}
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
                              {/* Append T00:00:00 to avoid timezone-shift issues with date-only strings */}
                              {new Date(item.expiration_date + 'T00:00:00').toLocaleDateString()}
                              {item.expiration_predicted && <span className="predicted-badge">est.</span>}
                            </span>
                          )}
                          {item.purchase_date && (
                            <span className="purchase-date">
                              <ShoppingCart size={14} />
                              Purchased: {new Date(item.purchase_date + 'T00:00:00').toLocaleDateString()}
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
            </div>
          );
        })}
      </div>

      {/* Loading spinner at bottom */}
      {isFetchingNextPage && (
        <div className="infinite-scroll-loading">
          <Loader size={20} className="spinner" />
          <span>Loading more...</span>
        </div>
      )}
    </div>
  );
};

export default PantryListView;
