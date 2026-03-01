/**
 * PantryBulkActions.jsx - Toolbar for entering selection mode and bulk-deleting items.
 *
 * Toggles between a "Select Items" button and an action bar showing the
 * selected count with Delete and Cancel buttons.
 */
import { AlertTriangle, CheckSquare, Trash2, X } from "lucide-react";
import "./Pantry.css";

interface Props {
  isSelectMode: boolean;
  selectedCount: number;
  onEnterSelect: () => void;
  onCancelSelect: () => void;
  onBulkDelete: () => void;
  onSelectAllExpired: () => void;
  isDeleting: boolean;
}

const PantryBulkActions: React.FC<Props> = ({
  isSelectMode,
  selectedCount,
  onEnterSelect,
  onCancelSelect,
  onBulkDelete,
  onSelectAllExpired,
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
            className="select-expired-button"
            onClick={onSelectAllExpired}
          >
            <AlertTriangle size={16} />
            <span>Select All Expired</span>
          </button>
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
