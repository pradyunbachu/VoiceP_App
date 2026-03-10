import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Theme, ThemeContextValue } from "../types";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") return saved;

    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    // Enable synchronized transition on all elements, then swap theme
    document.documentElement.setAttribute("data-theme-transitioning", "");
    setTheme(prev => prev === "dark" ? "light" : "dark");
    // Remove after transition completes so it doesn't affect normal interactions
    setTimeout(() => {
      document.documentElement.removeAttribute("data-theme-transitioning");
    }, 250);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
