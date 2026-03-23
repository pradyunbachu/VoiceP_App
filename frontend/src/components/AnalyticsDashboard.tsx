/*
 * AnalyticsDashboard.jsx
 * Charts and summary statistics for the user's spending data. Renders a stats
 * grid (total expenses, purchase count, average, stores visited), a Recharts
 * line chart for expenses over time, a bar chart for top stores, a pie chart
 * for category breakdown, and a budget-vs-actual spending section with
 * color-coded progress bars and month/year filters.
 */
import { useState } from 'react'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, ShoppingBag, Calendar, Trash2, Wallet, AlertTriangle, X, Maximize2 } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useBudgets } from '../hooks'
import MixingBowlLoader from './MixingBowlLoader'
import type { Analytics, Budget, ShowToast } from '../types'
import './AnalyticsDashboard.css'

const COLORS_DARK = ['#C4A265', '#D4A035', '#B898C8', '#D4726B', '#D48A45', '#6AAF7B', '#D4B87A', '#9470A8']
const COLORS_LIGHT = ['#8B7355', '#5B5E8B', '#7B5E8B', '#8B5E7B', '#B8860B', '#5A8A6A', '#C45B5B', '#5A7A7A']

type ExpandedChart = 'time' | 'stores' | 'categories' | null;

interface ChartDataPoint {
  name: string;
  value: number;
}

interface Props {
  analytics: Analytics | null;
  onClearAll: () => void;
  showToast: ShowToast;
}

