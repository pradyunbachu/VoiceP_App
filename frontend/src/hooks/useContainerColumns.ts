import { useState, useCallback, useRef, useEffect } from 'react';

export function useContainerColumns(minWidth = 280, gap = 16) {
  const [columnCount, setColumnCount] = useState(1);
  const observerRef = useRef<ResizeObserver | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);

  const containerRef = useCallback(
    (node: HTMLElement | null) => {
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

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return { columnCount, containerRef };
}
