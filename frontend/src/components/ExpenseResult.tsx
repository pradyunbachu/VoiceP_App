/*
 * ExpenseResult.jsx
 * Displays the extracted expense details immediately after a voice, manual,
 * or receipt input is processed. Renders store, items, category, amount, and
 * date for one or more saved expenses, and offers an "Add to Pantry" button
 * so the user can optionally stock their pantry from the same transaction.
 */
import React from "react";
import { Package } from "lucide-react";
import type { Expense, ExpenseExtractionResult } from "../types";

interface Props {
  extractedExpense: ExpenseExtractionResult | null;
  pendingPantryExpense: Expense | null;
  showPantryModal: boolean;
  onShowPantryModal: () => void;
  onSetPendingExpense: (expense: Expense) => void;
}

const ExpenseResult: React.FC<Props> = ({ extractedExpense, pendingPantryExpense, showPantryModal, onShowPantryModal, onSetPendingExpense }) => {
  if (!extractedExpense || !extractedExpense.expenses) return null;

  return (
    <div className="expense-result">
      <h3>{(extractedExpense.count || 0) > 1 ? `${extractedExpense.count} Expenses Saved` : 'Expense Saved'}</h3>
      {extractedExpense.expenses.map((expense, index) => (
        <div key={expense.id || index} className="expense-details" style={{marginBottom: (extractedExpense.count || 0) > 1 ? '15px' : '0', paddingBottom: (extractedExpense.count || 0) > 1 ? '15px' : '0', borderBottom: index < (extractedExpense.count || 0) - 1 ? '1px solid #eee' : 'none'}}>
          {(extractedExpense.count || 0) > 1 && <h4 style={{marginTop: '0', color: '#666'}}>Item {index + 1}</h4>}
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
          {expense.amount && (
            <p>
              <strong>Amount:</strong> ${expense.amount.toFixed(2)}
            </p>
          )}
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
