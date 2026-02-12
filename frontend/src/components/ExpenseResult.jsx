import { Package } from "lucide-react";

const ExpenseResult = ({ extractedExpense, pendingPantryExpense, showPantryModal, onShowPantryModal, onSetPendingExpense }) => {
  if (!extractedExpense || !extractedExpense.expenses) return null;

  return (
    <div className="expense-result">
      <h3>{extractedExpense.count > 1 ? `${extractedExpense.count} Expenses Saved` : 'Expense Saved'}</h3>
      {extractedExpense.expenses.map((expense, index) => (
        <div key={expense.id || index} className="expense-details" style={{marginBottom: extractedExpense.count > 1 ? '15px' : '0', paddingBottom: extractedExpense.count > 1 ? '15px' : '0', borderBottom: index < extractedExpense.count - 1 ? '1px solid #eee' : 'none'}}>
          {extractedExpense.count > 1 && <h4 style={{marginTop: '0', color: '#666'}}>Item {index + 1}</h4>}
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
            const firstExpense = extractedExpense.expenses[0];
            onSetPendingExpense(firstExpense.expense_id ? { ...firstExpense, id: firstExpense.expense_id } : firstExpense);
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
