/**
 * DraggableShelfItem.jsx - A single draggable pantry item on a shelf.
 *
 * Uses dnd-kit's useDraggable hook to make the item draggable between
 * category shelves. Shows item name, quantity, purchase date, expiration
 * badges, and inline stock-status toggle buttons. Click opens the edit
 * modal; the X button removes the item from the pantry.
 */
import { useDraggable } from "@dnd-kit/core";
import { CheckCircle, AlertTriangle, Circle, X } from "lucide-react";
import { isExpiringSoon, isExpired } from "../lib/pantryUtils";
import "./Pantry.css";

const DraggableShelfItem = ({ item, onEdit, onRemove, onStatusChange }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: item.id });

  // Apply a CSS translate while dragging; elevate z-index so the item
  // floats above other shelf content during the drag.
  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 1000 : 1,
  };

  const expiringSoon = isExpiringSoon(item.expiration_date);
  const expired = isExpired(item.expiration_date);

  const statusOptions = [
    { value: 'full', label: 'Full', icon: <CheckCircle size={11} /> },
    { value: 'low', label: 'Low', icon: <AlertTriangle size={11} /> },
    { value: 'out_of_stock', label: 'Out', icon: <Circle size={11} /> },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`shelf-item ${item.stock_status} ${expired ? 'expired' : ''} ${expiringSoon && !expired ? 'expiring-soon' : ''} ${isDragging ? 'dragging' : ''}`}
      title={`${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}${item.expiration_date ? `\n${item.expiration_predicted ? '~' : ''}Expires: ${new Date(item.expiration_date).toLocaleDateString()}${item.expiration_predicted ? ' (estimated)' : ''}` : ''}${item.notes ? `\n${item.notes}` : ''}`}
      {...attributes}
      {...listeners}
    >
      {/* Remove button -- stopPropagation prevents triggering drag */}
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
      {/* Clicking the content area opens the edit modal */}
      <div className="shelf-item-content" onClick={(e) => {
        e.stopPropagation();
        onEdit(item);
      }}>
        <div className="shelf-item-name">{item.name}</div>
        {item.quantity && (
          <div className="shelf-item-qty">{item.quantity}{item.unit ? ` ${item.unit}` : ''}</div>
        )}
        {item.purchase_date && (
          <div className="shelf-item-purchase">Purch: {new Date(item.purchase_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
        )}
        {expiringSoon && !expired && (
          <div className="shelf-item-badge expiring">Exp Soon</div>
        )}
        {expired && (
          <div className="shelf-item-badge expired">Expired</div>
        )}
      </div>
      {/* Status toggle buttons -- stopPropagation on both click and
          pointerDown to prevent accidental drags while changing status */}
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

export default DraggableShelfItem;
