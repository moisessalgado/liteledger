import { getDatabase } from "@/db/client";
import {
  CategorizationSuggestion,
  suggestByRecurrence,
  suggestByRules
} from "@/services/categorizationEngine";
import { aggregateFixedCategoryTotals } from "@/services/dashboardAggregator";
import {
  Category,
  CategoryRule,
  ImportHistoryItem,
  ImportResult,
  MonthlyFixedCategoryTotal,
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

interface ImportSummaryRow {
  inserted_count: number;
  duplicate_count: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function parseBooleanFlag(value: number): boolean {
  return value === 1;
}

export function createCategory(name: string, isFixed: boolean): Category {
  const db = getDatabase();
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Nome da categoria e obrigatorio");
  }

  const id = makeId("cat");
  const createdAt = nowIso();
  db.runSync(
    "INSERT INTO categories (id, name, is_fixed, color, created_at) VALUES (?, ?, ?, ?, ?)",
    id,
    trimmedName,
    isFixed ? 1 : 0,
    "#2B6CB0",
    createdAt
  );

  return {
    id,
    name: trimmedName,
    isFixed,
    color: "#2B6CB0",
    createdAt
  };
}

export function listCategories(): Category[] {
  const db = getDatabase();
  const rows = db.getAllSync<{
    id: string;
    name: string;
    is_fixed: number;
    color: string;
    created_at: string;
  }>("SELECT id, name, is_fixed, color, created_at FROM categories ORDER BY name ASC");

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isFixed: parseBooleanFlag(row.is_fixed),
    color: row.color,
    createdAt: row.created_at
  }));
}

export function updateCategoryFixed(categoryId: string, isFixed: boolean): void {
  const db = getDatabase();
  db.runSync("UPDATE categories SET is_fixed = ? WHERE id = ?", isFixed ? 1 : 0, categoryId);
}

