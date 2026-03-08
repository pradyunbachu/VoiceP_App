/**
 * ToastContainer.jsx - Fixed-position container that stacks active toast notifications.
 *
 * Receives the array of toast objects and a removal callback from the parent.
 * Renders nothing when there are no toasts to avoid an empty DOM node.
 */
import type { FC } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          >
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => removeToast(toast.id)}
              duration={toast.duration}
              action={toast.action}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
