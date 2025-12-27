import { Trash2, Store, Calendar, DollarSign } from "lucide-react";
import "./ExpenseList.css";

const ExpenseList = ({ expenses, onExpenseDeleted }) => {
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/api/expenses/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        onExpenseDeleted();
      } else {
        alert("Failed to delete expense");
      }
    } catch (error) {
      console.error("Error deleting expense:", error);
      alert("Error deleting expense");
    }
  };

  if (expenses.length === 0) {
    return (
      <div className="expense-list">
        <h2>Recent Expenses</h2>
        <p className="empty-state">
          No expenses yet. Record your first purchase!
        </p>
      </div>
    );
  }

  return (
    <div className="expense-list">
      <h2>Recent Expenses</h2>
      <div className="expenses-container">
        {expenses.map((expense) => (
          <div key={expense.id} className="expense-card">
            <div className="expense-header">
              <div className="expense-store">
                <Store size={18} />
                <span>{expense.store}</span>
              </div>
              <button
                className="delete-button"
                onClick={() => handleDelete(expense.id)}
                aria-label="Delete expense">
                <Trash2 size={16} />
              </button>
            </div>

            <div className="expense-items">
              <p>{expense.items}</p>
            </div>

            <div className="expense-footer">
              {expense.amount && (
                <div className="expense-amount">
                  <DollarSign size={16} />
                  <span>${parseFloat(expense.amount).toFixed(2)}</span>
                </div>
              )}
              <div className="expense-date">
                <Calendar size={16} />
                <span>{expense.date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExpenseList;
