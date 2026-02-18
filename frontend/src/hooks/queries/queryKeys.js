/**
 * queryKeys.js
 * Centralized query key factory for React Query cache management.
 * Exports a single `queryKeys` object with namespaced key builders for every
 * domain (expenses, analytics, budgets, pantry, shopping list, insights, etc.).
 * Ensures consistent, hierarchical cache keys across all queries and mutations.
 */
// Query Keys Factory for consistent cache key management
export const queryKeys = {
  // Expenses
  expenses: {
    all: ['expenses'],
    list: (filters = {}) => [...queryKeys.expenses.all, 'list', filters],
    infinite: (filters = {}) => [...queryKeys.expenses.all, 'infinite', filters],
  },

  // Analytics
  analytics: {
    all: ['analytics'],
    summary: () => [...queryKeys.analytics.all, 'summary'],
  },

  // Budgets
  budgets: {
    all: ['budgets'],
    list: (filters) => [...queryKeys.budgets.all, 'list', filters],
    check: (month, year) => [...queryKeys.budgets.all, 'check', { month, year }],
  },

  // Pantry
  pantry: {
    all: ['pantry'],
    items: (filters) => [...queryKeys.pantry.all, 'items', filters],
    infinite: (filters = {}) => [...queryKeys.pantry.all, 'infinite', filters],
    stats: () => [...queryKeys.pantry.all, 'stats'],
  },

  // Shopping List
  shoppingList: {
    all: ['shoppingList'],
    items: (filters) => [...queryKeys.shoppingList.all, 'items', filters],
    pantryMatches: () => [...queryKeys.shoppingList.all, 'pantryMatches'],
    groups: () => [...queryKeys.shoppingList.all, 'groups'],
    groupDetail: (id) => [...queryKeys.shoppingList.all, 'group', id],
  },

  // Insights
  insights: {
    all: ['insights'],
    report: (timePeriod) => [...queryKeys.insights.all, 'report', timePeriod],
  },

  // Spending Comparisons
  comparison: {
    all: ['comparison'],
    months: (currentMonth, currentYear, compareMonth, compareYear) =>
      [...queryKeys.comparison.all, 'months', { currentMonth, currentYear, compareMonth, compareYear }],
  },

  // Daily Recs
  dailyRecs: {
    all: ['dailyRecs'],
  },

};
