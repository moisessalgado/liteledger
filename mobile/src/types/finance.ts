export type EntryType = "income" | "expense";

export interface Transaction {
  id: string;
  nubankId: string | null;
  date: string;
  amount: number;
  description: string;
  type: EntryType;
  categoryId: string | null;
  isCategorized: boolean;
  importId: string;
  createdAt: string;
}

export interface TransactionListItem extends Transaction {
  categoryName: string | null;
}

export interface Category {
  id: string;
  name: string;
  isFixed: boolean;
  color: string;
  createdAt: string;
}

export interface ImportResult {
  fileName: string;
  totalLines: number;
  inserted: number;
  duplicates: number;
  errors: Array<{ line: number; reason: string }>;
}

export interface ImportHistoryItem {
  id: string;
  fileName: string;
  importedAt: string;
  totalLines: number;
  insertedCount: number;
  duplicateCount: number;
  errorCount: number;
}

export interface CategoryRule {
  id: string;
  categoryId: string;
  matcher: string;
  kind: "contains" | "regex";
  createdAt: string;
}

export interface MonthlyFixedCategoryTotal {
  month: string;
  categoryId: string;
  categoryName: string;
  total: number;
  previousMonthTotal: number;
  variationPercent: number;
}

export interface SuggestedCategory {
  transactionId: string;
  categoryId: string;
  categoryName: string;
  reason: "rule" | "recurrence";
  score: number;
}

export interface MonthlyTrendItem {
  month: string;
  fixedExpenseTotal: number;
}
