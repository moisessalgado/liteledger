import { classifyLevel2 } from "@/services/level2Categories";
import { ImportResult, Transaction } from "@/types/finance";

const NUBANK_HEADER = ["Data", "Valor", "Identificador", "Descricao"];

export interface RawCsvInput {
  fileName: string;
  content: string;
}

export interface ParsedImport {
  importResult: ImportResult;
  transactions: Transaction[];
}

function normalizeHeader(value: string): string {
  return value.trim().replace("Descrição", "Descricao");
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

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

function parseBrazilianDate(dateString: string): string {
  const [day, month, year] = dateString.split("/");
  if (!day || !month || !year) {
    throw new Error("Invalid date format");
  }

  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (Number.isNaN(Date.parse(iso))) {
    throw new Error("Invalid date value");
  }

  return iso;
}

function parseAmount(rawAmount: string): number {
  const normalized = rawAmount.replace(/\s+/g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error("Invalid amount");
  }
  return value;
}

function inferType(amount: number): "income" | "expense" {
  return amount >= 0 ? "income" : "expense";
}

function maybeNubankId(value: string): string | null {
  const id = value.trim();
  if (!id) {
    return null;
  }
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) ? id : null;
}

export function parseNubankCsv(input: RawCsvInput): ParsedImport {
  const lines = input.content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);

  if (lines.length <= 1) {
    throw new Error("CSV has no transaction rows");
  }

  const header = splitCsvLine(lines[0]).map(normalizeHeader);
  if (header.join("|") !== NUBANK_HEADER.join("|")) {
    throw new Error("Unexpected CSV header. Expected Data,Valor,Identificador,Descricao");
  }

  const seenNubankIds = new Set<string>();
  const transactions: Transaction[] = [];
  const errors: Array<{ line: number; reason: string }> = [];
  let duplicates = 0;

  for (let index = 1; index < lines.length; index += 1) {
    const row = splitCsvLine(lines[index]);

    try {
      if (row.length < 4) {
        throw new Error("Expected 4 columns");
      }

      const date = parseBrazilianDate(row[0]);
      const amount = parseAmount(row[1]);
      const nubankId = maybeNubankId(row[2]);
      const description = row.slice(3).join(",").trim();

      if (!description) {
        throw new Error("Description is empty");
      }

      if (nubankId && seenNubankIds.has(nubankId)) {
        duplicates += 1;
        continue;
      }

      if (nubankId) {
        seenNubankIds.add(nubankId);
      }

      const now = new Date().toISOString();
      const txType = inferType(amount);
      transactions.push({
        id: `tx-${index}-${Date.now()}`,
        nubankId,
        date,
        amount,
        description,
        type: txType,
        categoryId: null,
        level2CategoryId: classifyLevel2(description, txType),
        isCategorized: false,
        importId: "",
        createdAt: now
      });
    } catch (error) {
      errors.push({
        line: index + 1,
        reason: error instanceof Error ? error.message : "Unknown parse error"
      });
    }
  }

  const importResult: ImportResult = {
    fileName: input.fileName,
    totalLines: Math.max(lines.length - 1, 0),
    inserted: transactions.length,
    duplicates,
    errors
  };

  return { importResult, transactions };
}
