import { describe, it, expect } from "vitest";
import { suggestByRules } from "../categorizationEngine";

describe("suggestByRules", () => {
  it("returns empty array when no rules match", () => {
    const transactions = [
      {
        id: "tx-1",
        nubankId: null,
        date: "2025-01-15",
        amount: -50,
        description: "Padaria Bom Dia",
        type: "expense" as const,
        categoryId: null,
        level2CategoryId: "l2-outras-saidas",
        isCategorized: false,
        importId: "imp-1",
        createdAt: "2025-01-15T00:00:00Z"
      }
    ];
    const rules = [
      {
        id: "rule-1",
        categoryId: "cat-1",
        matcher: "farmacia",
        kind: "contains" as const,
        createdAt: "2025-01-01T00:00:00Z"
      }
    ];
    const result = suggestByRules(transactions, rules);
    expect(result).toHaveLength(0);
  });

  it("matches a contains rule case-insensitively", () => {
    const transactions = [
      {
        id: "tx-1",
        nubankId: null,
        date: "2025-01-15",
        amount: -30,
        description: "UBER TRIP",
        type: "expense" as const,
        categoryId: null,
        level2CategoryId: "l2-outras-saidas",
        isCategorized: false,
        importId: "imp-1",
        createdAt: "2025-01-15T00:00:00Z"
      }
    ];
    const rules = [
      {
        id: "rule-1",
        categoryId: "cat-transporte",
        matcher: "uber",
        kind: "contains" as const,
        createdAt: "2025-01-01T00:00:00Z"
      }
    ];
    const result = suggestByRules(transactions, rules);
    expect(result).toHaveLength(1);
    expect(result[0].categoryId).toBe("cat-transporte");
    expect(result[0].score).toBe(0.95);
  });

  it("does not crash on invalid regex in rule", () => {
    const transactions = [
      {
        id: "tx-1",
        nubankId: null,
        date: "2025-01-15",
        amount: -50,
        description: "Compra no mercado",
        type: "expense" as const,
        categoryId: null,
        level2CategoryId: "l2-outras-saidas",
        isCategorized: false,
        importId: "imp-1",
        createdAt: "2025-01-15T00:00:00Z"
      }
    ];
    const rules = [
      {
        id: "rule-1",
        categoryId: "cat-1",
        matcher: "[invalid(regex",
        kind: "regex" as const,
        createdAt: "2025-01-01T00:00:00Z"
      }
    ];
    expect(() => suggestByRules(transactions, rules)).not.toThrow();
    expect(suggestByRules(transactions, rules)).toHaveLength(0);
  });
});
