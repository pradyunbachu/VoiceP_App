import { CheckSquare, Trash2, X } from "lucide-react";
import "./Pantry.css";

const PantryBulkActions = ({
  isSelectMode,
  selectedCount,
  onEnterSelect,
  onCancelSelect,
  onBulkDelete,
  isDeleting,
}) => {
  return (
    <div className="bulk-controls">
      {!isSelectMode ? (
        <button className="select-mode-button" onClick={onEnterSelect}>
          <CheckSquare size={18} />
          <span>Select Items</span>
        </button>
      ) : (
        <div className="bulk-actions">
          <button
            className="bulk-delete-button"
            onClick={onBulkDelete}
            disabled={selectedCount === 0 || isDeleting}
          >
            <Trash2 size={16} />
            <span>{isDeleting ? "Deleting..." : `Delete (${selectedCount})`}</span>
          </button>
          <button
            className="cancel-select-button"
            onClick={onCancelSelect}
          >
            <X size={16} />
            <span>Cancel</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default PantryBulkActions;
