/**
 * ConfirmDialog.jsx - Reusable confirmation modal dialog.
 *
 * Displays a warning icon, a message, and Cancel/Confirm buttons.
 * Clicking the overlay backdrop dismisses the dialog (calls onCancel).
 * The `danger` prop styles the confirm button red for destructive actions.
 */
import type { FC } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import "./ConfirmDialog.css";

interface Props {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmDialog: FC<Props> = ({ message, onConfirm, onCancel, confirmLabel = "Delete", danger = true }) => {
  // Render through a portal to <body> so `position: fixed` anchors to the
  // viewport. Mounted inside the nav (which has a backdrop-filter/transform),
  // a fixed overlay would otherwise be trapped by the nav's containing block —
  // rendering clipped at the top instead of centered full-screen.
  return createPortal(
    <motion.div
      className="confirm-overlay"
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Stop propagation so clicking inside the dialog doesn't dismiss it */}
      <motion.div
        className="confirm-dialog"
        onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        <div className={`confirm-icon${danger ? "" : " info"}`}>
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
      </motion.div>
    </motion.div>,
    document.body
  );
};

export default ConfirmDialog;
