import { describe, it, expect } from "vitest";
import { domainsForActions } from "../lib/agentCacheKeys";
import type { AgentAction } from "../types";

const a = (type: string): AgentAction => ({ type, summary: "x" });

describe("domainsForActions", () => {
  it("maps shopping action types to the shopping domain", () => {
    expect(domainsForActions([a("shopping_add")])).toEqual(["shopping"]);
    expect(domainsForActions([a("shopping_cleared")])).toEqual(["shopping"]);
  });
  it("maps pantry + cook actions to the pantry domain", () => {
    expect(domainsForActions([a("pantry_add"), a("cook_deduct")])).toEqual(["pantry"]);
  });
  it("maps expense actions to the expenses domain", () => {
    expect(domainsForActions([a("expense_logged")])).toEqual(["expenses"]);
    expect(domainsForActions([a("expense_deleted")])).toEqual(["expenses"]);
  });
  it("maps budget_set to budgets", () => {
    expect(domainsForActions([a("budget_set")])).toEqual(["budgets"]);
  });
  it("dedupes and ignores unknown types", () => {
    const out = domainsForActions([a("shopping_add"), a("shopping_remove"), a("meal_suggestions")]);
    expect(out).toEqual(["shopping"]);
  });
  it("returns [] for no actions", () => {
    expect(domainsForActions([])).toEqual([]);
  });
});
