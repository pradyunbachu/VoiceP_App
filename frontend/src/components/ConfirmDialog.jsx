/**
 * ConfirmDialog.jsx - Reusable confirmation modal dialog.
 *
 * Displays a warning icon, a message, and Cancel/Confirm buttons.
 * Clicking the overlay backdrop dismisses the dialog (calls onCancel).
 * The `danger` prop styles the confirm button red for destructive actions.
 */
import { AlertTriangle } from "lucide-react";
import "./ConfirmDialog.css";

const ConfirmDialog = ({ message, onConfirm, onCancel, confirmLabel = "Delete", danger = true }) => {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      {/* Stop propagation so clicking inside the dialog doesn't dismiss it */}
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon">
          <AlertTriangle size={28} />
        </div>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`confirm-action-btn ${danger ? "danger" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
