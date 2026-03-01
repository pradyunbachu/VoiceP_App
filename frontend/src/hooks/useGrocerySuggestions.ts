import { useMemo, useState, useCallback } from "react";
import Fuse from "fuse.js";
import { GROCERY_ITEMS } from "../constants/groceryItems";
import type { GroceryItem } from "../types";

const FUSE_OPTIONS = {
  keys: ["name"],
  threshold: 0.4,
  minMatchCharLength: 2,
};

function stripQuantityPrefix(text: string): { prefix: string; searchTerm: string } {
  const match = text.match(/^(\d+\.?\d*)\s+(.+)$/);
  if (match) {
    return { prefix: match[1] + " ", searchTerm: match[2] };
  }
  return { prefix: "", searchTerm: text };
}

export function useGrocerySuggestions() {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const fuse = useMemo(() => new Fuse(GROCERY_ITEMS, FUSE_OPTIONS), []);

  const getSuggestions = useCallback(
    (input: string): GroceryItem[] => {
      const trimmed = input.trim();
      if (!trimmed) {
        setIsOpen(false);
        setSelectedIndex(-1);
        return [];
      }

      const { searchTerm } = stripQuantityPrefix(trimmed);

      if (searchTerm.length < 2) {
        setIsOpen(false);
        setSelectedIndex(-1);
        return [];
      }

      const results = fuse.search(searchTerm, { limit: 6 });
      const hasResults = results.length > 0;
      setIsOpen(hasResults);
      setSelectedIndex(-1);
      return results.map((r) => r.item);
    },
    [fuse]
  );

  const navigateUp = useCallback(() => {
    setSelectedIndex((prev) => (prev <= 0 ? -1 : prev - 1));
  }, []);

  const navigateDown = useCallback((maxIndex: number) => {
    setSelectedIndex((prev) => (prev >= maxIndex ? maxIndex : prev + 1));
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedIndex(-1);
    setIsOpen(false);
  }, []);

  const applySuggestion = useCallback((inputText: string, suggestionName: string): string => {
    const { prefix } = stripQuantityPrefix(inputText.trim());
    return prefix + suggestionName;
  }, []);

  return {
    selectedIndex,
    isOpen,
    getSuggestions,
    navigateUp,
    navigateDown,
    resetSelection,
    applySuggestion,
  };
}

export default useGrocerySuggestions;
