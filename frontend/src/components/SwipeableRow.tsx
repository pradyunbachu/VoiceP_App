/**
 * SwipeableRow.tsx - Touch swipe-to-action for mobile list items.
 *
 * Wraps any list item and reveals compact action buttons when swiped left.
 * Only active on touch devices — desktop shows normal hover actions.
 * Uses a global ref so only one row can be open at a time.
 *
 * Actions are always mounted behind an opaque content layer (--bg-primary)
 * so there's no flash/bleed on mount/unmount.
 */
import { useState, useRef, useCallback, useEffect, type FC, type ReactNode } from "react";
import "./SwipeableRow.css";

export interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string;
  bg: string;
  onClick: () => void;
}

interface Props {
  children: ReactNode;
  actions: SwipeAction[];
}

const SWIPE_THRESHOLD = 30;
const ACTION_WIDTH = 56;

let globalOpenCloseFn: (() => void) | null = null;

const SwipeableRow: FC<Props> = ({ children, actions }) => {
  const [offsetX, setOffsetX] = useState(0);
  const [animating, setAnimating] = useState(false);
  const isOpen = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const directionLocked = useRef<"h" | "v" | null>(null);
  const touchActive = useRef(false);

  const maxSwipe = actions.length * ACTION_WIDTH;

  const rowRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setAnimating(true);
    setOffsetX(0);
    isOpen.current = false;
    if (globalOpenCloseFn === close) globalOpenCloseFn = null;
  }, []);

  // Close when tapping/clicking outside the row
  useEffect(() => {
    const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
      if (isOpen.current && rowRef.current && !rowRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("touchstart", handleOutsideInteraction, true);
    document.addEventListener("mousedown", handleOutsideInteraction, true);
    return () => {
      document.removeEventListener("touchstart", handleOutsideInteraction, true);
      document.removeEventListener("mousedown", handleOutsideInteraction, true);
      if (globalOpenCloseFn === close) globalOpenCloseFn = null;
    };
  }, [close]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    directionLocked.current = null;
    touchActive.current = true;
    setAnimating(false);

    // Close any other open row
    if (globalOpenCloseFn && globalOpenCloseFn !== close) {
      globalOpenCloseFn();
      globalOpenCloseFn = null;
    }
  }, [close]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchActive.current) return;

    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (!directionLocked.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      directionLocked.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }

    if (directionLocked.current === "v") return;

    const base = isOpen.current ? -maxSwipe : 0;
    const raw = base + dx;
    setOffsetX(Math.max(-maxSwipe, Math.min(0, raw)));
  }, [maxSwipe]);

  const handleTouchEnd = useCallback(() => {
    touchActive.current = false;

    if (directionLocked.current !== "h") return;

    setAnimating(true);
    if (offsetX < -SWIPE_THRESHOLD) {
      setOffsetX(-maxSwipe);
      isOpen.current = true;
      globalOpenCloseFn = close;
    } else {
      setOffsetX(0);
      isOpen.current = false;
      if (globalOpenCloseFn === close) globalOpenCloseFn = null;
    }
  }, [offsetX, maxSwipe, close]);

  // Prevent mouse drag from selecting text or causing weird behavior on desktop
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // If a row is open, close it on any click
    if (isOpen.current) {
      e.preventDefault();
      close();
    }
  }, [close]);

  const handleActionClick = useCallback((action: SwipeAction) => {
    close();
    if (globalOpenCloseFn === close) globalOpenCloseFn = null;
    setTimeout(() => action.onClick(), 250);
  }, [close]);

  return (
    <div className="swipeable-row" ref={rowRef}>
      {/* Content: opaque bg-primary covers actions at rest */}
      <div
        className="swipeable-row-content"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: animating ? "transform 0.2s ease-out" : "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {children}
      </div>
      {/* Actions: always mounted behind content, revealed by slide */}
      <div className="swipeable-row-actions" style={{ width: maxSwipe }}>
        {actions.map((action, i) => (
          <button
            key={i}
            className="swipeable-action-btn"
            style={{ background: action.bg, color: action.color, width: ACTION_WIDTH }}
            onClick={() => handleActionClick(action)}
            aria-label={action.label}
          >
            {action.icon}
          </button>
        ))}
      </div>
    </div>
  );
};

export default SwipeableRow;
