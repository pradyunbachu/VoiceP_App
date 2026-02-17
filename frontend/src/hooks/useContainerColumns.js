import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * ResizeObserver-based hook that calculates how many grid columns fit in a container.
 * @param {number} minWidth  – minimum column width in px (default 280)
 * @param {number} gap       – gap between columns in px (default 16)
 * @returns {{ columnCount: number, containerRef: (node: HTMLElement|null) => void }}
 */
export function useContainerColumns(minWidth = 280, gap = 16) {
  const [columnCount, setColumnCount] = useState(1);
  const observerRef = useRef(null);
  const nodeRef = useRef(null);

  const containerRef = useCallback(
    (node) => {
      // Disconnect previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      nodeRef.current = node;
      if (!node) return;

      const calculate = () => {
        const width = node.clientWidth;
        const cols = Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
        setColumnCount(cols);
      };

      calculate();

      observerRef.current = new ResizeObserver(calculate);
      observerRef.current.observe(node);
    },
    [minWidth, gap]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return { columnCount, containerRef };
}
