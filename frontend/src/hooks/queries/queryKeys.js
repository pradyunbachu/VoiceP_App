// Query Keys Factory for consistent cache key management
export const queryKeys = {
  // Expenses
  expenses: {
    all: ['expenses'],
    list: () => [...queryKeys.expenses.all, 'list'],
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
    stats: () => [...queryKeys.pantry.all, 'stats'],
  },
};
