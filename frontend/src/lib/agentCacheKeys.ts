import type { AgentAction } from "../types";

export type AgentDomain = "shopping" | "pantry" | "budgets" | "expenses";

/// Maps the agent's performed action types to the cache domains that must be
/// refreshed. The agent returns intent "agent", so the chat mutation can't
/// invalidate by intent — it invalidates by these domains instead.
export function domainsForActions(actions: AgentAction[]): AgentDomain[] {
  const set = new Set<AgentDomain>();
  for (const action of actions) {
    switch (action.type) {
      case "shopping_add":
      case "shopping_remove":
      case "shopping_cleared":
      case "shopping_suggestions":
        set.add("shopping"); break;
      case "pantry_add":
      case "pantry_remove":
      case "cook_deduct":
        set.add("pantry"); break;
      case "budget_set":
        set.add("budgets"); break;
      case "expense_logged":
      case "expense_deleted":
      case "mark_recurring":
        set.add("expenses"); break;
      default: break;
    }
  }
  return Array.from(set);
}
