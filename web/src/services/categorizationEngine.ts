import { CategoryRule, Transaction } from "@/types/finance";

export interface CategorizationSuggestion {
  transactionId: string;
  categoryId: string;
  reason: "rule" | "recurrence";
  score: number;
}

export function suggestByRules(
  transactions: Transaction[],
  rules: CategoryRule[]
): CategorizationSuggestion[] {
  const suggestions: CategorizationSuggestion[] = [];

  for (const transaction of transactions) {
    const descriptionLower = transaction.description.toLowerCase();

    let matchedCategoryId: string | null = null;

    for (const rule of rules) {
      let matched = false;
      if (rule.kind === "contains") {
        matched = descriptionLower.includes(rule.matcher.toLowerCase());
      } else {
        try {
          matched = new RegExp(rule.matcher, "i").test(transaction.description);
        } catch {
          // Invalid regex in rule — skip silently
        }
      }

      if (matched) {
        // Stack semantics: the last matching rule in display order wins.
        matchedCategoryId = rule.categoryId;
      }
    }

    if (matchedCategoryId) {
      suggestions.push({
        transactionId: transaction.id,
        categoryId: matchedCategoryId,
        reason: "rule",
        score: 0.95
      });
    }
  }

  return suggestions;
}

export function suggestByRecurrence(
  uncategorized: Transaction[],
  categorizedHistory: Transaction[]
): CategorizationSuggestion[] {
  const counter = new Map<string, { categoryId: string; count: number }>();

  for (const item of categorizedHistory) {
    if (!item.categoryId) {
      continue;
    }

    const key = normalizeDescription(item.description);
    const previous = counter.get(key);

    if (!previous) {
      counter.set(key, { categoryId: item.categoryId, count: 1 });
      continue;
    }

    counter.set(key, { categoryId: previous.categoryId, count: previous.count + 1 });
  }

  const suggestions: CategorizationSuggestion[] = [];
  for (const transaction of uncategorized) {
    const key = normalizeDescription(transaction.description);
    const match = counter.get(key);
    if (!match || match.count < 2) {
      continue;
    }

    suggestions.push({
      transactionId: transaction.id,
      categoryId: match.categoryId,
      reason: "recurrence",
      score: Math.min(0.6 + match.count * 0.08, 0.9)
    });
  }

  return suggestions;
}

function normalizeDescription(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
