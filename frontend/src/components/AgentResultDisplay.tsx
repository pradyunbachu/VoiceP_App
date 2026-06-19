// src/components/AgentResultDisplay.tsx
/**
 * AgentResultDisplay.tsx — renders the Voxy agent's performed actions as cards
 * and any pending (confirm-required) actions with Confirm / Cancel buttons.
 */
import type { FC } from "react";
import {
  CheckCircle, ShoppingCart, Package, DollarSign, Trash2,
  UtensilsCrossed, Wallet, Share2, Flame, AlertTriangle,
} from "lucide-react";
import type { AgentAction, PendingAction } from "../types";
import "./AgentResultDisplay.css";

interface Props {
  actions: AgentAction[];
  pending: PendingAction[];
  onConfirm: (p: PendingAction) => void;
  onCancel: (p: PendingAction) => void;
}

/** Rich card for a logged expense (uses the action's structured data). */
const ExpenseActionCard: FC<{ action: AgentAction }> = ({ action }) => {
  const data = action.data ?? {};
  const store = typeof data.store === "string" ? data.store : "Expense";
  const amount = typeof data.amount === "number" ? data.amount : undefined;
  const category = typeof data.category === "string" ? data.category : undefined;
  return (
    <div className="agent-action-card agent-expense-card">
      <span className="agent-action-icon"><DollarSign size={18} /></span>
      <div className="agent-expense-body">
        <span className="agent-expense-store">{store}</span>
        {category && <span className="agent-expense-category">{category}</span>}
      </div>
      {amount !== undefined && (
        <span className="agent-expense-amount">${amount.toFixed(2)}</span>
      )}
    </div>
  );
};

const iconFor = (type: string) => {
  switch (type) {
    case "shopping_add": case "shopping_suggestions": return <ShoppingCart size={18} />;
    case "shopping_remove": case "shopping_cleared": return <ShoppingCart size={18} />;
    case "pantry_add": case "pantry_remove": return <Package size={18} />;
    case "expense_logged": return <DollarSign size={18} />;
    case "expense_deleted": return <Trash2 size={18} />;
    case "meal_suggestions": case "meal_plan": return <UtensilsCrossed size={18} />;
    case "budget_set": return <Wallet size={18} />;
    case "list_shared": return <Share2 size={18} />;
    case "cook_deduct": return <Flame size={18} />;
    default: return <CheckCircle size={18} />;
  }
};

const AgentResultDisplay: FC<Props> = ({ actions, pending, onConfirm, onCancel }) => {
  if (actions.length === 0 && pending.length === 0) return null;
  return (
    <div className="agent-result">
      {pending.map((p) => (
        <div className="agent-confirm-card" key={p.id}>
          <div className="agent-confirm-head">
            <AlertTriangle size={18} />
            <span>{p.summary}</span>
          </div>
          <div className="agent-confirm-actions">
            <button className="agent-cancel-btn" onClick={() => onCancel(p)}>Cancel</button>
            <button className="agent-confirm-btn" onClick={() => onConfirm(p)}>Confirm</button>
          </div>
        </div>
      ))}
      {actions.map((action, i) => (
        action.type === "expense_logged"
          ? <ExpenseActionCard action={action} key={`expense-${i}`} />
          : (
            <div className="agent-action-card" key={`${action.type}-${i}`}>
              <span className="agent-action-icon">{iconFor(action.type)}</span>
              <span className="agent-action-summary">{action.summary || action.type}</span>
            </div>
          )
      ))}
    </div>
  );
};

export default AgentResultDisplay;
