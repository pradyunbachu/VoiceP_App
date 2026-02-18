/**
 * PantryShelfView.jsx - Drag-and-drop shelf layout for pantry items.
 *
 * Wraps all category shelves in a DndContext so users can drag items
 * between shelves to reassign categories. Each shelf is a DroppableShelf
 * and each item is a DraggableShelfItem.
 */
import { DndContext, closestCenter } from "@dnd-kit/core";
import DraggableShelfItem from "./DraggableShelfItem";
import DroppableShelf from "./DroppableShelf";
import "./Pantry.css";

const PantryShelfView = ({ itemsByCategory, sensors, onDragEnd, onEdit, onRemove, onStatusChange }) => {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <div className="pantry-shelves">
        {/* Render one shelf per category; empty shelves act as drop targets */}
        {itemsByCategory.map(([category, categoryItems]) => (
          <DroppableShelf
            key={category}
            category={category}
            isEmpty={categoryItems.length === 0}
          >
            {categoryItems.map((item) => (
              <DraggableShelfItem
                key={item.id}
                item={item}
                onEdit={onEdit}
                onRemove={onRemove}
                onStatusChange={onStatusChange}
              />
            ))}
          </DroppableShelf>
        ))}
      </div>
    </DndContext>
  );
};

export default PantryShelfView;
