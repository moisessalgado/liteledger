import { Category, CategoryRule } from "@/types/finance";

const RULES_CSV_HEADER = ["ordem", "matcher", "tipo", "categoria"];

export interface ImportedCategoryRuleRow {
  line: number;
  order: number;
  matcher: string;
  kind: "contains" | "regex";
  categoryName: string;
}

export interface ParsedCategoryRulesCsv {
  rows: ImportedCategoryRuleRow[];
  totalLines: number;
  errors: Array<{ line: number; reason: string }>;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function exportCategoryRulesCsv(rules: CategoryRule[], categories: Category[]): string {
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  const lines = [RULES_CSV_HEADER.join(",")];

  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    lines.push(
      [
        String(index + 1),
        escapeCsv(rule.matcher),
        rule.kind,
        escapeCsv(categoryNameById.get(rule.categoryId) ?? "")
      ].join(",")
    );
  }

  return `${lines.join("\n")}\n`;
}

export function parseCategoryRulesCsv(content: string): ParsedCategoryRulesCsv {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    throw new Error("CSV de regras sem linhas de dados");
  }

  const header = splitCsvLine(lines[0]).map(normalizeHeader);
  if (header.join("|") !== RULES_CSV_HEADER.join("|")) {
    throw new Error("Cabecalho invalido. Use: ordem,matcher,tipo,categoria");
  }

  const rows: ImportedCategoryRuleRow[] = [];
  const errors: Array<{ line: number; reason: string }> = [];

  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const columns = splitCsvLine(lines[index]);

    try {
      if (columns.length < 4) {
        throw new Error("Esperadas 4 colunas");
      }

      const order = Number.parseInt(columns[0], 10);
      const matcher = columns[1]?.trim();
      const kind = columns[2]?.trim() as "contains" | "regex";
      const categoryName = columns.slice(3).join(",").trim();

      if (!Number.isInteger(order) || order <= 0) {
        throw new Error("Ordem invalida");
      }
      if (!matcher) {
        throw new Error("Matcher obrigatorio");
      }
      if (kind !== "contains" && kind !== "regex") {
        throw new Error("Tipo invalido. Use contains ou regex");
      }
      if (!categoryName) {
        throw new Error("Categoria obrigatoria");
      }

      rows.push({
        line: lineNumber,
        order,
        matcher,
        kind,
        categoryName
      });
    } catch (error) {
      errors.push({
        line: lineNumber,
        reason: error instanceof Error ? error.message : "Erro desconhecido"
      });
    }
  }

  rows.sort((a, b) => a.order - b.order || a.line - b.line);

  return {
    rows,
    totalLines: Math.max(lines.length - 1, 0),
    errors
  };
}

// --- Level 3 full config export/import (JSON) ---

interface Level3ConfigExport {
  version: 1;
  categories: Array<{ name: string; color: string }>;
  rules: Array<{ order: number; matcher: string; kind: "contains" | "regex"; categoryName: string }>;
}

export function exportLevel3ConfigJson(categories: Category[], rules: CategoryRule[]): string {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const config: Level3ConfigExport = {
    version: 1,
    categories: categories.map((c) => ({ name: c.name, color: c.color })),
    rules: rules.map((r, i) => ({
      order: i + 1,
      matcher: r.matcher,
      kind: r.kind,
      categoryName: categoryNameById.get(r.categoryId) ?? ""
    }))
  };

  return JSON.stringify(config, null, 2);
}

export interface ParsedLevel3Config {
  categories: Array<{ name: string; color: string }>;
  rules: Array<{ order: number; matcher: string; kind: "contains" | "regex"; categoryName: string }>;
}

export function parseLevel3ConfigJson(content: string): ParsedLevel3Config {
  let parsed: Level3ConfigExport;
  try {
    parsed = JSON.parse(content) as Level3ConfigExport;
  } catch {
    throw new Error("Arquivo JSON invalido");
  }

  if (!parsed || parsed.version !== 1) {
    throw new Error("Formato de configuracao invalido ou versao incompativel");
  }

  if (!Array.isArray(parsed.categories) || !Array.isArray(parsed.rules)) {
    throw new Error("Formato de configuracao invalido: categorias ou regras ausentes");
  }

  for (const cat of parsed.categories) {
    if (!cat.name || typeof cat.name !== "string") {
      throw new Error("Categoria com nome invalido");
    }
  }

  for (const rule of parsed.rules) {
    if (!rule.matcher || typeof rule.matcher !== "string") {
      throw new Error("Regra com matcher invalido");
    }
    if (rule.kind !== "contains" && rule.kind !== "regex") {
      throw new Error("Regra com tipo invalido: use contains ou regex");
    }
    if (!rule.categoryName || typeof rule.categoryName !== "string") {
      throw new Error("Regra com categoria invalida");
    }
  }

  return {
    categories: parsed.categories,
    rules: parsed.rules.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  };
}