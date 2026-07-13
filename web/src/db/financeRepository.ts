import { readDatabase, writeDatabase } from "@/db/client";
import {
  ImportedCategoryRuleRow,
  exportLevel3ConfigJson,
  parseLevel3ConfigJson
} from "@/importers/categoryRulesCsv";
import {
  CategorizationSuggestion,
  suggestByRecurrence,
  suggestByRules
} from "@/services/categorizationEngine";
import { aggregateCategoryTotals } from "@/services/dashboardAggregator";
import { Level1MonthlyTotal, aggregateLevel1Totals } from "@/services/level1Aggregator";
import { ALL_LEVEL2_CATEGORIES } from "@/services/level2Categories";
import { Level2MonthlyTotal, aggregateLevel2Totals } from "@/services/level2Aggregator";
import {
  Category,
  CategoryRule,
  ImportHistoryItem,
  ImportResult,
  MonthlyCategoryTotal,
  MonthlyTrendItem,
  SuggestedCategory,
  Transaction,
  TransactionListItem
} from "@/types/finance";

interface MonthlyTotals {
  income: number;
  expense: number;
  balance: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function createCategory(name: string, color: string): Category {
  const db = readDatabase();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Nome da categoria e obrigatorio");
  }

  const duplicated = db.categories.some(
    (category) => category.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicated) {
    throw new Error("Categoria ja existe");
  }

  const category: Category = {
    id: makeId("cat"),
    name: trimmedName,
    color,
    createdAt: nowIso()
  };

  writeDatabase({
    ...db,
    categories: [...db.categories, category]
  });

  return category;
}

export function updateCategoryColor(categoryId: string, color: string): void {
  const db = readDatabase();
  writeDatabase({
    ...db,
    categories: db.categories.map((category) =>
      category.id === categoryId ? { ...category, color } : category
    )
  });
}

export function listCategories(): Category[] {
  const db = readDatabase();
  return [...db.categories].sort((a, b) => a.name.localeCompare(b.name));
}

export function renameCategory(categoryId: string, nextName: string): void {
  const db = readDatabase();
  const trimmedName = nextName.trim();

  if (!trimmedName) {
    throw new Error("Nome da categoria e obrigatorio");
  }

  const duplicated = db.categories.some(
    (category) =>
      category.id !== categoryId &&
      category.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicated) {
    throw new Error("Categoria ja existe");
  }

  writeDatabase({
    ...db,
    categories: db.categories.map((category) =>
      category.id === categoryId ? { ...category, name: trimmedName } : category
    )
  });
}

export function deleteCategoryAndReassign(categoryId: string, reassignToCategoryId: string): number {
  if (categoryId === reassignToCategoryId) {
    throw new Error("Escolha uma categoria diferente para reatribuicao");
  }

  const db = readDatabase();
  const sourceExists = db.categories.some((item) => item.id === categoryId);
  const targetExists = db.categories.some((item) => item.id === reassignToCategoryId);

  if (!sourceExists || !targetExists) {
    throw new Error("Categoria invalida para exclusao ou reatribuicao");
  }

  let updated = 0;
  const transactions = db.transactions.map((transaction) => {
    if (transaction.categoryId !== categoryId) {
      return transaction;
    }

    updated += 1;
    return {
      ...transaction,
      categoryId: reassignToCategoryId,
      isCategorized: true
    };
  });

  writeDatabase({
    ...db,
    categories: db.categories.filter((item) => item.id !== categoryId),
    rules: db.rules.filter((rule) => rule.categoryId !== categoryId),
    transactions
  });

  return updated;
}

export function deleteCategoryPermanently(categoryId: string): number {
  const db = readDatabase();
  const exists = db.categories.some((item) => item.id === categoryId);

  if (!exists) {
    throw new Error("Categoria invalida para exclusao");
  }

  let updated = 0;
  const transactions = db.transactions.map((transaction) => {
    if (transaction.categoryId !== categoryId) {
      return transaction;
    }

    updated += 1;
    return {
      ...transaction,
      categoryId: null,
      isCategorized: false
    };
  });

  writeDatabase({
    ...db,
    categories: db.categories.filter((item) => item.id !== categoryId),
    rules: db.rules.filter((rule) => rule.categoryId !== categoryId),
    transactions
  });

  return updated;
}

