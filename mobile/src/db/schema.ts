export const INIT_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  is_fixed INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#2B6CB0',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY NOT NULL,
  file_name TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  total_lines INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  nubank_id TEXT,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id TEXT,
  is_categorized INTEGER NOT NULL DEFAULT 0,
  import_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (import_id) REFERENCES imports(id)
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL,
  matcher TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('contains', 'regex')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_nubank_id
ON transactions(nubank_id)
WHERE nubank_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_month
ON transactions(date);

CREATE INDEX IF NOT EXISTS idx_transactions_category
ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_rules_category
ON rules(category_id);
`;
