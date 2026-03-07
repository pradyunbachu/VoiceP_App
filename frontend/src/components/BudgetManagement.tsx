/*
 * BudgetManagement.jsx
 * Full CRUD interface for monthly category budgets. Users can create, edit,
 * and delete budgets with optional recurring schedules (weekly, monthly, or
 * yearly). Displays each budget as a card with spent/remaining stats and a
 * color-coded progress bar. Supports month/year filtering, CSV export, and
 * uses a confirmation dialog before deleting.
 */
import { useState } from "react";
import { DollarSign, Plus, Trash2, Edit2, Check, X, Download } from "lucide-react";
import { CATEGORIES } from "../constants/categories";
import { useBudgets, useCreateBudget, useUpdateBudget, useDeleteBudget } from "../hooks";
import { exportBudgetsCsv } from "../lib/csvExport";
import MixingBowlLoader from "./MixingBowlLoader";
import ConfirmDialog from "./ConfirmDialog";
import type { ShowToast, Budget } from "../types";
import "./BudgetManagement.css";

interface Props {
  showToast: ShowToast;
}

interface BudgetFormData {
  category: string;
  amount: string;
  month: number;
  year: number;
  recurring: boolean;
  repeatInterval: string;
  repeatUnit: string;
}

const BudgetManagement: React.FC<Props> = ({ showToast }) => {
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filterMonth, setFilterMonth] = useState<number | null>(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number | null>(new Date().getFullYear());
  const [formData, setFormData] = useState<BudgetFormData>({
    category: "",
    amount: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    recurring: false,
    repeatInterval: "",
    repeatUnit: "",
  });
  const [editForm, setEditForm] = useState<BudgetFormData>({
    category: "",
    amount: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    recurring: false,
    repeatInterval: "",
    repeatUnit: "",
  });

  // React Query hooks
  const { data: budgets = [], isLoading: loading } = useBudgets({
    month: filterMonth ?? undefined,
    year: filterYear ?? undefined,
  });
  const createMutation = useCreateBudget();
  const updateMutation = useUpdateBudget();
  const deleteMutation = useDeleteBudget();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        category: formData.category,
        amount: parseFloat(formData.amount),
        month: parseInt(String(formData.month)),
        year: parseInt(String(formData.year)),
        recurring: Boolean(formData.recurring && formData.repeatInterval && formData.repeatUnit),
        repeat_interval: formData.repeatInterval ? parseInt(formData.repeatInterval) : undefined,
        repeat_unit: formData.repeatUnit || undefined,
      };

      await createMutation.mutateAsync(payload);
      setShowAddForm(false);
      const now = new Date();
      setFormData({
        category: "",
        amount: "",
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        recurring: false,
        repeatInterval: "",
        repeatUnit: "",
      });
    } catch (error: unknown) {
      console.error("Error creating budget:", error);
      if (showToast) {
        showToast((error as Error).message || "Failed to create budget", "error");
      }
    }
  };

  const handleUpdate = async (id: number) => {
    try {
      const isRecurring = editForm.repeatInterval && editForm.repeatUnit;

      await updateMutation.mutateAsync({
        id,
        data: {
          category: editForm.category,
          amount: parseFloat(editForm.amount),
          month: parseInt(String(editForm.month)),
          year: parseInt(String(editForm.year)),
          recurring: isRecurring ? true : false,
          repeat_interval: editForm.repeatInterval && editForm.repeatInterval.trim() !== "" ? parseInt(editForm.repeatInterval) : undefined,
          repeat_unit: editForm.repeatUnit && editForm.repeatUnit.trim() !== "" ? editForm.repeatUnit : undefined,
        },
      });

      setEditingId(null);
      const now = new Date();
      setEditForm({
        category: "",
        amount: "",
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        recurring: false,
        repeatInterval: "",
        repeatUnit: "",
      });
    } catch (error: unknown) {
      console.error("Error updating budget:", error);
      if (showToast) {
        showToast((error as Error).message || "Failed to update budget", "error");
      }
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error: unknown) {
      console.error("Error deleting budget:", error);
      if (showToast) {
        showToast("Failed to delete budget", "error");
      }
    }
    setConfirmDeleteId(null);
  };

  const startEdit = (budget: Budget) => {
    setEditingId(budget.id);
    setEditForm({
      category: budget.category || "",
      amount: budget.amount.toString(),
      month: budget.month,
      year: budget.year,
      recurring: budget.recurring || false,
      repeatInterval: (budget.repeat_interval !== null && budget.repeat_interval !== undefined) ? budget.repeat_interval.toString() : "",
      repeatUnit: budget.repeat_unit || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    const now = new Date();
    setEditForm({
      category: "",
      amount: "",
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      recurring: false,
      repeatInterval: "",
      repeatUnit: "",
    });
  };

  if (loading) {
    return (
      <div className="budget-management">
        <MixingBowlLoader size="lg" label="Loading budgets..." />
      </div>
    );
  }

  return (
    <div className="budget-management">
      <div className="budget-header">
        <div>
          <h2>Budget Management</h2>
          <p className="budget-subtitle">Track your spending against monthly budgets</p>
        </div>
        <div className="budget-header-actions">
          <button
            className="export-budget-button"
            onClick={() => exportBudgetsCsv(budgets)}
            disabled={budgets.length === 0}
            title="Export budgets to CSV"
          >
            <Download size={18} />
            <span>Export CSV</span>
          </button>
          <button
            className="add-budget-button"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus size={18} />
            <span>Add Budget</span>
          </button>
        </div>
      </div>

      <div className="budget-filters">
        <select
          value={filterMonth || ""}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterMonth(e.target.value ? parseInt(e.target.value) : null)}
        >
          <option value="">All Months</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Year (optional)"
          value={filterYear || ""}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterYear(e.target.value ? parseInt(e.target.value) : null)}
          min="2020"
          max="2100"
        />
      </div>

      {showAddForm && (
        <form className="budget-form" onSubmit={handleCreate}>
          <h3>Create New Budget</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <select
                value={formData.category}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, category: e.target.value})}
                required
              >
                <option value="">Select Category</option>
                {CATEGORIES.map((cat: string) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, amount: e.target.value})}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Month</label>
              <select
                value={formData.month}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFormData({...formData, month: parseInt(e.target.value)})}
                required
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Year</label>
              <input
                type="number"
                min="2020"
                max="2100"
                value={formData.year}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({...formData, year: parseInt(e.target.value)})}
                required
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Repeat Every (Optional)</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g., 1"
                  value={formData.repeatInterval}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = e.target.value;
                    setFormData({
                      ...formData,
                      repeatInterval: val,
                      recurring: val && formData.repeatUnit ? true : false
                    });
                  }}
                  style={{width: '80px'}}
                />
                <select
                  value={formData.repeatUnit}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const val = e.target.value;
                    setFormData({
                      ...formData,
                      repeatUnit: val,
                      recurring: formData.repeatInterval && val ? true : false
                    });
                  }}
                >
                  <option value="">No repeat</option>
                  <option value="weeks">Week(s)</option>
                  <option value="months">Month(s)</option>
                  <option value="years">Year(s)</option>
                </select>
              </div>
              {formData.repeatInterval && formData.repeatUnit && (
                <small style={{color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block'}}>
                  This will automatically create the same budget every {formData.repeatInterval} {formData.repeatUnit}.
                </small>
              )}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="save-button" disabled={createMutation.isPending}>
              <Check size={16} />
              <span>{createMutation.isPending ? "Creating..." : "Create Budget"}</span>
            </button>
            <button type="button" className="cancel-button" onClick={() => setShowAddForm(false)}>
              <X size={16} />
              <span>Cancel</span>
            </button>
          </div>
        </form>
      )}

      {budgets.length === 0 ? (
        <div className="empty-state">
          <DollarSign size={48} />
          <h3>No budgets yet</h3>
          <p>Create a budget to start tracking your spending</p>
        </div>
      ) : (
        <div className="budget-list">
          {budgets.map((budget: Budget) => (
            <div key={budget.id} className="budget-card">
              {editingId === budget.id ? (
                <div className="budget-edit-form">
                  <div className="edit-form-row">
                    <div className="edit-form-group">
                      <label>Category</label>
                      <select
                        value={editForm.category}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({...editForm, category: e.target.value})}
                      >
                        <option value="">Select Category</option>
                        {CATEGORIES.map((cat: string) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="edit-form-group">
                      <label>Amount ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editForm.amount}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, amount: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="edit-form-row">
                    <div className="edit-form-group">
                      <label>Month</label>
                      <select
                        value={editForm.month}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditForm({...editForm, month: parseInt(e.target.value)})}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>
                            {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="edit-form-group">
                      <label>Year</label>
                      <input
                        type="number"
                        min="2020"
                        max="2100"
                        value={editForm.year}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm({...editForm, year: parseInt(e.target.value)})}
                      />
                    </div>
                  </div>
                  <div className="edit-form-row">
                    <div className="edit-form-group">
                      <label>Repeat Every (Optional)</label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          placeholder="e.g., 1"
                          value={editForm.repeatInterval || ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            const val = e.target.value;
                            setEditForm({
                              ...editForm,
                              repeatInterval: val,
                              recurring: val && editForm.repeatUnit ? true : false
                            });
                          }}
                          style={{width: '80px'}}
                          className="edit-form-input"
                        />
                        <select
                          value={editForm.repeatUnit || ''}
                          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                            const val = e.target.value;
                            setEditForm({
                              ...editForm,
                              repeatUnit: val,
                              recurring: editForm.repeatInterval && val ? true : false
                            });
                          }}
                          className="edit-form-select"
                        >
                          <option value="">No repeat</option>
                          <option value="weeks">Week(s)</option>
                          <option value="months">Month(s)</option>
                          <option value="years">Year(s)</option>
                        </select>
                      </div>
                      {editForm.repeatInterval && editForm.repeatUnit && (
                        <small style={{color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block'}}>
                          This will automatically create the same budget every {editForm.repeatInterval} {editForm.repeatUnit}.
                        </small>
                      )}
                    </div>
                  </div>
                  <div className="edit-actions">
                    <button
                      className="save-button"
                      onClick={() => handleUpdate(budget.id)}
                      disabled={updateMutation.isPending}
                    >
                      <Check size={16} />
                      <span>{updateMutation.isPending ? "Saving..." : "Save"}</span>
                    </button>
                    <button className="cancel-button" onClick={cancelEdit}>
                      <X size={16} />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="budget-card-header">
                    <div className="budget-category">
                      <DollarSign size={20} />
                      <span>{budget.category?.trim() || 'Uncategorized'}</span>
                      {!!budget.recurring && (
                        <span className="recurring-badge" title={`Repeats every ${budget.repeat_interval} ${budget.repeat_unit}`}>
                          Recurring
                        </span>
                      )}
                    </div>
                    <div className="budget-actions">
                      <button className="edit-budget-button" onClick={() => startEdit(budget)}>
                        <Edit2 size={16} />
                      </button>
                      <button
                        className="delete-budget-button"
                        onClick={() => setConfirmDeleteId(budget.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="budget-stats">
                    <div className="budget-stat">
                      <span className="budget-label">Budget:</span>
                      <span className="budget-value">${budget.amount.toFixed(2)}</span>
                    </div>
                    <div className="budget-stat">
                      <span className="budget-label">Spent:</span>
                      <span className="budget-value spent">${budget.actual_spending?.toFixed(2) || "0.00"}</span>
                    </div>
                    <div className="budget-stat">
                      <span className="budget-label">Remaining:</span>
                      <span className={`budget-value ${budget.remaining < 0 ? 'negative' : ''}`}>
                        ${budget.remaining?.toFixed(2) || budget.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="budget-progress">
                    <div className="budget-progress-bar">
                      <div
                        className="budget-progress-fill"
                        style={{
                          width: `${Math.min(budget.percentage_used || 0, 100)}%`,
                          backgroundColor:
                            (budget.percentage_used || 0) >= 100 ? 'var(--budget-danger)' :
                            (budget.percentage_used || 0) >= 90 ? 'var(--budget-caution)' :
                            (budget.percentage_used || 0) >= 75 ? 'var(--budget-warning)' :
                            'var(--budget-ok)'
                        }}
                      />
                    </div>
                    <span className="budget-percentage">
                      {budget.percentage_used?.toFixed(1) || 0}% used
                    </span>
                  </div>
                  <div className="budget-date">
                    {new Date(budget.year, budget.month - 1).toLocaleString("default", { month: "long", year: "numeric" })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmDeleteId && (
        <ConfirmDialog
          message="Are you sure you want to delete this budget?"
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
};

export default BudgetManagement;