export function saveImportedTransactions(
  fileName: string,
  transactions: Transaction[],
  parserErrors: Array<{ line: number; reason: string }>,
  totalLines: number,
  parserDuplicateCount = 0
): ImportResult {
  const db = readDatabase();
  const importId = makeId("imp");

  let insertedCount = 0;
  let duplicateCount = 0;

  const existing = [...db.transactions];
  const inserted: Transaction[] = [];

  for (const transaction of transactions) {
    const duplicated = transaction.nubankId
      ? existing.some((item) => item.nubankId === transaction.nubankId)
      : existing.some(
          (item) =>
            item.nubankId === null &&
            item.date === transaction.date &&
            item.amount === transaction.amount &&
            item.description === transaction.description
        );

    if (duplicated) {
      duplicateCount += 1;
      continue;
    }

    const row: Transaction = {
      ...transaction,
      id: makeId("tx"),
      importId,
      createdAt: nowIso()
    };

    existing.push(row);
    inserted.push(row);
    insertedCount += 1;
  }

  const importHistory: ImportHistoryItem = {
    id: importId,
    fileName,
    importedAt: nowIso(),
    totalLines,
    insertedCount,
    duplicateCount: duplicateCount + parserDuplicateCount,
    errorCount: parserErrors.length
  };

  writeDatabase({
    ...db,
    transactions: existing,
    imports: [importHistory, ...db.imports]
  });

  return {
    fileName,
    totalLines,
    inserted: inserted.length,
    duplicates: duplicateCount + parserDuplicateCount,
    errors: parserErrors
  };
}

