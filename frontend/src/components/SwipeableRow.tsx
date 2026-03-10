/**
 * SwipeableRow.tsx - Touch swipe-to-action for mobile list items.
 *
 * Wraps any list item and reveals action buttons when swiped left.
 * Supports a primary action (delete) and an optional secondary action (edit/pantry).
 * Falls back to normal layout on non-touch / desktop.
 */
import { useState, useRef, useCallback, type FC, type ReactNode } from "react";
import "./SwipeableRow.css";

interface SwipeAction {
  icon: ReactNode;
  label: string;
  color: string;
  bg: string;
  onClick: () => void;
}

interface Props {
  children: ReactNode;
  actions: SwipeAction[];
  /** Width of each revealed action button (default 72px) */
  actionWidth?: number;
}

const SWIPE_THRESHOLD = 40;

const SwipeableRow: FC<Props> = ({ children, actions, actionWidth = 72 }) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const currentX = useRef(0);
  const swiping = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);

  const maxSwipe = actions.length * actionWidth;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    currentX.current = isOpen ? -maxSwipe : 0;
    swiping.current = false;
  }, [isOpen, maxSwipe]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    // If vertical scroll is dominant, bail out
    if (!swiping.current && Math.abs(dy) > Math.abs(dx)) return;
    swiping.current = true;

    const raw = currentX.current + dx;
    // Clamp: can't swipe right past 0, can't swipe left past maxSwipe
    const clamped = Math.max(-maxSwipe, Math.min(0, raw));
    setOffsetX(clamped);
  }, [maxSwipe]);

  const handleTouchEnd = useCallback(() => {
    if (!swiping.current) return;

    if (offsetX < -SWIPE_THRESHOLD) {
      setOffsetX(-maxSwipe);
      setIsOpen(true);
    } else {
      setOffsetX(0);
      setIsOpen(false);
    }
  }, [offsetX, maxSwipe]);

  const close = useCallback(() => {
    setOffsetX(0);
    setIsOpen(false);
  }, []);

  const handleActionClick = useCallback((action: SwipeAction) => {
    close();
    // Small delay to let the row animate closed before the action fires
    setTimeout(() => action.onClick(), 150);
  }, [close]);

  return (
    <div className="swipeable-row" ref={rowRef}>
      <div
        className="swipeable-row-content"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping.current ? "none" : "transform 0.25s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
      <div className="swipeable-row-actions" style={{ width: maxSwipe }}>
        {actions.map((action, i) => (
          <button
            key={i}
            className="swipeable-action-btn"
            style={{
              background: action.bg,
              color: action.color,
              width: actionWidth,
            }}
            onClick={() => handleActionClick(action)}
            aria-label={action.label}
          >
            {action.icon}
            <span className="swipeable-action-label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SwipeableRow;
