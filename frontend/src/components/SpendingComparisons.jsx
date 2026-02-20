/*
 * SpendingComparisons.jsx
 * Month-over-month spending comparison view. Lets the user pick two months
 * (current vs. compare) and displays summary cards, key-change sentences,
 * biggest increase/decrease highlights, side-by-side category bars, and a
 * store comparison grid. All percentage changes are color-coded so increases
 * in spending stand out as negative signals.
 */
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
  ArrowLeftRight,
  Tag,
  Store,
  MessageSquare,
} from 'lucide-react';
import { useSpendingComparison, queryKeys } from '../hooks';
import LoadingSkeleton from './LoadingSkeleton';
import './SpendingComparisons.css';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const getYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 3; y--) {
    years.push(y);
  }
  return years;
};

const SpendingComparisons = ({ showToast }) => {
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(now.getFullYear());

  // Default compare to previous month
  const defaultCompareMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const defaultCompareYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const [compareMonth, setCompareMonth] = useState(defaultCompareMonth);
  const [compareYear, setCompareYear] = useState(defaultCompareYear);

  const queryClient = useQueryClient();
  const { data: comparison, isLoading, isError, error, isFetching } = useSpendingComparison(
    currentMonth, currentYear, compareMonth, compareYear
  );

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.comparison.all });
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

  const getChangeColor = (change) => {
    if (change === 0) return 'neutral';
    return change > 0 ? 'negative' : 'positive';
  };

  if (isLoading) {
    return (
      <div className="spending-comparisons">
        <div className="comparisons-header">
          <h2>Spending Comparisons</h2>
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
      <div className="spending-comparisons">
        <div className="comparisons-header">
          <h2>Spending Comparisons</h2>
        </div>
        <div className="error-state">
          <AlertTriangle size={48} />
          <h3>Failed to load comparison</h3>
          <p>{error?.message || 'An error occurred while fetching your spending comparison.'}</p>
          <button className="retry-button" onClick={handleRefresh}>
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="spending-comparisons">
        <div className="comparisons-header">
          <h2>Spending Comparisons</h2>
        </div>
        <div className="empty-state">
          <ArrowLeftRight size={48} />
          <h3>No data available</h3>
          <p>Start tracking your expenses to compare spending between months.</p>
        </div>
      </div>
    );
  }

  const { summary, category_comparisons, store_comparisons, sentences, biggest_increase, biggest_decrease, current_period, compare_period } = comparison;

  // Calculate max amount for bar scaling
  const maxCategoryAmount = Math.max(
    ...category_comparisons.map(c => Math.max(c.current_amount, c.previous_amount)),
    1
  );

  const maxStoreAmount = Math.max(
    ...store_comparisons.map(s => Math.max(s.current_amount, s.previous_amount)),
    1
  );

  return (
    <div className="spending-comparisons">
      {/* Header with month selectors */}
      <div className="comparisons-header">
        <h2>Spending Comparisons</h2>
        <div className="comparisons-controls">
          <div className="month-selector">
            <select
              className="month-select"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(Number(e.target.value))}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              className="month-select"
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
            >
              {getYearOptions().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="vs-label">vs</span>
            <select
              className="month-select"
              value={compareMonth}
              onChange={(e) => setCompareMonth(Number(e.target.value))}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <select
              className="month-select"
              value={compareYear}
              onChange={(e) => setCompareYear(Number(e.target.value))}
            >
              {getYearOptions().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
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
      <div className="comparison-summary-cards">
        <div className="comparison-summary-card">
          <div className="comparison-card-icon" style={{ background: 'var(--stat-blue)' }}>
            <DollarSign size={20} />
          </div>
          <div className="comparison-card-content">
            <span className="comparison-card-label">This Month</span>
            <span className="comparison-card-value">${summary.current_total.toFixed(2)}</span>
            <span className={`comparison-card-change ${getChangeColor(summary.total_percent_change)}`}>
              {getChangeIcon(summary.total_percent_change)}
              {formatChange(summary.total_percent_change)}
            </span>
          </div>
        </div>

        <div className="comparison-summary-card">
          <div className="comparison-card-icon" style={{ background: 'var(--stat-gray)' }}>
            <DollarSign size={20} />
          </div>
          <div className="comparison-card-content">
            <span className="comparison-card-label">Last Month</span>
            <span className="comparison-card-value">${summary.compare_total.toFixed(2)}</span>
            <span className="comparison-card-change neutral">
              {compare_period.label}
            </span>
          </div>
        </div>

        <div className="comparison-summary-card">
          <div className="comparison-card-icon" style={{ background: summary.total_difference > 0 ? 'var(--stat-red)' : 'var(--stat-green)' }}>
            {summary.total_difference > 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div className="comparison-card-content">
            <span className="comparison-card-label">Difference</span>
            <span className="comparison-card-value">
              {summary.total_difference >= 0 ? '+' : '-'}${Math.abs(summary.total_difference).toFixed(2)}
            </span>
            <span className={`comparison-card-change ${getChangeColor(summary.total_percent_change)}`}>
              {summary.total_difference > 0 ? 'more spent' : 'less spent'}
            </span>
          </div>
        </div>

        <div className="comparison-summary-card">
          <div className="comparison-card-icon" style={{ background: 'var(--stat-purple)' }}>
            <ShoppingBag size={20} />
          </div>
          <div className="comparison-card-content">
            <span className="comparison-card-label">Transactions</span>
            <span className="comparison-card-value">{summary.current_count} vs {summary.compare_count}</span>
            <span className={`comparison-card-change ${getChangeColor(summary.count_percent_change)}`}>
              {getChangeIcon(summary.count_percent_change)}
              {formatChange(summary.count_percent_change)}
            </span>
          </div>
        </div>
      </div>

      {/* Comparison Sentences */}
      {sentences && sentences.length > 0 && (
        <div className="sentences-section">
          <div className="sentences-header">
            <MessageSquare size={20} />
            <h3>Key Changes</h3>
          </div>
          <div className="sentences-list">
            {sentences.map((sentence, index) => (
              <div key={index} className="sentence-item">
                <span className={`sentence-icon ${sentence.type}`}>
                  {sentence.type === 'increase' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </span>
                <span className="sentence-text">{sentence.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Biggest Increase / Decrease Highlights */}
      {(biggest_increase || biggest_decrease) && (
        <div className="highlights-row">
          {biggest_increase && (
            <div className="highlight-card increase">
              <div className="highlight-label increase">
                <TrendingUp size={14} />
                Biggest Increase
              </div>
              <div className="highlight-category">{biggest_increase.category}</div>
              <div className="highlight-detail">
                ${biggest_increase.current_amount.toFixed(2)} vs ${biggest_increase.previous_amount.toFixed(2)}
                {' '}(+${biggest_increase.difference.toFixed(2)})
              </div>
            </div>
          )}
          {biggest_decrease && (
            <div className="highlight-card decrease">
              <div className="highlight-label decrease">
                <TrendingDown size={14} />
                Biggest Decrease
              </div>
              <div className="highlight-category">{biggest_decrease.category}</div>
              <div className="highlight-detail">
                ${biggest_decrease.current_amount.toFixed(2)} vs ${biggest_decrease.previous_amount.toFixed(2)}
                {' '}(-${Math.abs(biggest_decrease.difference).toFixed(2)})
              </div>
            </div>
          )}
        </div>
      )}

      {/* Category Comparison Bars */}
      <div className="comparison-bars-section">
        <div className="comparison-section-header">
          <Tag size={20} />
          <h3>Category Comparison</h3>
        </div>
        {category_comparisons && category_comparisons.length > 0 ? (
          <div className="comparison-bar-list">
            {category_comparisons.slice(0, 8).map((cat, index) => (
              <div key={index} className="comparison-bar-item">
                <div className="comparison-bar-header">
                  <span className="comparison-bar-label">{cat.category}</span>
                  <span className={`comparison-bar-change ${getChangeColor(cat.percent_change)}`}>
                    {getChangeIcon(cat.percent_change)}
                    {formatChange(cat.percent_change)}
                  </span>
                </div>
                <div className="dual-bars">
                  <div className="dual-bar-row">
                    <span className="dual-bar-period">Now</span>
                    <div className="dual-bar-track">
                      <div
                        className="dual-bar-fill current"
                        style={{ width: `${(cat.current_amount / maxCategoryAmount) * 100}%` }}
                      />
                    </div>
                    <span className="dual-bar-amount">${cat.current_amount.toFixed(2)}</span>
                  </div>
                  <div className="dual-bar-row">
                    <span className="dual-bar-period">Prev</span>
                    <div className="dual-bar-track">
                      <div
                        className="dual-bar-fill compare"
                        style={{ width: `${(cat.previous_amount / maxCategoryAmount) * 100}%` }}
                      />
                    </div>
                    <span className="dual-bar-amount">${cat.previous_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="comparison-empty-breakdown">
            <p>No category data available for these months.</p>
          </div>
        )}
      </div>

      {/* Store Comparison */}
      <div className="comparison-bars-section">
        <div className="comparison-section-header">
          <Store size={20} />
          <h3>Store Comparison</h3>
        </div>
        {store_comparisons && store_comparisons.length > 0 ? (
          <div className="comparison-stores-grid">
            {store_comparisons.slice(0, 8).map((store, index) => (
              <div key={index} className="comparison-store-card">
                <span className="comparison-store-name">{store.store}</span>
                <div className="comparison-store-amounts">
                  <span className="comparison-store-current">${store.current_amount.toFixed(2)}</span>
                  <span className="comparison-store-previous">was ${store.previous_amount.toFixed(2)}</span>
                </div>
                <div className="comparison-store-footer">
                  <span className="comparison-store-visits">
                    {store.current_visits} vs {store.previous_visits} visits
                  </span>
                  <span className={`comparison-store-change ${getChangeColor(store.percent_change)}`}>
                    {getChangeIcon(store.percent_change)}
                    {formatChange(store.percent_change)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="comparison-empty-breakdown">
            <p>No store data available for these months.</p>
          </div>
        )}
      </div>

      {/* Period Info */}
      <div className="comparison-period-info">
        <span>Comparing {current_period.label} vs {compare_period.label}</span>
      </div>
    </div>
  );
};

export default SpendingComparisons;
