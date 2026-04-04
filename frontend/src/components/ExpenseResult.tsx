/*
 * ExpenseResult.jsx
 * Displays the extracted expense details immediately after a voice, manual,
 * or receipt input is processed. Renders store, items, category, amount, and
 * date for one or more saved expenses, and offers an "Add to Pantry" button
 * so the user can optionally stock their pantry from the same transaction.
 */
import React, { useState } from "react";
import { Package, Pencil, Check, X } from "lucide-react";
import { useUpdateExpense } from "../hooks";
import type { Expense, ExpenseExtractionResult } from "../types";

interface Props {
  extractedExpense: ExpenseExtractionResult | null;
  pendingPantryExpense: Expense | null;
  showPantryModal: boolean;
  onShowPantryModal: () => void;
  onSetPendingExpense: (expense: Expense) => void;
}

const ExpenseResult: React.FC<Props> = ({ extractedExpense, pendingPantryExpense, showPantryModal, onShowPantryModal, onSetPendingExpense }) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState<string>("");
  const updateExpense = useUpdateExpense();

  if (!extractedExpense || !extractedExpense.expenses) return null;

  const handleEditStart = (expense: Expense) => {
    setEditingId(expense.id);
    setEditAmount(expense.amount?.toString() ?? "");
  };

  const handleEditSave = (expense: Expense) => {
    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount) || newAmount < 0) {
      setEditingId(null);
      return;
    }
    updateExpense.mutate(
      { id: expense.id, data: { amount: newAmount } },
      {
        onSuccess: () => {
          expense.amount = newAmount;
          setEditingId(null);
        },
        onError: () => {
          setEditingId(null);
        },
      }
    );
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditAmount("");
  };

  return (
    <div className="expense-result">
      <h3>{(extractedExpense.count || 0) > 1 ? `${extractedExpense.count} Expenses Saved` : 'Expense Saved'}</h3>
      {extractedExpense.expenses.map((expense, index) => (
        <div key={expense.id || index} className="expense-details" style={{marginBottom: (extractedExpense.count || 0) > 1 ? '15px' : '0', paddingBottom: (extractedExpense.count || 0) > 1 ? '15px' : '0', borderBottom: index < (extractedExpense.count || 0) - 1 ? '1px solid var(--border-secondary)' : 'none'}}>
          {(extractedExpense.count || 0) > 1 && <h4 style={{marginTop: '0', color: 'var(--text-muted)'}}>Item {index + 1}</h4>}
          <p>
            <strong>Store:</strong> {expense.store}
          </p>
          <p>
            <strong>Items:</strong> {expense.items}
          </p>
          {expense.category && (
            <p>
              <strong>Category:</strong>{" "}
              {expense.category}
            </p>
          )}
          <p style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <strong>Amount:</strong>
            {editingId === expense.id ? (
              <>
                <span>$</span>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleEditSave(expense);
                    if (e.key === "Escape") handleEditCancel();
                  }}
                  autoFocus
                  step="0.01"
                  min="0"
                  style={{
                    width: "80px",
                    padding: "2px 6px",
                    border: "1px solid var(--border-primary)",
                    borderRadius: "4px",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    fontSize: "inherit",
                  }}
                />
                <button
                  onClick={() => handleEditSave(expense)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--accent-green, #4ade80)" }}
                  title="Save"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={handleEditCancel}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-muted)" }}
                  title="Cancel"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                {expense.amount != null ? `$${expense.amount.toFixed(2)}` : "Not set"}
                <button
                  onClick={() => handleEditStart(expense)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-muted)" }}
                  title="Edit amount"
                >
                  <Pencil size={14} />
                </button>
              </>
            )}
          </p>
          <p>
            <strong>Date:</strong> {expense.date}
          </p>
        </div>
      ))}

      {pendingPantryExpense && !showPantryModal && (
        <button
          className="add-to-pantry-button"
          onClick={onShowPantryModal}
        >
          <Package size={18} />
          <span>Add to Pantry</span>
        </button>
      )}
      {!pendingPantryExpense && !showPantryModal && (
        <button
          className="add-to-pantry-button manual"
          onClick={() => {
            const firstExpense = extractedExpense.expenses![0];
            const expenseId = (firstExpense as Expense & { expense_id?: number }).expense_id;
            onSetPendingExpense(expenseId ? { ...firstExpense, id: expenseId } : firstExpense);
            onShowPantryModal();
          }}
        >
          <Package size={18} />
          <span>Add to Pantry</span>
        </button>
      )}
    </div>
  );
};

export default ExpenseResult;
