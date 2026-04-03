import type { FC, RefObject } from "react";
import { motion } from "framer-motion";
import { Mic, Keyboard, Camera, Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import "./VoxyFAB.css";

export interface QuickRecordPopupHandle {
  triggerOpen: () => void;
  triggerRecord: () => void;
  triggerType: () => void;
  triggerScan: () => void;
}

interface Props {
  popupRef: RefObject<QuickRecordPopupHandle | null>;
}

const VoxyFAB: FC<Props> = ({ popupRef }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <>
      <div className="voxy-bar" data-tutorial="voxy-fab">
        <motion.button
          className="voxy-bar-btn voxy-bar-btn--secondary"
          onClick={() => popupRef.current?.triggerType()}
          title="Type a message"
          aria-label="Type a message"
          whileTap={{ scale: 0.9 }}
        >
          <Keyboard size={16} />
        </motion.button>

        <motion.button
          className="voxy-bar-btn voxy-bar-btn--primary"
          onClick={() => popupRef.current?.triggerRecord()}
          title="Tap to talk"
          aria-label="Record voice"
          whileTap={{ scale: 0.9 }}
        >
          <Mic size={22} />
        </motion.button>

        <motion.button
          className="voxy-bar-btn voxy-bar-btn--secondary"
          onClick={() => popupRef.current?.triggerScan()}
          title="Scan a receipt"
          aria-label="Scan receipt"
          whileTap={{ scale: 0.9 }}
        >
          <Camera size={16} />
        </motion.button>
      </div>

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
