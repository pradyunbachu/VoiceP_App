/**
 * DroppableShelf.jsx - A droppable category container for the shelf view.
 *
 * Uses dnd-kit's useDroppable hook with the category name as the drop ID.
 * Highlights when a dragged item hovers over it. Renders its children
 * (DraggableShelfItems) inside the shelf surface, with decorative brackets.
 */
import { useDroppable } from "@dnd-kit/core";
import "./Pantry.css";

const DroppableShelf = ({ category, children, isEmpty }) => {
  // The droppable ID matches the category name, which handleDragEnd
  // in Pantry.jsx reads from `over.id` to determine the target category.
  const { setNodeRef, isOver } = useDroppable({ id: category });

  return (
    <div className={`shelf ${isOver ? 'drag-over' : ''}`}>
      <div className="shelf-label">{category}</div>
      <div ref={setNodeRef} className="shelf-surface">
        <div className="shelf-items">
          {children}
          {isEmpty && (
            <div className="shelf-empty-hint">Drop items here</div>
          )}
        </div>
      </div>
      {/* Decorative shelf bracket elements */}
      <div className="shelf-bracket left"></div>
      <div className="shelf-bracket right"></div>
    </div>
  );
};

export default DroppableShelf;
