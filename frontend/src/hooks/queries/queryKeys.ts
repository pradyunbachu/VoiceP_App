/**
 * queryKeys.ts
 * Centralized query key factory for React Query cache management.
 * Exports a single `queryKeys` object with namespaced key builders for every
 * domain (expenses, analytics, budgets, pantry, shopping list, insights, etc.).
 * Ensures consistent, hierarchical cache keys across all queries and mutations.
 */

import type { ExpenseFilters, PantryFilters } from '../../types';

// Query Keys Factory for consistent cache key management

interface InfiniteExpenseFilters {
  search?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: string;
  pageSize?: number;
}

interface InfinitePantryFilters {
  category?: string;
  stock_status?: string;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  page_size?: number;
  group_id?: number;
}

interface PantryItemFilters {
  category?: string;
  stock_status?: string;
  sort_by?: string;
  sort_order?: string;
  search?: string;
  page?: number;
  page_size?: number;
  paginate?: boolean;
  group_id?: number;
}

interface ShoppingListFilters {
  category?: string;
  group_id?: string | number;
  sort_by?: string;
  sort_order?: string;
}

interface BudgetFilters {
  month?: number;
  year?: number;
}

export const queryKeys = {
  // Expenses
  expenses: {
    all: ['expenses'] as const,
    list: (filters: ExpenseFilters = {}) => [...queryKeys.expenses.all, 'list', filters] as const,
    infinite: (filters: InfiniteExpenseFilters = {}) => [...queryKeys.expenses.all, 'infinite', filters] as const,
  },

  // Analytics
  analytics: {
    all: ['analytics'] as const,
    summary: () => [...queryKeys.analytics.all, 'summary'] as const,
  },

  // Budgets
  budgets: {
    all: ['budgets'] as const,
    list: (filters: BudgetFilters) => [...queryKeys.budgets.all, 'list', filters] as const,
    check: (month?: number, year?: number) => [...queryKeys.budgets.all, 'check', { month, year }] as const,
  },

  // Pantry
  pantry: {
    all: ['pantry'] as const,
    items: (filters: PantryItemFilters) => [...queryKeys.pantry.all, 'items', filters] as const,
    infinite: (filters: InfinitePantryFilters = {}) => [...queryKeys.pantry.all, 'infinite', filters] as const,
    stats: (groupId?: number) => [...queryKeys.pantry.all, 'stats', groupId] as const,
    groups: () => [...queryKeys.pantry.all, 'groups'] as const,
    groupDetail: (id: number | string) => [...queryKeys.pantry.all, 'group', id] as const,
  },

  // Shopping List
  shoppingList: {
    all: ['shoppingList'] as const,
    items: (filters: ShoppingListFilters) => [...queryKeys.shoppingList.all, 'items', filters] as const,
    pantryMatches: () => [...queryKeys.shoppingList.all, 'pantryMatches'] as const,
    groups: () => [...queryKeys.shoppingList.all, 'groups'] as const,
    groupDetail: (id: number | string) => [...queryKeys.shoppingList.all, 'group', id] as const,
  },

  // Insights
  insights: {
    all: ['insights'] as const,
    report: (timePeriod: string) => [...queryKeys.insights.all, 'report', timePeriod] as const,
  },

  // Spending Comparisons
  comparison: {
    all: ['comparison'] as const,
    months: (currentMonth: number, currentYear: number, compareMonth: number, compareYear: number) =>
      [...queryKeys.comparison.all, 'months', { currentMonth, currentYear, compareMonth, compareYear }] as const,
  },

  // Daily Recs
  dailyRecs: {
    all: ['dailyRecs'] as const,
    withPreference: (preference: string) => [...queryKeys.dailyRecs.all, preference] as const,
  },

  // Streak
  streak: {
    all: ['streak'] as const,
  },

  // Cook Stats
  cookStats: {
    all: ['cookStats'] as const,
  },

} as const;
