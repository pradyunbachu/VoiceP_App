/**
 * PantryBulkActions.jsx - Toolbar for entering selection mode and bulk-deleting items.
 *
 * Toggles between a "Select Items" button and an action bar showing the
 * selected count with Delete and Cancel buttons.
 */
import { AlertTriangle, CheckSquare, Trash2, X, PackageMinus } from "lucide-react";
import "./Pantry.css";

interface Props {
  isSelectMode: boolean;
  selectedCount: number;
  onEnterSelect: () => void;
  onCancelSelect: () => void;
  onBulkDelete: () => void;
  onSelectAllExpired: () => void;
  onDiscardOutOfStock: () => void;
  outOfStockCount: number;
  isDiscarding: boolean;
  isDeleting: boolean;
}

const PantryBulkActions: React.FC<Props> = ({
  isSelectMode,
  selectedCount,
  onEnterSelect,
  onCancelSelect,
  onBulkDelete,
  onSelectAllExpired,
  onDiscardOutOfStock,
  outOfStockCount,
  isDiscarding,
  isDeleting,
}) => {
  return (
    <div className="bulk-controls">
      {!isSelectMode ? (
        <div className="bulk-controls-row">
          <button className="select-mode-button" onClick={onEnterSelect}>
            <CheckSquare size={18} />
            <span>Select Items</span>
          </button>
          {outOfStockCount > 0 && (
            <button
              className="discard-oos-button"
              onClick={onDiscardOutOfStock}
              disabled={isDiscarding}
            >
              <PackageMinus size={16} />
              <span>{isDiscarding ? "Discarding..." : `Discard Out of Stock (${outOfStockCount})`}</span>
            </button>
          )}
        </div>
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
