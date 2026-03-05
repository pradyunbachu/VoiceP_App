/**
 * Toast.jsx - Individual toast notification with auto-dismiss.
 *
 * Renders a styled alert with an icon (success/error/warning/info),
 * message text, optional action button (e.g. "Undo"), and a close button.
 * Automatically dismisses after the given duration unless duration is 0.
 */
import { useEffect } from "react";
import type { FC } from "react";
import { CheckCircle, XCircle, AlertCircle, Info, ShoppingCart, X } from "lucide-react";
import type { ToastAction } from "../types";
import "./Toast.css";

interface Props {
  message: string;
  type?: "info" | "success" | "error" | "warning" | "celebration";
  onClose: () => void;
  duration?: number;
  action?: ToastAction | null;
}

const Toast: FC<Props> = ({ message, type = "info", onClose, duration = 5000, action = null }) => {
  // Auto-dismiss after `duration` ms; skipped if duration is 0 (persistent toast)
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: CheckCircle,
    error: XCircle,
    warning: AlertCircle,
    info: Info,
    celebration: ShoppingCart,
  };

  const Icon = icons[type] || Info;

  return (
    <div className={`toast toast-${type}`} role="alert">
      <Icon size={20} className="toast-icon" />
      <span className="toast-message">{message}</span>
      {/* Optional action button (e.g. "Undo") -- closes the toast after executing */}
      {action && (
        <button
          className="toast-action"
          onClick={() => {
            action.onClick();
            onClose();
          }}
        >
          {action.label}
        </button>
      )}
      <button
        className="toast-close"
        onClick={onClose}
        aria-label="Close notification"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default Toast;