export function listTransactionsByMonth(month: string): TransactionListItem[] {
  const db = readDatabase();
  const categoryById = new Map(db.categories.map((item) => [item.id, item.name]));

  return db.transactions
    .filter((transaction) => transaction.date.slice(0, 7) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map((transaction) => ({
      ...transaction,
      categoryName: transaction.categoryId ? categoryById.get(transaction.categoryId) ?? null : null
    }));
}

export function assignCategoryToTransaction(transactionId: string, categoryId: string | null): void {
  const db = readDatabase();
  const sourceTransaction = db.transactions.find((transaction) => transaction.id === transactionId);
  const normalizedDescription = sourceTransaction?.description.trim().toLowerCase() ?? null;

  writeDatabase({
    ...db,
    transactions: db.transactions.map((transaction) =>
      transaction.id === transactionId ||
      (
        Boolean(categoryId) &&
        normalizedDescription !== null &&
        !transaction.categoryId &&
        transaction.description.trim().toLowerCase() === normalizedDescription
      )
        ? {
            ...transaction,
            categoryId,
            isCategorized: Boolean(categoryId)
          }
        : transaction
    )
  });
}

export function assignCategoryToTransactions(
  transactionIds: string[],
  categoryId: string | null
): number {
  if (transactionIds.length === 0) {
    return 0;
  }

  const target = new Set(transactionIds);
  const db = readDatabase();
  let updated = 0;

  const transactions = db.transactions.map((transaction) => {
    if (!target.has(transaction.id)) {
      return transaction;
    }

    updated += 1;
    return {
      ...transaction,
      categoryId,
      isCategorized: Boolean(categoryId)
    };
  });

  writeDatabase({
    ...db,
    transactions
  });

  return updated;
}

export function listCategoryRules(): CategoryRule[] {
  const db = readDatabase();
  return [...db.rules];
}

export function createCategoryRule(
  categoryId: string,
  matcher: string,
  kind: "contains" | "regex" = "contains"
): CategoryRule {
  const db = readDatabase();
  const normalizedMatcher = matcher.trim();

  if (!normalizedMatcher) {
    throw new Error("Texto da regra e obrigatorio");
  }

  if (kind === "regex") {
    try {
      new RegExp(normalizedMatcher, "i");
    } catch {
      throw new Error("Regex invalido");
    }
  }

  const rule: CategoryRule = {
    id: makeId("rule"),
    categoryId,
    matcher: normalizedMatcher,
    kind,
    createdAt: nowIso()
  };

  writeDatabase({
    ...db,
    rules: [...db.rules, rule]
  });

  return rule;
}

export function moveCategoryRule(ruleId: string, direction: "up" | "down"): void {
  const db = readDatabase();
  const index = db.rules.findIndex((rule) => rule.id === ruleId);
  if (index < 0) {
    return;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= db.rules.length) {
    return;
  }

  const nextRules = [...db.rules];
  const [moved] = nextRules.splice(index, 1);
  nextRules.splice(targetIndex, 0, moved);

  writeDatabase({
    ...db,
    rules: nextRules
  });
}

export function reorderCategoryRule(sourceRuleId: string, targetRuleId: string): void {
  if (sourceRuleId === targetRuleId) {
    return;
  }

  const db = readDatabase();
  const sourceIndex = db.rules.findIndex((rule) => rule.id === sourceRuleId);
  const targetIndex = db.rules.findIndex((rule) => rule.id === targetRuleId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return;
  }

  const nextRules = [...db.rules];
  const [sourceRule] = nextRules.splice(sourceIndex, 1);
  nextRules.splice(targetIndex, 0, sourceRule);

  writeDatabase({
    ...db,
    rules: nextRules
  });
}

export function deleteCategoryRule(ruleId: string): void {
  const db = readDatabase();
  writeDatabase({
    ...db,
    rules: db.rules.filter((rule) => rule.id !== ruleId)
  });
}

export function importCategoryRules(
  rows: ImportedCategoryRuleRow[]
): { inserted: number; errors: Array<{ line: number; reason: string }> } {
  const db = readDatabase();
  const categoryIdByName = new Map(
    db.categories.map((category) => [category.name.trim().toLowerCase(), category.id])
  );

  const nextRules = [...db.rules];
  const errors: Array<{ line: number; reason: string }> = [];
  let inserted = 0;

  for (const row of rows) {
    const categoryId = categoryIdByName.get(row.categoryName.trim().toLowerCase());
    if (!categoryId) {
      errors.push({
        line: row.line,
        reason: `Categoria nao encontrada: ${row.categoryName}`
      });
      continue;
    }

    if (row.kind === "regex") {
      try {
        new RegExp(row.matcher, "i");
      } catch {
        errors.push({
          line: row.line,
          reason: "Regex invalido"
        });
        continue;
      }
    }

    nextRules.push({
      id: makeId("rule"),
      categoryId,
      matcher: row.matcher,
      kind: row.kind,
      createdAt: nowIso()
    });
    inserted += 1;
  }

  writeDatabase({
    ...db,
    rules: nextRules
  });

  return { inserted, errors };
}

export function suggestCategoriesForMonth(month: string): SuggestedCategory[] {
  return suggestCategoriesForMonths([month]);
}

export function suggestCategoriesForMonths(months: string[]): SuggestedCategory[] {
  if (months.length === 0) {
    return [];
  }

  const db = readDatabase();
  const monthTransactions = listTransactionsByMonths(months);
  const uncategorized = monthTransactions.filter((transaction) => !transaction.categoryId);

  if (uncategorized.length === 0) {
    return [];
  }

  const categorizedHistory = db.transactions.filter((transaction) => transaction.categoryId);

  const ruleSuggestions = suggestByRules(uncategorized, db.rules);
  const recurrenceSuggestions = suggestByRecurrence(uncategorized, categorizedHistory);

  const chosen = new Map<string, CategorizationSuggestion>();

  for (const suggestion of [...recurrenceSuggestions, ...ruleSuggestions]) {
    const current = chosen.get(suggestion.transactionId);
    if (!current || suggestion.score >= current.score) {
      chosen.set(suggestion.transactionId, suggestion);
    }
  }

  const categoryNameById = new Map(db.categories.map((category) => [category.id, category.name]));

  return Array.from(chosen.values()).map((item) => ({
    transactionId: item.transactionId,
    categoryId: item.categoryId,
    categoryName: categoryNameById.get(item.categoryId) ?? "Categoria",
    reason: item.reason,
    score: item.score
  }));
}

export function listTransactionsByMonths(months: string[]): TransactionListItem[] {
  if (months.length === 0) {
    return [];
  }

  const monthSet = new Set(months);
  const db = readDatabase();
  const categoryById = new Map(db.categories.map((item) => [item.id, item.name]));

  return db.transactions
    .filter((transaction) => monthSet.has(transaction.date.slice(0, 7)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .map((transaction) => ({
      ...transaction,
      categoryName: transaction.categoryId ? categoryById.get(transaction.categoryId) ?? null : null
    }));
}

export function listTransactionMonths(): string[] {
  const db = readDatabase();
  const unique = new Set(db.transactions.map((item) => item.date.slice(0, 7)));
  return Array.from(unique).sort((a, b) => a.localeCompare(b));
}

export function getMonthlyTotals(month: string): MonthlyTotals {
  const transactions = listTransactionsByMonth(month);

  const income = round2(
    transactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + item.amount, 0)
  );
  const expense = round2(
    Math.abs(
      transactions
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + item.amount, 0)
    )
  );

  return {
    income,
    expense,
    balance: round2(income - expense)
  };
}

export function getCategoryEvolution(months: string[]): MonthlyCategoryTotal[] {
  const categories = listCategories();
  const transactions = listTransactionsByMonths(months);
  return aggregateCategoryTotals(transactions, categories, months);
}

export function getLevel1Evolution(months: string[]): Level1MonthlyTotal[] {
  const transactions = listTransactionsByMonths(months);
  return aggregateLevel1Totals(transactions, months);
}

export function getLevel2Evolution(months: string[]): Level2MonthlyTotal[] {
  const transactions = listTransactionsByMonths(months);
  return aggregateLevel2Totals(transactions, ALL_LEVEL2_CATEGORIES, months);
}

export function listImportHistory(limit = 10): ImportHistoryItem[] {
  const db = readDatabase();
  return [...db.imports]
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, limit);
}

