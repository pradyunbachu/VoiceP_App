import type { FC, RefObject } from "react";
import { motion } from "framer-motion";
import { Mic, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import "./VoxyFAB.css";

export interface QuickRecordPopupHandle {
  triggerOpen: () => void;
}

interface Props {
  popupRef: RefObject<QuickRecordPopupHandle | null>;
}

const VoxyFAB: FC<Props> = ({ popupRef }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <motion.button
        className="voxy-fab"
        data-tutorial="voxy-fab"
        onClick={() => popupRef.current?.triggerOpen()}
        title="Open Voxy — voice, type, or scan"
        aria-label="Open Voxy assistant"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.3 }}
      >
        <Mic size={20} />
      </motion.button>
      <motion.button
        className="theme-toggle-fixed"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label="Toggle theme"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.4 }}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </motion.button>
    </>
  );
};

export default VoxyFAB;
