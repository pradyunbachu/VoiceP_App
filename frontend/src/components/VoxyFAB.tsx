import type { FC, RefObject } from "react";
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
      <button
        className="voxy-fab"
        data-tutorial="voxy-fab"
        onClick={() => popupRef.current?.triggerOpen()}
        title="Open Voxy — voice, type, or scan"
        aria-label="Open Voxy assistant"
      >
        <Mic size={20} />
      </button>
      <button
        className="theme-toggle-fixed"
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </>
  );
};

export default VoxyFAB;