export function getExpenseTrendByMonth(months: string[]): MonthlyTrendItem[] {
  const evolution = getCategoryEvolution(months);
  const byMonth = new Map<string, number>();

  for (const month of months) {
    byMonth.set(month, 0);
  }

  for (const row of evolution) {
    byMonth.set(row.month, round2((byMonth.get(row.month) ?? 0) + row.total));
  }

  return months.map((month) => ({
    month,
    expenseTotal: round2(byMonth.get(month) ?? 0)
  }));
}

export function exportLevel3Config(): string {
  const db = readDatabase();
  return exportLevel3ConfigJson(db.categories, db.rules);
}

export function importLevel3Config(
  jsonContent: string
): { categoriesInserted: number; rulesInserted: number; errors: string[] } {
  const config = parseLevel3ConfigJson(jsonContent);
  const db = readDatabase();
  const errors: string[] = [];

  const existingByName = new Map(
    db.categories.map((c) => [c.name.trim().toLowerCase(), c])
  );

  let categoriesInserted = 0;
  const nextCategories = [...db.categories];

  for (const cat of config.categories) {
    const key = cat.name.trim().toLowerCase();
    if (existingByName.has(key)) {
      continue;
    }

    const newCat = {
      id: makeId("cat"),
      name: cat.name.trim(),
      color: /^#[0-9a-fA-F]{6}$/.test(cat.color) ? cat.color : "#2B6CB0",
      createdAt: nowIso()
    };
    nextCategories.push(newCat);
    existingByName.set(key, newCat);
    categoriesInserted += 1;
  }

  const categoryIdByName = new Map(
    nextCategories.map((c) => [c.name.trim().toLowerCase(), c.id])
  );

  let rulesInserted = 0;
  const nextRules = [...db.rules];

  for (const rule of config.rules) {
    const categoryId = categoryIdByName.get(rule.categoryName.trim().toLowerCase());
    if (!categoryId) {
      errors.push(`Categoria nao encontrada: ${rule.categoryName}`);
      continue;
    }

    if (rule.kind === "regex") {
      try {
        new RegExp(rule.matcher, "i");
      } catch {
        errors.push(`Regex invalido: ${rule.matcher}`);
        continue;
      }
    }

    nextRules.push({
      id: makeId("rule"),
      categoryId,
      matcher: rule.matcher,
      kind: rule.kind,
      createdAt: nowIso()
    });
    rulesInserted += 1;
  }

  writeDatabase({
    ...db,
    categories: nextCategories,
    rules: nextRules
  });

  return { categoriesInserted, rulesInserted, errors };
}
