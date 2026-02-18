/*
 * SpendingInsights.jsx
 * AI-generated spending insights dashboard. Fetches summary stats, period-
 * over-period comparisons, top categories/stores, and budget health for a
 * selectable time window (7/30/90 days). Displays an AI panel with headline,
 * spending personality, key findings, and prioritized savings recommendations.
 * Supports manual refresh to re-generate insights.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Calendar,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Store,
  Tag,
  Lightbulb,
  Target
} from 'lucide-react';
import { useSpendingInsights, queryKeys } from '../hooks';
import LoadingSkeleton from './LoadingSkeleton';
import './SpendingInsights.css';

const TIME_PERIODS = [
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
];

const SpendingInsights = ({ showToast }) => {
  const [timePeriod, setTimePeriod] = useState('last_30_days');
  const queryClient = useQueryClient();

  const { data: insights, isLoading, isError, error, isFetching } = useSpendingInsights(timePeriod);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.insights.all });
  };

  const handlePeriodChange = (e) => {
    setTimePeriod(e.target.value);
  };

  const formatChange = (change) => {
    if (change === 0) return '0%';
    const prefix = change > 0 ? '+' : '';
    return `${prefix}${change.toFixed(1)}%`;
  };

  const getChangeIcon = (change) => {
    if (change > 0) return <ArrowUpRight size={14} />;
    if (change < 0) return <ArrowDownRight size={14} />;
    return null;
  };

  const getChangeColor = (change, invertColors = false) => {
    if (change === 0) return 'neutral';
    // For spending, increase is typically bad (unless inverted)
    if (invertColors) {
      return change > 0 ? 'positive' : 'negative';
    }
    return change > 0 ? 'negative' : 'positive';
  };

  const getFindingIcon = (type) => {
    switch (type) {
      case 'positive':
        return <CheckCircle size={16} className="finding-icon positive" />;
      case 'warning':
        return <AlertTriangle size={16} className="finding-icon warning" />;
      default:
        return <Info size={16} className="finding-icon neutral" />;
    }
  };

  const getPriorityBadge = (priority) => {
    return (
      <span className={`priority-badge ${priority}`}>
        {priority}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="spending-insights">
        <div className="insights-header">
          <h2>Spending Insights</h2>
        </div>
        <div className="loading-container">
          <LoadingSkeleton type="card" count={4} />
          <LoadingSkeleton type="chart" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="spending-insights">
        <div className="insights-header">
          <h2>Spending Insights</h2>
        </div>
        <div className="error-state">
          <AlertTriangle size={48} />
          <h3>Failed to load insights</h3>
          <p>{error?.message || 'An error occurred while fetching your spending insights.'}</p>
          <button className="retry-button" onClick={handleRefresh}>
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="spending-insights">
        <div className="insights-header">
          <h2>Spending Insights</h2>
        </div>
        <div className="empty-state">
          <Sparkles size={48} />
          <h3>No data available</h3>
          <p>Start tracking your expenses to see AI-powered insights.</p>
        </div>
      </div>
    );
  }

  const { summary, comparisons, top_categories, top_stores, budget_status, ai_insights, period } = insights;

  return (
    <div className="spending-insights">
      {/* Header with controls */}
      <div className="insights-header">
        <h2>Spending Insights</h2>
        <div className="header-controls">
          <select
            value={timePeriod}
            onChange={handlePeriodChange}
            className="period-select"
          >
            {TIME_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            className="refresh-button"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw size={16} className={isFetching ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon" style={{ background: '#3b82f6' }}>
            <DollarSign size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Total Spent</span>
            <span className="card-value">${summary.total_spent.toFixed(2)}</span>
            <span className={`card-change ${getChangeColor(comparisons.spending_change)}`}>
              {getChangeIcon(comparisons.spending_change)}
              {formatChange(comparisons.spending_change)} vs prev period
            </span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon" style={{ background: '#3b82f6' }}>
            <ShoppingBag size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Transactions</span>
            <span className="card-value">{summary.transaction_count}</span>
            <span className={`card-change ${getChangeColor(comparisons.transaction_change)}`}>
              {getChangeIcon(comparisons.transaction_change)}
              {formatChange(comparisons.transaction_change)} vs prev period
            </span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon" style={{ background: '#8b5cf6' }}>
            <Calendar size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Daily Average</span>
            <span className="card-value">${summary.daily_average.toFixed(2)}</span>
            <span className={`card-change ${getChangeColor(comparisons.daily_avg_change)}`}>
              {getChangeIcon(comparisons.daily_avg_change)}
              {formatChange(comparisons.daily_avg_change)} vs prev period
            </span>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon" style={{ background: '#f59e0b' }}>
            <Target size={20} />
          </div>
          <div className="card-content">
            <span className="card-label">Budget Health</span>
            <span className="card-value">
              {budget_status ? (
                budget_status.filter(b => b.status === 'ok').length + '/' + budget_status.length
              ) : (
                'N/A'
              )}
            </span>
            <span className="card-change neutral">
              {budget_status ? 'budgets on track' : 'No budgets set'}
            </span>
          </div>
        </div>
      </div>

      {/* AI Insights Panel */}
      {ai_insights && (
        <div className="ai-insights-panel">
          <div className="ai-header">
            <Sparkles size={20} />
            <h3>AI Insights</h3>
          </div>

          {ai_insights.headline && (
            <p className="ai-headline">{ai_insights.headline}</p>
          )}

          {ai_insights.spending_personality && (
            <p className="spending-personality">{ai_insights.spending_personality}</p>
          )}

          {/* Key Findings */}
          {ai_insights.key_findings && ai_insights.key_findings.length > 0 && (
            <div className="findings-section">
              <h4>Key Findings</h4>
              <div className="findings-list">
                {ai_insights.key_findings.map((finding, index) => (
                  <div key={index} className={`finding-item ${finding.type}`}>
                    {getFindingIcon(finding.type)}
                    <div className="finding-content">
                      <span className="finding-title">{finding.title}</span>
                      <span className="finding-description">{finding.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {ai_insights.recommendations && ai_insights.recommendations.length > 0 && (
            <div className="recommendations-section">
              <h4>
                <Lightbulb size={16} />
                Recommendations
              </h4>
              <div className="recommendations-list">
                {ai_insights.recommendations.map((rec, index) => (
                  <div key={index} className="recommendation-item">
                    <div className="rec-header">
                      {getPriorityBadge(rec.priority)}
                      {rec.category && <span className="rec-category">{rec.category}</span>}
                    </div>
                    <p className="rec-suggestion">{rec.suggestion}</p>
                    {rec.potential_savings && (
                      <span className="rec-savings">
                        Potential savings: {rec.potential_savings}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fallback if no AI insights */}
      {!ai_insights && (
        <div className="ai-insights-panel no-ai">
          <div className="ai-header">
            <Sparkles size={20} />
            <h3>AI Insights</h3>
          </div>
          <p className="no-ai-message">
            AI-powered insights are temporarily unavailable. Check back later for personalized recommendations.
          </p>
        </div>
      )}

      {/* Category Breakdown */}
      <div className="breakdown-section">
        <div className="section-header">
          <Tag size={20} />
          <h3>Top Categories</h3>
        </div>
        {top_categories && top_categories.length > 0 ? (
          <div className="category-bars">
            {top_categories.map((cat, index) => (
              <div key={index} className="category-bar-item">
                <div className="bar-header">
                  <span className="bar-label">{cat.category}</span>
                  <div className="bar-stats">
                    <span className="bar-amount">${cat.amount.toFixed(2)}</span>
                    <span className={`bar-change ${getChangeColor(cat.change)}`}>
                      {getChangeIcon(cat.change)}
                      {formatChange(cat.change)}
                    </span>
                  </div>
                </div>
                <div className="bar-container">
                  <div
                    className="bar-fill"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
                <span className="bar-percentage">{cat.percentage.toFixed(1)}% of total</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-breakdown">
            <p>No category data available for this period.</p>
          </div>
        )}
      </div>

      {/* Store Breakdown */}
      <div className="breakdown-section">
        <div className="section-header">
          <Store size={20} />
          <h3>Top Stores</h3>
        </div>
        {top_stores && top_stores.length > 0 ? (
          <div className="stores-grid">
            {top_stores.map((store, index) => (
              <div key={index} className="store-card">
                <span className="store-name">{store.store}</span>
                <span className="store-amount">${store.amount.toFixed(2)}</span>
                <div className="store-details">
                  <span className="store-visits">{store.visits} visits</span>
                  <span className={`store-change ${getChangeColor(store.change)}`}>
                    {getChangeIcon(store.change)}
                    {formatChange(store.change)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-breakdown">
            <p>No store data available for this period.</p>
          </div>
        )}
      </div>

      {/* Budget Status */}
      {budget_status && budget_status.length > 0 && (
        <div className="breakdown-section">
          <div className="section-header">
            <Target size={20} />
            <h3>Budget Status</h3>
          </div>
          <div className="budget-grid">
            {budget_status.map((budget, index) => (
              <div key={index} className={`budget-item ${budget.status}`}>
                <div className="budget-header">
                  <span className="budget-name">{budget.category}</span>
                  {budget.status === 'over' && <AlertTriangle size={14} className="budget-alert" />}
                </div>
                <div className="budget-progress">
                  <div
                    className="budget-bar"
                    style={{
                      width: `${Math.min(budget.percentage_used, 100)}%`,
                      backgroundColor: budget.status === 'over' ? '#ef4444' :
                        budget.status === 'warning' ? '#f59e0b' : '#3b82f6'
                    }}
                  />
                </div>
                <div className="budget-stats">
                  <span>${budget.spent.toFixed(0)} / ${budget.budget.toFixed(0)}</span>
                  <span className={budget.remaining < 0 ? 'negative' : ''}>
                    {budget.remaining >= 0 ? `$${budget.remaining.toFixed(0)} left` : `$${Math.abs(budget.remaining).toFixed(0)} over`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Period Info */}
      <div className="period-info">
        <span>Data from {period.start_date} to {period.end_date}</span>
      </div>
    </div>
  );
};

export default SpendingInsights;
