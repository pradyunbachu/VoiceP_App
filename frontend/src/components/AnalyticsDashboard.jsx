import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, ShoppingBag, Calendar } from 'lucide-react'
import './AnalyticsDashboard.css'

const COLORS = ['#00d4ff', '#7b2ff7', '#f06292', '#4ade80', '#fbbf24', '#a78bfa']

const AnalyticsDashboard = ({ analytics }) => {
  if (!analytics) return null

  // Prepare data for charts
  const storeData = Object.entries(analytics.expenses_by_store || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  const dateData = (analytics.expenses_by_date || []).slice(-7)

  return (
    <div className="analytics-dashboard">
      <h2>Analytics Dashboard</h2>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Expenses</p>
            <p className="stat-value">${analytics.total_expenses?.toFixed(2) || '0.00'}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
            <ShoppingBag size={24} />
          </div>
          <div className="stat-content">
            <p className="stat-label">Total Purchases</p>
            <p className="stat-value">{analytics.expense_count || 0}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }}>
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
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }}>
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
                  stroke="#00d4ff" 
                  strokeWidth={3}
                  name="Amount"
                  dot={{ fill: '#00d4ff', r: 4 }}
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
                  contentStyle={{ 
                    backgroundColor: 'rgba(26, 26, 26, 0.95)', 
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#e0e0e0'
                  }}
                />
                <Legend wrapperStyle={{ color: '#e0e0e0' }} />
                <Bar dataKey="value" fill="#7b2ff7" name="Amount Spent" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">
              <p>No store data yet. Record expenses to see spending by store!</p>
            </div>
          )}
        </div>

        <div className="chart-container">
          <h3>Expenses by Store</h3>
          {storeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={storeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {storeData.map((entry, index) => (
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
              <p>No expense data yet. Start recording expenses to see the breakdown!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AnalyticsDashboard

