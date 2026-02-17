import { useDroppable } from "@dnd-kit/core";
import "./Pantry.css";

const DroppableShelf = ({ category, children, isEmpty }) => {
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
      <div className="shelf-bracket left"></div>
      <div className="shelf-bracket right"></div>
    </div>
  );
};

export default DroppableShelf;
