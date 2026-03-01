/**
 * PantryShelfView.jsx - Drag-and-drop shelf layout for pantry items.
 *
 * Wraps all category shelves in a DndContext so users can drag items
 * between shelves to reassign categories. Each shelf is a DroppableShelf
 * and each item is a DraggableShelfItem.
 */
import type { PantryItem, StockStatus } from "../types/index";
import type { SensorDescriptor, SensorOptions, DragEndEvent } from "@dnd-kit/core";
import { DndContext, closestCenter } from "@dnd-kit/core";
import DraggableShelfItem from "./DraggableShelfItem";
import DroppableShelf from "./DroppableShelf";
import "./Pantry.css";

interface Props {
  itemsByCategory: [string, PantryItem[]][];
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (event: DragEndEvent) => void;
  onEdit: (item: PantryItem) => void;
  onRemove: (id: number) => void;
  onStatusChange: (id: number, status: StockStatus) => void;
}

const PantryShelfView: React.FC<Props> = ({ itemsByCategory, sensors, onDragEnd, onEdit, onRemove, onStatusChange }) => {
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