export function saveImportedTransactions(
  fileName: string,
  transactions: Transaction[],
  parserErrors: Array<{ line: number; reason: string }>,
  totalLines: number
): ImportResult {
  const db = getDatabase();
  const importId = makeId("imp");
  db.runSync(
    "INSERT INTO imports (id, file_name, imported_at, total_lines, inserted_count, duplicate_count, error_count) VALUES (?, ?, ?, ?, 0, 0, ?)",
    importId,
    fileName,
    nowIso(),
    totalLines,
    parserErrors.length
  );

  db.execSync("BEGIN TRANSACTION");
  try {
    for (const transaction of transactions) {
      if (transaction.nubankId) {
        const existing = db.getFirstSync<{ id: string }>(
          "SELECT id FROM transactions WHERE nubank_id = ? LIMIT 1",
          transaction.nubankId
        );

        if (existing) {
          db.runSync(
            "UPDATE imports SET duplicate_count = duplicate_count + 1 WHERE id = ?",
            importId
          );
          continue;
        }
      } else {
        const duplicateNoId = db.getFirstSync<{ id: string }>(
          "SELECT id FROM transactions WHERE nubank_id IS NULL AND date = ? AND amount = ? AND description = ? LIMIT 1",
          transaction.date,
          transaction.amount,
          transaction.description
        );
        if (duplicateNoId) {
          db.runSync(
            "UPDATE imports SET duplicate_count = duplicate_count + 1 WHERE id = ?",
            importId
          );
          continue;
        }
      }

      db.runSync(
        `INSERT INTO transactions
        (id, nubank_id, date, amount, description, type, category_id, is_categorized, import_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        makeId("tx"),
        transaction.nubankId,
        transaction.date,
        transaction.amount,
        transaction.description,
        transaction.type,
        transaction.categoryId,
        transaction.isCategorized ? 1 : 0,
        importId,
        nowIso()
      );
      db.runSync("UPDATE imports SET inserted_count = inserted_count + 1 WHERE id = ?", importId);
    }

    db.execSync("COMMIT");
  } catch (error) {
    db.execSync("ROLLBACK");
    throw error;
  }

  const summary = db.getFirstSync<ImportSummaryRow>(
    "SELECT inserted_count, duplicate_count FROM imports WHERE id = ?",
    importId
  );

  return {
    fileName,
    totalLines,
    inserted: summary?.inserted_count ?? 0,
    duplicates: summary?.duplicate_count ?? 0,
    errors: parserErrors
  };
}

export function listTransactionsByMonth(month: string): TransactionListItem[] {
  const db = getDatabase();
  const rows = db.getAllSync<{
    id: string;
    nubank_id: string | null;
    date: string;
    amount: number;
    description: string;
    type: "income" | "expense";
    category_id: string | null;
    is_categorized: number;
    import_id: string;
    created_at: string;
    category_name: string | null;
  }>(
    `SELECT
      t.id,
      t.nubank_id,
      t.date,
      t.amount,
      t.description,
      t.type,
      t.category_id,
      t.is_categorized,
      t.import_id,
      t.created_at,
      c.name as category_name
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE substr(t.date, 1, 7) = ?
     ORDER BY t.date DESC, t.created_at DESC`,
    month
  );

  return rows.map((row) => ({
    id: row.id,
    nubankId: row.nubank_id,
    date: row.date,
    amount: row.amount,
    description: row.description,
    type: row.type,
    categoryId: row.category_id,
    isCategorized: parseBooleanFlag(row.is_categorized),
    importId: row.import_id,
    createdAt: row.created_at,
    categoryName: row.category_name
  }));
}

export function assignCategoryToTransaction(transactionId: string, categoryId: string | null): void {
  const db = getDatabase();
  db.runSync(
    "UPDATE transactions SET category_id = ?, is_categorized = ? WHERE id = ?",
    categoryId,
    categoryId ? 1 : 0,
    transactionId
  );
}

export function assignCategoryToTransactions(
  transactionIds: string[],
  categoryId: string | null
): number {
  if (transactionIds.length === 0) {
    return 0;
  }

  const db = getDatabase();
  db.execSync("BEGIN TRANSACTION");
  try {
    for (const transactionId of transactionIds) {
      db.runSync(
        "UPDATE transactions SET category_id = ?, is_categorized = ? WHERE id = ?",
        categoryId,
        categoryId ? 1 : 0,
        transactionId
      );
    }
    db.execSync("COMMIT");
    return transactionIds.length;
  } catch (error) {
    db.execSync("ROLLBACK");
    throw error;
  }
}

export function listCategoryRules(): CategoryRule[] {
  const db = getDatabase();
  const rows = db.getAllSync<{
    id: string;
    category_id: string;
    matcher: string;
    kind: "contains" | "regex";
    created_at: string;
  }>("SELECT id, category_id, matcher, kind, created_at FROM rules ORDER BY created_at ASC");

  return rows.map((row) => ({
    id: row.id,
    categoryId: row.category_id,
    matcher: row.matcher,
    kind: row.kind,
    createdAt: row.created_at
  }));
}

export function createCategoryRule(
  categoryId: string,
  matcher: string,
  kind: "contains" | "regex" = "contains"
): CategoryRule {
  const db = getDatabase();
  const normalizedMatcher = matcher.trim();
  if (!normalizedMatcher) {
    throw new Error("Texto da regra e obrigatorio");
  }

  if (kind === "regex") {
    try {
      // Validate regex at creation time to avoid runtime suggestion errors.
      // eslint-disable-next-line no-new
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

  db.runSync(
    "INSERT INTO rules (id, category_id, matcher, kind, created_at) VALUES (?, ?, ?, ?, ?)",
    rule.id,
    rule.categoryId,
    rule.matcher,
    rule.kind,
    rule.createdAt
  );

  return rule;
}

export function suggestCategoriesForMonth(month: string): SuggestedCategory[] {
  const db = getDatabase();
  const monthTransactions = listTransactionsByMonth(month);
  const uncategorized = monthTransactions.filter((transaction) => !transaction.categoryId);

  if (uncategorized.length === 0) {
    return [];
  }

  const categorizedHistory = db.getAllSync<{
    id: string;
    nubank_id: string | null;
    date: string;
    amount: number;
    description: string;
    type: "income" | "expense";
    category_id: string | null;
    is_categorized: number;
    import_id: string;
    created_at: string;
  }>(
    `SELECT
      id,
      nubank_id,
      date,
      amount,
      description,
      type,
      category_id,
      is_categorized,
      import_id,
      created_at
     FROM transactions
     WHERE category_id IS NOT NULL`
  );

  const rules = listCategoryRules();
  const historyTransactions: Transaction[] = categorizedHistory.map((row) => ({
    id: row.id,
    nubankId: row.nubank_id,
    date: row.date,
    amount: row.amount,
    description: row.description,
    type: row.type,
    categoryId: row.category_id,
    isCategorized: parseBooleanFlag(row.is_categorized),
    importId: row.import_id,
    createdAt: row.created_at
  }));

  const ruleSuggestions = suggestByRules(uncategorized, rules);
  const recurrenceSuggestions = suggestByRecurrence(uncategorized, historyTransactions);
  const chosen = new Map<string, CategorizationSuggestion>();

  for (const suggestion of [...recurrenceSuggestions, ...ruleSuggestions]) {
    const current = chosen.get(suggestion.transactionId);
    if (!current || suggestion.score >= current.score) {
      chosen.set(suggestion.transactionId, suggestion);
    }
  }

  const categoryNameById = new Map(listCategories().map((category) => [category.id, category.name]));

  return Array.from(chosen.values()).map((item) => ({
    transactionId: item.transactionId,
    categoryId: item.categoryId,
    categoryName: categoryNameById.get(item.categoryId) ?? "Categoria",
    reason: item.reason,
    score: item.score
  }));
}

export function listTransactionsByMonths(months: string[]): Transaction[] {
  if (months.length === 0) {
    return [];
  }

  const db = getDatabase();
  const placeholders = months.map(() => "?").join(", ");
  const rows = db.getAllSync<{
    id: string;
    nubank_id: string | null;
    date: string;
    amount: number;
    description: string;
    type: "income" | "expense";
    category_id: string | null;
    is_categorized: number;
    import_id: string;
    created_at: string;
  }>(
    `SELECT
      id,
      nubank_id,
      date,
      amount,
      description,
      type,
      category_id,
      is_categorized,
      import_id,
      created_at
     FROM transactions
     WHERE substr(date, 1, 7) IN (${placeholders})`,
    ...months
  );

  return rows.map((row) => ({
    id: row.id,
    nubankId: row.nubank_id,
    date: row.date,
    amount: row.amount,
    description: row.description,
    type: row.type,
    categoryId: row.category_id,
    isCategorized: parseBooleanFlag(row.is_categorized),
    importId: row.import_id,
    createdAt: row.created_at
  }));
}

export function getMonthlyTotals(month: string): MonthlyTotals {
  const db = getDatabase();
  const incomeRow = db.getFirstSync<{ total: number | null }>(
    "SELECT SUM(amount) as total FROM transactions WHERE substr(date, 1, 7) = ? AND type = 'income'",
    month
  );
  const expenseRow = db.getFirstSync<{ total: number | null }>(
    "SELECT SUM(amount) as total FROM transactions WHERE substr(date, 1, 7) = ? AND type = 'expense'",
    month
  );

  const income = Number((incomeRow?.total ?? 0).toFixed(2));
  const expense = Math.abs(Number((expenseRow?.total ?? 0).toFixed(2)));
  const balance = Number((income - expense).toFixed(2));

  return { income, expense, balance };
}

export function getFixedCategoryEvolution(months: string[]): MonthlyFixedCategoryTotal[] {
  const categories = listCategories();
  const transactions = listTransactionsByMonths(months);
  return aggregateFixedCategoryTotals(transactions, categories, months);
}

export function listImportHistory(limit = 10): ImportHistoryItem[] {
  const db = getDatabase();
  const rows = db.getAllSync<{
    id: string;
    file_name: string;
    imported_at: string;
    total_lines: number;
    inserted_count: number;
    duplicate_count: number;
    error_count: number;
  }>(
    `SELECT
      id,
      file_name,
      imported_at,
      total_lines,
      inserted_count,
      duplicate_count,
      error_count
     FROM imports
     ORDER BY imported_at DESC
     LIMIT ?`,
    limit
  );

  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    importedAt: row.imported_at,
    totalLines: row.total_lines,
    insertedCount: row.inserted_count,
    duplicateCount: row.duplicate_count,
    errorCount: row.error_count
  }));
}

export function getFixedExpenseTrendByMonth(months: string[]): MonthlyTrendItem[] {
  const evolution = getFixedCategoryEvolution(months);
  const byMonth = new Map<string, number>();

  for (const month of months) {
    byMonth.set(month, 0);
  }

  for (const row of evolution) {
    byMonth.set(row.month, Number(((byMonth.get(row.month) ?? 0) + row.total).toFixed(2)));
  }

  return months.map((month) => ({
    month,
    fixedExpenseTotal: Number((byMonth.get(month) ?? 0).toFixed(2))
  }));
}