const AnalyticsDashboard: React.FC<Props> = ({ analytics, onClearAll, showToast }) => {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const COLORS = isLight ? COLORS_LIGHT : COLORS_DARK
  const chartAxis = isLight ? '#6B6B6B' : '#968E82'
  const chartGrid = isLight ? 'rgba(139, 115, 85, 0.1)' : 'rgba(200, 191, 178, 0.1)'
  const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(30, 26, 22, 0.95)'
  const tooltipBorder = isLight ? 'rgba(139, 115, 85, 0.2)' : 'rgba(200, 191, 178, 0.15)'
  const tooltipColor = isLight ? '#3D3D3D' : '#F0EBE3'
  const lineColor = isLight ? '#8B7355' : '#C4A265'
  const cursorFill = isLight ? 'rgba(139, 115, 85, 0.1)' : 'rgba(196, 162, 101, 0.1)'

  const [budgetMonth, setBudgetMonth] = useState<number>(new Date().getMonth() + 1)
  const [budgetYear, setBudgetYear] = useState<number>(new Date().getFullYear())
  const [expandedChart, setExpandedChart] = useState<ExpandedChart>(null)

  // Use shared budget query - eliminates duplicate fetching with BudgetManagement
  const { data: budgets = [], isLoading: loadingBudgets } = useBudgets({
    month: budgetMonth,
    year: budgetYear,
  })

  const getMonthName = (month: number): string => {
    return new Date(2000, month - 1).toLocaleString('default', { month: 'long' })
  }

  if (!analytics) return null

  // Prepare data for charts
  const storeData: ChartDataPoint[] = Object.entries(analytics.expenses_by_store || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const categoryData: ChartDataPoint[] = Object.entries(analytics.expenses_by_category || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const dateData = (analytics.expenses_by_date || []).slice(-7)

  // Full data sets for expanded views
  const allStoreData: ChartDataPoint[] = Object.entries(analytics.expenses_by_store || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const allDateData = analytics.expenses_by_date || []

  const categoryTotal = categoryData.reduce((sum, c) => sum + c.value, 0)

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
          <div className="stat-icon" style={{ background: 'var(--stat-blue)' }}>
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Expenses</p>
            <p className="stat-value">${analytics.total_expenses?.toFixed(2) || '0.00'}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--stat-blue-dark)' }}>
            <ShoppingBag size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Purchases</p>
            <p className="stat-value">{analytics.expense_count || 0}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--stat-blue-darker)' }}>
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
          <div className="stat-icon" style={{ background: 'var(--stat-blue-light)' }}>
            <Calendar size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Stores Visited</p>
            <p className="stat-value">{Object.keys(analytics.expenses_by_store || {}).length || 0}</p>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-container chart-clickable" onClick={() => setExpandedChart('time')}>
          <div className="chart-header">
            <h3>Expenses Over Time (Last 7 Days)</h3>
            <Maximize2 size={16} className="chart-expand-icon" />
          </div>
          {dateData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dateData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="date" stroke={chartAxis} />
                <YAxis stroke={chartAxis} />
                <Tooltip
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: '8px',
                    color: tooltipColor
                  }}
                />
                <Legend wrapperStyle={{ color: tooltipColor }} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke={lineColor}
                  strokeWidth={3}
                  name="Amount"
                  dot={{ fill: lineColor, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">
              <TrendingUp size={32} strokeWidth={1.5} />
              <p>Record expenses to see your spending trends</p>
            </div>
          )}
        </div>

        <div className="chart-container chart-clickable" onClick={() => setExpandedChart('stores')}>
          <div className="chart-header">
            <h3>Top Stores</h3>
            <Maximize2 size={16} className="chart-expand-icon" />
          </div>
          {storeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={storeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="name" stroke={chartAxis} />
                <YAxis stroke={chartAxis} />
                <Tooltip
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                  cursor={{ fill: cursorFill }}
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: '8px',
                    color: tooltipColor
                  }}
                />
                <Legend wrapperStyle={{ color: tooltipColor }} />
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

        <div className="chart-container chart-clickable" onClick={() => setExpandedChart('categories')}>
          <div className="chart-header">
            <h3>Expenses by Category</h3>
            <Maximize2 size={16} className="chart-expand-icon" />
          </div>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    borderRadius: '8px',
                    color: tooltipColor
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
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBudgetMonth(parseInt(e.target.value))}
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
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setBudgetYear(parseInt(e.target.value))}
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
          <MixingBowlLoader size="md" label="Loading budgets..." />
        ) : budgets.length > 0 ? (
          <div className="budget-comparison-grid">
            {budgets.map((budget: Budget) => {
              const percentage = budget.percentage_used || 0
              const alertColor =
                percentage >= 100 ? (isLight ? '#A04040' : '#B85450') :
                percentage >= 90 ? (isLight ? '#C4A035' : '#C4A035') :
                percentage >= 75 ? (isLight ? '#B8860B' : '#D4A035') :
                (isLight ? '#8B7355' : '#C4A265')

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

      {/* Expanded Chart Detail Modal */}
      {expandedChart && (
        <div className="chart-detail-overlay" onClick={() => setExpandedChart(null)}>
          <div className="chart-detail-modal" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <button className="chart-detail-close" onClick={() => setExpandedChart(null)}>
              <X size={20} />
            </button>

            {expandedChart === 'time' && (
              <>
                <h3>Expenses Over Time</h3>
                <p className="chart-detail-subtitle">
                  {allDateData.length > 0
                    ? `${allDateData.length} day${allDateData.length !== 1 ? 's' : ''} of data — ${allDateData[0]?.date} to ${allDateData[allDateData.length - 1]?.date}`
                    : 'No data yet'}
                </p>
                <div className="chart-detail-stats">
                  <div className="detail-stat">
                    <span className="detail-stat-label">Total</span>
                    <span className="detail-stat-value">${analytics.total_expenses?.toFixed(2)}</span>
                  </div>
                  <div className="detail-stat">
                    <span className="detail-stat-label">Daily Avg</span>
                    <span className="detail-stat-value">
                      ${allDateData.length > 0
                        ? (allDateData.reduce((s, d) => s + d.amount, 0) / allDateData.length).toFixed(2)
                        : '0.00'}
                    </span>
                  </div>
                  <div className="detail-stat">
                    <span className="detail-stat-label">Peak Day</span>
                    <span className="detail-stat-value">
                      ${allDateData.length > 0
                        ? Math.max(...allDateData.map(d => d.amount)).toFixed(2)
                        : '0.00'}
                    </span>
                  </div>
                </div>
                {allDateData.length > 0 && (
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={allDateData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                      <XAxis dataKey="date" stroke={chartAxis} tick={{ fontSize: 12 }} />
                      <YAxis stroke={chartAxis} />
                      <Tooltip
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          border: `1px solid ${tooltipBorder}`,
                          borderRadius: '8px',
                          color: tooltipColor
                        }}
                      />
                      <Legend wrapperStyle={{ color: tooltipColor }} />
                      <Line type="monotone" dataKey="amount" stroke={lineColor} strokeWidth={3} name="Amount" dot={{ fill: lineColor, r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </>
            )}

            {expandedChart === 'stores' && (
              <>
                <h3>All Stores</h3>
                <p className="chart-detail-subtitle">
                  {allStoreData.length} store{allStoreData.length !== 1 ? 's' : ''} visited
                </p>
                {allStoreData.length > 0 && (
                  <ResponsiveContainer width="100%" height={Math.max(250, allStoreData.length * 40)}>
                    <BarChart data={allStoreData} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                      <XAxis type="number" stroke={chartAxis} tickFormatter={(v: number) => `$${v}`} />
                      <YAxis dataKey="name" type="category" stroke={chartAxis} width={75} tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                        cursor={{ fill: cursorFill }}
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          border: `1px solid ${tooltipBorder}`,
                          borderRadius: '8px',
                          color: tooltipColor
                        }}
                      />
                      <Bar dataKey="value" name="Amount Spent" radius={[0, 8, 8, 0]}>
                        {allStoreData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="detail-table">
                  {allStoreData.map((store, i) => (
                    <div key={store.name} className="detail-table-row">
                      <span className="detail-table-rank">#{i + 1}</span>
                      <span className="detail-table-name">{store.name}</span>
                      <span className="detail-table-value">${store.value.toFixed(2)}</span>
                      <span className="detail-table-pct">
                        {((store.value / analytics.total_expenses) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {expandedChart === 'categories' && (
              <>
                <h3>Expenses by Category</h3>
                <p className="chart-detail-subtitle">
                  {categoryData.length} categor{categoryData.length !== 1 ? 'ies' : 'y'}
                </p>
                {categoryData.length > 0 && (
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {categoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => `$${value.toFixed(2)}`}
                        contentStyle={{
                          backgroundColor: tooltipBg,
                          border: `1px solid ${tooltipBorder}`,
                          borderRadius: '8px',
                          color: tooltipColor
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
                <div className="detail-table">
                  {categoryData.map((cat, i) => (
                    <div key={cat.name} className="detail-table-row">
                      <span className="detail-table-rank">
                        <span className="detail-color-dot" style={{ background: COLORS[i % COLORS.length] }} />
                      </span>
                      <span className="detail-table-name">{cat.name}</span>
                      <span className="detail-table-value">${cat.value.toFixed(2)}</span>
                      <span className="detail-table-pct">
                        {((cat.value / categoryTotal) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default AnalyticsDashboard
