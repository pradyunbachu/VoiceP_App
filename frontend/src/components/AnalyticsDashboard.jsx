import { useState } from 'react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, ShoppingBag, Calendar, Trash2, Wallet, AlertTriangle } from 'lucide-react'
import { useBudgets } from '../hooks'
import LoadingSkeleton from './LoadingSkeleton'
import './AnalyticsDashboard.css'

const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4']

const AnalyticsDashboard = ({ analytics, onClearAll, showToast }) => {
  const [budgetMonth, setBudgetMonth] = useState(new Date().getMonth() + 1)
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear())

  // Use shared budget query - eliminates duplicate fetching with BudgetManagement
  const { data: budgets = [], isLoading: loadingBudgets } = useBudgets({
    month: budgetMonth,
    year: budgetYear,
  })

  const getMonthName = (month) => {
    return new Date(2000, month - 1).toLocaleString('default', { month: 'long' })
  }

  if (!analytics) return null

  // Prepare data for charts
  const storeData = Object.entries(analytics.expenses_by_store || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const categoryData = Object.entries(analytics.expenses_by_category || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const dateData = (analytics.expenses_by_date || []).slice(-7)

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h2>Analytics Dashboard</h2>
        {analytics.expense_count > 0 && (
          <button className="clear-all-button" onClick={onClearAll}>
            <Trash2 size={18} />
            <span>Clear All</span>
          </button>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#3b82f6' }}>
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Expenses</p>
            <p className="stat-value">${analytics.total_expenses?.toFixed(2) || '0.00'}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#2563eb' }}>
            <ShoppingBag size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Purchases</p>
            <p className="stat-value">{analytics.expense_count || 0}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#1d4ed8' }}>
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Average per Purchase</p>
            <p className="stat-value">
              ${analytics.expense_count > 0
                ? (analytics.total_expenses / analytics.expense_count).toFixed(2)
                : '0.00'}
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: '#60a5fa' }}>
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Stores Visited</p>
            <p className="stat-value">{Object.keys(analytics.expenses_by_store || {}).length || 0}</p>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container">
          <h3>Expenses Over Time (Last 7 Days)</h3>
          {dateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dateData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis dataKey="date" stroke="#a0a0a0" />
                <YAxis stroke="#a0a0a0" />
                <Tooltip
                  formatter={(value) => `$${value.toFixed(2)}`}
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#e0e0e0'
                  }}
                />
                <Legend wrapperStyle={{ color: '#e0e0e0' }} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  name="Amount"
                  dot={{ fill: '#3b82f6', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">
              <p>No expense data yet. Record your first expense to see the chart!</p>
            </div>
          )}
        </div>

        <div className="chart-container">
          <h3>Top Stores</h3>
          {storeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={storeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis dataKey="name" stroke="#a0a0a0" />
                <YAxis stroke="#a0a0a0" />
                <Tooltip
                  formatter={(value) => `$${value.toFixed(2)}`}
                  cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#e0e0e0'
                  }}
                />
                <Legend wrapperStyle={{ color: '#e0e0e0' }} />
                <Bar dataKey="value" name="Amount Spent" radius={[8, 8, 0, 0]}>
                  {storeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">
              <p>No store data yet. Record expenses to see spending by store!</p>
            </div>
          )}
        </div>

        <div className="chart-container">
          <h3>Expenses by Category</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => `$${value.toFixed(2)}`}
                  contentStyle={{
                    backgroundColor: 'rgba(26, 26, 26, 0.95)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#e0e0e0'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">
              <p>No category data yet. Start recording expenses to see the breakdown!</p>
            </div>
          )}
        </div>
      </div>

      {/* Budget vs Actual Spending Section */}
      <div className="budget-section">
        <div className="section-header">
          <Wallet size={24} />
          <h3>Budget vs Actual Spending for {getMonthName(budgetMonth)} {budgetYear}</h3>
        </div>
        <div className="budget-filters">
          <select
            value={budgetMonth}
            onChange={(e) => setBudgetMonth(parseInt(e.target.value))}
            className="budget-filter-select"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={budgetYear}
            onChange={(e) => setBudgetYear(parseInt(e.target.value))}
            className="budget-filter-select"
          >
            {Array.from({ length: 5 }, (_, i) => {
              const year = new Date().getFullYear() - 2 + i
              return (
                <option key={year} value={year}>
                  {year}
                </option>
              )
            })}
          </select>
        </div>
        {loadingBudgets ? (
          <LoadingSkeleton type="card" count={3} />
        ) : budgets.length > 0 ? (
          <div className="budget-comparison-grid">
            {budgets.map((budget) => {
              const percentage = budget.percentage_used || 0
              const alertColor =
                percentage >= 100 ? '#dc2626' :
                percentage >= 90 ? '#eab308' :
                percentage >= 75 ? '#f59e0b' :
                '#3b82f6'

              return (
                <div key={budget.id} className="budget-comparison-card">
                  <div className="budget-card-header">
                    <span className="budget-category-name">{budget.category?.trim() || 'Uncategorized'}</span>
                    {percentage >= 75 && (
                      <AlertTriangle size={18} style={{ color: alertColor }} />
                    )}
                  </div>
                  <div className="budget-stats-row">
                    <div className="budget-stat-item">
                      <span className="budget-stat-label">Budget</span>
                      <span className="budget-stat-value">${budget.amount.toFixed(2)}</span>
                    </div>
                    <div className="budget-stat-item">
                      <span className="budget-stat-label">Spent</span>
                      <span className="budget-stat-value spent">${budget.actual_spending.toFixed(2)}</span>
                    </div>
                    <div className="budget-stat-item">
                      <span className="budget-stat-label">Remaining</span>
                      <span className={`budget-stat-value ${budget.remaining < 0 ? 'negative' : ''}`}>
                        ${budget.remaining.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="budget-progress-container">
                    <div className="budget-progress-bar">
                      <div
                        className="budget-progress-fill"
                        style={{
                          width: `${Math.min(percentage, 100)}%`,
                          backgroundColor: alertColor
                        }}
                      />
                    </div>
                    <span className="budget-percentage" style={{ color: alertColor }}>
                      {percentage.toFixed(1)}% used
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty-budget-message">
            <p>No budgets set for {getMonthName(budgetMonth)} {budgetYear}. Go to the Budgets tab to create one.</p>
          </div>
        )}
      </div>

    </div>
  )
}

export default AnalyticsDashboard
