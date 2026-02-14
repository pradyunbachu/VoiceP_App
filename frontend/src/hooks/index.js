// Query hooks
export { useExpenses } from './queries/useExpenses';
export { useAnalytics } from './queries/useAnalytics';
export { useBudgets } from './queries/useBudgets';
export { usePantryItems, usePantryStats } from './queries/usePantry';
export { useShoppingList, useShoppingPantryMatches } from './queries/useShoppingList';
export { useShoppingListGroups } from './queries/useShoppingListGroups';
export { useSpendingInsights } from './queries/useSpendingInsights';
export { useDailyRecs } from './queries/useDailyRecs';
export { queryKeys } from './queries/queryKeys';

// Expense mutations
export {
  useCreateExpense,
  useCreateExpenseSimple,
  useUpdateExpense,
  useDeleteExpense,
  useBulkDeleteExpenses,
  useClearAllExpenses,
} from './mutations/useExpenseMutations';

// Budget mutations
export {
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
} from './mutations/useBudgetMutations';

// Pantry mutations
export {
  useCreatePantryItem,
  useUpdatePantryItem,
  useUpdatePantryStatus,
  useDeletePantryItem,
  useBulkDeletePantryItems,
  useAddFromExpense,
} from './mutations/usePantryMutations';

// Chat mutations
export { useChat } from './mutations/useChatMutation';

// Receipt mutations
export { useScanReceipt } from './mutations/useReceiptMutation';

// Recipe mutations
export { useRecipeDetail } from './mutations/useRecipeMutation';

// Shopping List mutations
export {
  useCreateShoppingListItem,
  useUpdateShoppingListItem,
  useDeleteShoppingListItem,
  useBulkDeleteShoppingListItems,
  useClearShoppingList,
  useRemovePurchasedItems,
} from './mutations/useShoppingListMutations';

// Shopping List Group mutations
export {
  useCreateShoppingListGroup,
  useJoinShoppingListGroup,
  useInviteToGroup,
  useRemoveGroupMember,
  useDeleteShoppingListGroup,
} from './mutations/useShoppingListGroupMutations';

// Audio recording
export { default as useAudioRecorder } from './useAudioRecorder';

// Grocery suggestions
export { useGrocerySuggestions } from './useGrocerySuggestions';

