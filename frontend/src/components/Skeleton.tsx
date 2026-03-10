/**
 * Skeleton.tsx - Shimmer loading placeholders that match actual content layout.
 *
 * Provides reusable skeleton variants for pantry cards, shopping list items,
 * stat cards, shelf items, and expense rows so the UI feels responsive
 * before real data loads.
 */
import type { FC, CSSProperties } from "react";
import "./Skeleton.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: CSSProperties;
  className?: string;
}

/** Base skeleton block — use width/height/borderRadius for custom shapes */
export const Skeleton: FC<SkeletonProps> = ({ width, height, borderRadius, style, className = "" }) => (
  <div
    className={`skeleton ${className}`}
    style={{ width, height, borderRadius, ...style }}
  />
);

/** Pantry stat cards row */
export const SkeletonStats: FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="skeleton-stats-grid">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="skeleton-stat-card">
        <Skeleton className="skeleton-circle" width={42} height={42} />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height={22} style={{ marginBottom: 6 }} />
          <Skeleton width="60%" height={12} />
        </div>
      </div>
    ))}
  </div>
);

/** Pantry card (list view) */
export const SkeletonPantryCard: FC = () => (
  <div className="skeleton-pantry-card">
    <div className="skeleton-pantry-card-header">
      <div style={{ flex: 1 }}>
        <Skeleton width="55%" height={16} style={{ marginBottom: 8 }} />
        <Skeleton width="30%" height={12} />
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        <Skeleton width={28} height={28} borderRadius={6} />
        <Skeleton width={28} height={28} borderRadius={6} />
      </div>
    </div>
    <div className="skeleton-pantry-card-body">
      <Skeleton width="35%" height={22} borderRadius={12} style={{ marginBottom: 12 }} />
      <div className="skeleton-status-row">
        <Skeleton width={70} height={26} borderRadius={20} />
        <Skeleton width={60} height={26} borderRadius={20} />
        <Skeleton width={80} height={26} borderRadius={20} />
      </div>
    </div>
    <div className="skeleton-pantry-card-footer">
      <Skeleton width="35%" height={12} />
      <Skeleton width="30%" height={12} />
    </div>
  </div>
);

/** Grid of pantry card skeletons */
export const SkeletonPantryGrid: FC<{ count?: number }> = ({ count = 6 }) => (
  <div className="skeleton-pantry-grid">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonPantryCard key={i} />
    ))}
  </div>
);

/** Single shelf item skeleton */
const SkeletonShelfItem: FC = () => (
  <div className="skeleton-shelf-item">
    <Skeleton className="skeleton-circle" width={28} height={28} />
    <Skeleton width="80%" height={12} />
    <Skeleton width="50%" height={10} />
  </div>
);

/** Shelf view skeleton with category sections */
export const SkeletonShelfView: FC<{ shelves?: number }> = ({ shelves = 3 }) => (
  <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-secondary)", borderRadius: "var(--radius-xl)", padding: "var(--space-6) var(--space-5)" }}>
    {Array.from({ length: shelves }).map((_, i) => (
      <div key={i} className="skeleton-shelf">
        <Skeleton width={80} height={10} style={{ marginBottom: 8 }} />
        <div className="skeleton-shelf-surface">
          {Array.from({ length: 3 + Math.floor(Math.random() * 3) }).map((_, j) => (
            <SkeletonShelfItem key={j} />
          ))}
        </div>
      </div>
    ))}
  </div>
);

/** Shopping list item skeleton */
export const SkeletonShoppingItem: FC = () => (
  <div className="skeleton-shopping-item">
    <Skeleton className="skeleton-circle" width={18} height={18} />
    <div style={{ flex: 1 }}>
      <Skeleton width="60%" height={14} style={{ marginBottom: 6 }} />
      <Skeleton width="40%" height={10} />
    </div>
    <div style={{ display: "flex", gap: 2 }}>
      <Skeleton width={32} height={32} borderRadius={8} />
      <Skeleton width={32} height={32} borderRadius={8} />
    </div>
  </div>
);

/** Shopping list skeleton */
export const SkeletonShoppingList: FC<{ count?: number }> = ({ count = 5 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonShoppingItem key={i} />
    ))}
  </>
);

/** Expense row skeleton */
export const SkeletonExpenseRow: FC = () => (
  <div className="skeleton-expense-row">
    <Skeleton width={18} height={18} borderRadius={4} />
    <div style={{ flex: 1 }}>
      <Skeleton width="45%" height={14} style={{ marginBottom: 6 }} />
      <Skeleton width="30%" height={11} />
    </div>
    <Skeleton width={60} height={16} />
    <Skeleton width={80} height={12} />
  </div>
);

/** Expense list skeleton */
export const SkeletonExpenseList: FC<{ count?: number }> = ({ count = 8 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonExpenseRow key={i} />
    ))}
  </>
);

export default Skeleton;
