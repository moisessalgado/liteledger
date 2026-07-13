import { classifyLevel2 } from "@/services/level2Categories";
import {
  Category,
  CategoryRule,
  ImportHistoryItem,
  Transaction
} from "@/types/finance";

const STORAGE_KEY = "liteledger-web-db-v1";

interface DatabaseState {
  categories: Category[];
  rules: CategoryRule[];
  transactions: Transaction[];
  imports: ImportHistoryItem[];
}

let state: DatabaseState | null = null;

const LEGACY_CATEGORY_NAME_MAP = new Map<string, string>([
  ["alimentacao", "Alimentação"],
  ["saude", "Saúde"],
  ["educacao", "Educação"],
  ["cartao de credito", "Cartão de Crédito"],
  ["sitio em angelina", "Sítio em Angelina"],
  ["aplicacao caixinha", "Aplicação Caixinha"],
  ["consorcio imobiliario", "Consórcio Imobiliário"]
]);

function defaultState(): DatabaseState {
  return {
    categories: [],
    rules: [],
    transactions: [],
    imports: []
  };
}

function loadState(): DatabaseState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(raw) as DatabaseState;
    return {
      categories: (parsed.categories ?? []).map((category) => ({
        ...category,
        name: LEGACY_CATEGORY_NAME_MAP.get(category.name.toLowerCase()) ?? category.name,
        color:
          typeof category.color === "string" && /^#[0-9a-fA-F]{6}$/.test(category.color)
            ? category.color
            : "#2B6CB0"
      })),
      rules: parsed.rules ?? [],
      transactions: (parsed.transactions ?? []).map((tx) => ({
        ...tx,
        level2CategoryId: tx.level2CategoryId || classifyLevel2(tx.description, tx.type)
      })),
      imports: parsed.imports ?? []
    };
  } catch {
    return defaultState();
  }
}

function persist(next: DatabaseState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function initializeDatabase(): void {
  if (!state) {
    state = loadState();
    persist(state);
  }
}

export function readDatabase(): DatabaseState {
  initializeDatabase();
  return state as DatabaseState;
}

export function writeDatabase(next: DatabaseState): void {
  state = next;
  persist(next);
}

export function resetDatabase(): void {
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  persist(state);
}
