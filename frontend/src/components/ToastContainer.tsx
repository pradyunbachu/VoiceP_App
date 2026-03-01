/**
 * ToastContainer.jsx - Fixed-position container that stacks active toast notifications.
 *
 * Receives the array of toast objects and a removal callback from the parent.
 * Renders nothing when there are no toasts to avoid an empty DOM node.
 */
import type { FC } from "react";
import Toast from "./Toast";
import type { Toast as ToastType } from "../types";
import "./Toast.css";

interface Props {
  toasts: ToastType[];
  removeToast: (id: number) => void;
}

const ToastContainer: FC<Props> = ({ toasts, removeToast }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
          duration={toast.duration}
          action={toast.action}
        />
      ))}
    </div>
  );
};

export default ToastContainer;
