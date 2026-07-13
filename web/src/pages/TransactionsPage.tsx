import { useEffect, useMemo, useState } from "react";

import {
  assignCategoryToTransaction,
  assignCategoryToTransactions,
  listImportHistory,
  listCategories,
  listTransactionMonths,
  listTransactionsByMonths,
  saveImportedTransactions,
  suggestCategoriesForMonths
} from "@/db/financeRepository";
import { parseNubankCsv } from "@/importers/nubankCsvImporter";
import { ImportResult, SuggestedCategory } from "@/types/finance";

interface BatchImportSummary {
  filesProcessed: number;
  totalLines: number;
  inserted: number;
  duplicates: number;
  errors: number;
}

interface TransactionsFilterState {
  fromMonth: string;
  toMonth: string;
  statusFilter: "all" | "categorized" | "pending";
  categoryFilterId: string;
  search: string;
  sortBy: "date-desc" | "date-asc" | "amount-desc" | "amount-asc";
}

const TRANSACTIONS_FILTERS_KEY = "liteledger-web-transactions-filters-v1";

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString("pt-BR");
}

const MONTH_INDEX: Record<string, number> = {
  JAN: 1,
  FEV: 2,
  MAR: 3,
  ABR: 4,
  MAI: 5,
  JUN: 6,
  JUL: 7,
  AGO: 8,
  SET: 9,
  OUT: 10,
  NOV: 11,
  DEZ: 12
};

const MONTH_NAME_PT = [
  "", "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

function formatPeriod(period: number): string {
  const year = Math.floor(period / 100);
  const month = period % 100;
  return `${MONTH_NAME_PT[month]} de ${year}`;
}

function periodFromFileName(fileName: string): number | null {
  const match = fileName.toUpperCase().match(/_(\d{2})([A-Z]{3})(\d{4})_(\d{2})([A-Z]{3})(\d{4})\.CSV$/);
  if (!match) {
    return null;
  }

  const startMonth = MONTH_INDEX[match[2]];
  const startYear = Number(match[3]);
  if (!startMonth || Number.isNaN(startYear)) {
    return null;
  }

  return startYear * 100 + startMonth;
}

function formatSignedAmount(amount: number, type: "income" | "expense"): string {
  const sign = type === "expense" ? "-" : "+";
  const formatted = Math.abs(amount).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${sign} R$ ${formatted}`;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function loadStoredFilters(): TransactionsFilterState | null {
  const raw = localStorage.getItem(TRANSACTIONS_FILTERS_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<TransactionsFilterState>;
    if (
      typeof parsed.fromMonth !== "string" ||
      typeof parsed.toMonth !== "string" ||
      (parsed.statusFilter !== "all" &&
        parsed.statusFilter !== "categorized" &&
        parsed.statusFilter !== "pending") ||
      (typeof parsed.categoryFilterId !== "undefined" && typeof parsed.categoryFilterId !== "string") ||
      typeof parsed.search !== "string" ||
      (parsed.sortBy !== "date-desc" &&
        parsed.sortBy !== "date-asc" &&
        parsed.sortBy !== "amount-desc" &&
        parsed.sortBy !== "amount-asc")
    ) {
      return null;
    }

    return {
      fromMonth: parsed.fromMonth,
      toMonth: parsed.toMonth,
      statusFilter: parsed.statusFilter,
      categoryFilterId: parsed.categoryFilterId ?? "",
      search: parsed.search,
      sortBy: parsed.sortBy
    };
  } catch {
    return null;
  }
}

export function TransactionsPage() {
  const storedFilters = loadStoredFilters();
  const [fromMonth, setFromMonth] = useState(storedFilters?.fromMonth ?? currentMonth());
  const [toMonth, setToMonth] = useState(storedFilters?.toMonth ?? currentMonth());
  const [statusFilter, setStatusFilter] = useState<"all" | "categorized" | "pending">(
    storedFilters?.statusFilter ?? "all"
  );
  const [categoryFilterId, setCategoryFilterId] = useState(storedFilters?.categoryFilterId ?? "");
  const [search, setSearch] = useState(storedFilters?.search ?? "");
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "amount-desc" | "amount-asc">(
    storedFilters?.sortBy ?? "date-desc"
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedCategory>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchImportSummary | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const isRangeValid = fromMonth <= toMonth;

  const monthsInRange = useMemo(() => {
    if (!isRangeValid || !fromMonth || !toMonth) {
      return [];
    }

    const [fromYearRaw, fromMonthRaw] = fromMonth.split("-").map(Number);
    const [toYearRaw, toMonthRaw] = toMonth.split("-").map(Number);
    if (!fromYearRaw || !fromMonthRaw || !toYearRaw || !toMonthRaw) {
      return [];
    }

    const result: string[] = [];
    const cursor = new Date(Date.UTC(fromYearRaw, fromMonthRaw - 1, 1));
    const end = new Date(Date.UTC(toYearRaw, toMonthRaw - 1, 1));

    while (cursor <= end) {
      result.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    return result;
  }, [fromMonth, toMonth, isRangeValid]);

  const transactions = useMemo(
    () => listTransactionsByMonths(monthsInRange),
    [monthsInRange, reloadToken]
  );
  const categories = useMemo(() => listCategories(), [reloadToken]);
  const availableMonths = useMemo(() => listTransactionMonths(), [reloadToken]);
  const history = useMemo(
    () =>
      [...listImportHistory(15)].sort((a, b) => {
        const periodA = periodFromFileName(a.fileName);
        const periodB = periodFromFileName(b.fileName);
        const monthDiff = (periodB ?? 0) - (periodA ?? 0);
        if (monthDiff !== 0) {
          return monthDiff;
        }
        return b.importedAt.localeCompare(a.importedAt);
      }),
    [reloadToken]
  );

  useEffect(() => {
    if (availableMonths.length === 0) {
      return;
    }

    const firstMonth = availableMonths[0];
    const lastMonth = availableMonths[availableMonths.length - 1];
    const shouldBootstrapFromData =
      fromMonth === currentMonth() && toMonth === currentMonth();

    if (
      shouldBootstrapFromData ||
      !availableMonths.includes(fromMonth) ||
      !availableMonths.includes(toMonth) ||
      fromMonth > toMonth
    ) {
      setFromMonth(firstMonth);
      setToMonth(lastMonth);
    }
  }, [availableMonths, fromMonth, toMonth]);

  useEffect(() => {
    const state: TransactionsFilterState = {
      fromMonth,
      toMonth,
      statusFilter,
      categoryFilterId,
      search,
      sortBy
    };

    localStorage.setItem(TRANSACTIONS_FILTERS_KEY, JSON.stringify(state));
  }, [fromMonth, toMonth, statusFilter, categoryFilterId, search, sortBy]);

  const filteredTransactions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = transactions.filter((item) => {
      if (statusFilter === "categorized" && !item.categoryId) {
        return false;
      }
      if (statusFilter === "pending" && item.categoryId) {
        return false;
      }
      if (categoryFilterId && item.categoryId !== categoryFilterId) {
        return false;
      }
      if (normalizedSearch && !item.description.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === "date-desc") {
        return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
      }
      if (sortBy === "date-asc") {
        return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
      }
      if (sortBy === "amount-desc") {
        return Math.abs(b.amount) - Math.abs(a.amount);
      }
      return Math.abs(a.amount) - Math.abs(b.amount);
    });
  }, [transactions, statusFilter, categoryFilterId, search, sortBy]);

  function refresh() {
    if (!isRangeValid) {
      setStatusMessage("Intervalo invalido. O mes inicial deve ser menor ou igual ao final.");
      return;
    }
    setReloadToken((value) => value + 1);
    setStatusMessage(null);
  }

  function clearSelection() {
    setSelectedIds({});
  }

  function applyCategory(transactionId: string, categoryId: string | null) {
    assignCategoryToTransaction(transactionId, categoryId);
    setSuggestions((current) => {
      const next = { ...current };
      delete next[transactionId];
      return next;
    });
    setReloadToken((value) => value + 1);
  }

  function generateSuggestions() {
    if (!isRangeValid) {
      setStatusMessage("Intervalo invalido. Ajuste os meses para gerar sugestões.");
      return;
    }

    const items = suggestCategoriesForMonths(monthsInRange);
    const eligibleVisibleIds = new Set(
      filteredTransactions.filter((transaction) => !transaction.categoryId).map((transaction) => transaction.id)
    );
    const indexed: Record<string, SuggestedCategory> = {};
    for (const item of items) {
      if (eligibleVisibleIds.has(item.transactionId)) {
        indexed[item.transactionId] = item;
      }
    }

    setSuggestions(indexed);
    const visibleSuggestedIds = Object.keys(indexed);
    if (visibleSuggestedIds.length > 0) {
      setSelectedIds((current) => {
        const next = { ...current };
        for (const id of visibleSuggestedIds) {
          next[id] = true;
        }
        return next;
      });
    }

    setStatusMessage(
      visibleSuggestedIds.length > 0
        ? `${visibleSuggestedIds.length} sugestoes geradas para as transações visíveis.`
        : "Nenhuma sugestao encontrada para as transações visíveis no filtro atual."
    );
  }

  function applySuggestedBatch() {
    const uncategorizedById = new Set(
      filteredTransactions.filter((transaction) => !transaction.categoryId).map((transaction) => transaction.id)
    );

    const transactionIds = Object.keys(suggestions).filter((transactionId) =>
      uncategorizedById.has(transactionId)
    );

    if (transactionIds.length === 0) {
      setStatusMessage("Nenhuma sugestao para aplicar.");
      return;
    }

    let applied = 0;
    for (const transactionId of transactionIds) {
      const suggestion = suggestions[transactionId];
      if (!suggestion) {
        continue;
      }
      assignCategoryToTransaction(transactionId, suggestion.categoryId);
      applied += 1;
    }

    setSuggestions({});
    clearSelection();
    setStatusMessage(`${applied} sugestoes aplicadas.`);
    setReloadToken((value) => value + 1);
  }

  const visibleIds = filteredTransactions.map((item) => item.id);
  const selectedVisibleIds = visibleIds.filter((id) => Boolean(selectedIds[id]));
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIds((current) => {
      const next = { ...current };
      if (checked) {
        for (const id of visibleIds) {
          next[id] = true;
        }
      } else {
        for (const id of visibleIds) {
          delete next[id];
        }
      }
      return next;
    });
  }

  function toggleSelectOne(transactionId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = { ...current };
      if (checked) {
        next[transactionId] = true;
      } else {
        delete next[transactionId];
      }
      return next;
    });
  }

  function categorizeSelected(categoryId: string | null) {
    if (selectedVisibleIds.length === 0) {
      setStatusMessage("Selecione ao menos uma transação para ação em lote.");
      return;
    }

    const updated = assignCategoryToTransactions(selectedVisibleIds, categoryId);
    setSuggestions({});
    clearSelection();
    setStatusMessage(
      categoryId
        ? `${updated} transações receberam categoria em lote.`
        : `${updated} transações ficaram sem categoria em lote.`
    );
    setReloadToken((value) => value + 1);
  }

  function selectByBulkCategory() {
    if (!bulkCategoryId) {
      setStatusMessage("Escolha uma categoria para selecionar transações na tabela.");
      return;
    }

    const idsToSelect = filteredTransactions
      .filter((transaction) => transaction.categoryId === bulkCategoryId)
      .map((transaction) => transaction.id);

    if (idsToSelect.length === 0) {
      setStatusMessage("Nenhuma transação da categoria escolhida foi encontrada no filtro atual.");
      return;
    }

    setSelectedIds((current) => {
      const next = { ...current };
      for (const id of idsToSelect) {
        next[id] = true;
      }
      return next;
    });

    setStatusMessage(`${idsToSelect.length} transações da categoria foram selecionadas na tabela.`);
  }

  function filterByBulkCategory() {
    if (!bulkCategoryId) {
      setStatusMessage("Escolha uma categoria para filtrar as transações.");
      return;
    }

    setCategoryFilterId(bulkCategoryId);
    setStatusFilter("categorized");
    clearSelection();
    setStatusMessage("Filtro aplicado para a categoria selecionada.");
  }

  const uncategorizedCount = filteredTransactions.filter((item) => !item.categoryId).length;

  async function handleFileChange(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setResults([]);
    setBatchSummary(null);

    const fileList = Array.from(files);
    let processed = 0;
    let totalLines = 0;
    let inserted = 0;
    let duplicates = 0;
    let errors = 0;
    const nextResults: ImportResult[] = [];

    for (const file of fileList) {
      try {
        const content = await file.text();
        const parsed = parseNubankCsv({ fileName: file.name, content });
        const persisted = saveImportedTransactions(
          parsed.importResult.fileName,
          parsed.transactions,
          parsed.importResult.errors,
          parsed.importResult.totalLines,
          parsed.importResult.duplicates
        );

        processed += 1;
        totalLines += persisted.totalLines;
        inserted += persisted.inserted;
        duplicates += persisted.duplicates;
        errors += persisted.errors.length;
        nextResults.push(persisted);
      } catch (error) {
        processed += 1;
        errors += 1;
        setImportError(
          error instanceof Error
            ? `Falha ao importar ${file.name}: ${error.message}`
            : `Falha ao importar ${file.name}`
        );
      }
    }

    setResults(nextResults);
    setBatchSummary({
      filesProcessed: processed,
      totalLines,
      inserted,
      duplicates,
      errors
    });
    setIsImporting(false);
    refresh();
  }

  return (
    <section className="page">
      <header>
        <h2>Transações</h2>
        <p className="meta">Revise e categorize movimentações importadas.</p>
      </header>

      <div className="card compact-card">
        <h3>Importação de CSV Nubank</h3>
        <div className="row compact-row">
          <label className="file-trigger secondary">
            Importar CSVs de transações
            <input
              className="file-input-hidden"
              type="file"
              accept=".csv,text/csv"
              multiple
              onChange={(event) => handleFileChange(event.target.files)}
            />
          </label>
          {isImporting ? <p className="meta">Importando...</p> : null}
        </div>
        {importError ? <p className="error">{importError}</p> : null}
        {batchSummary ? (
          <div className="mini-stats" style={{ marginTop: "8px" }}>
            <span className="mini-stat">Arquivos: {batchSummary.filesProcessed}</span>
            <span className="mini-stat">Linhas: {batchSummary.totalLines}</span>
            <span className="mini-stat">Inseridas: {batchSummary.inserted}</span>
            <span className="mini-stat">Duplicadas: {batchSummary.duplicates}</span>
            <span className="mini-stat">Erros: {batchSummary.errors}</span>
          </div>
        ) : null}
        {results.length > 0 ? (
          <p className="meta" style={{ marginTop: "8px" }}>
            Lote importado com {results.length} arquivo(s) processado(s).
          </p>
        ) : null}
      </div>

      <div className="card compact-card">
        <h3>Histórico de importações</h3>
        <div className="table-wrap compact-table-wrap">
          <table className="tx-table compact-table">
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Período</th>
                <th>Data e hora</th>
                <th>Linhas</th>
                <th>Inseridas</th>
                <th>Duplicadas</th>
                <th>Erros</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{item.fileName}</td>
                  <td>{(() => { const p = periodFromFileName(item.fileName); return p ? formatPeriod(p) : "-"; })()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(item.importedAt)}</td>
                  <td>{item.totalLines}</td>
                  <td>{item.insertedCount}</td>
                  <td>{item.duplicateCount}</td>
                  <td>{item.errorCount}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "18px", color: "var(--muted)" }}>
                    Nenhuma importação registrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="transactions-filter-grid">
          <label className="transactions-filter-item">
            <span className="meta">De</span>
            <input type="month" value={fromMonth} onChange={(event) => setFromMonth(event.target.value)} />
          </label>
          <label className="transactions-filter-item">
            <span className="meta">Até</span>
            <input type="month" value={toMonth} onChange={(event) => setToMonth(event.target.value)} />
          </label>
          <label className="transactions-filter-item">
            <span className="meta">Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "categorized" | "pending") }>
              <option value="all">Todas</option>
              <option value="categorized">Categorizadas</option>
              <option value="pending">Pendentes</option>
            </select>
          </label>
          <label className="transactions-filter-item">
            <span className="meta">Categoria</span>
            <select
              value={categoryFilterId}
              onChange={(event) => setCategoryFilterId(event.target.value)}
            >
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
                <option key={`filter-${category.id}`} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="transactions-filter-item transactions-filter-item-grow">
            <span className="meta">Busca</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por descrição"
            />
          </label>
          <label className="transactions-filter-item">
            <span className="meta">Ordenação</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as "date-desc" | "date-asc" | "amount-desc" | "amount-asc") }>
              <option value="date-desc">Data (mais recente)</option>
              <option value="date-asc">Data (mais antiga)</option>
              <option value="amount-desc">Valor (maior)</option>
              <option value="amount-asc">Valor (menor)</option>
            </select>
          </label>
          <div className="transactions-filter-actions">
            <button type="button" onClick={refresh}>Atualizar</button>
          </div>
        </div>

        {!isRangeValid ? <p className="error">Intervalo inválido. Ajuste os meses.</p> : null}
        <p>Total de transações no período: {filteredTransactions.length}</p>
        <p>Pendentes de categoria: {uncategorizedCount}</p>
        <p>Selecionadas no filtro atual: {selectedVisibleIds.length}</p>
        {statusMessage ? <p className="success">{statusMessage}</p> : null}
      </div>

      <div className="card">
        <h3>Ações em lote</h3>
        <div className="row transactions-batch-toolbar">
          <button type="button" className="secondary" onClick={generateSuggestions}>Sugerir categorias</button>
          <button type="button" className="secondary" onClick={applySuggestedBatch}>Aplicar categorias</button>
          <button type="button" className="secondary" onClick={clearSelection}>Limpar seleção</button>
        </div>

        <p className="meta">Fluxo sugerido: selecione uma categoria, depois selecione ou filtre as transações e aplique a ação.</p>
        <div className="row transactions-batch-assign">
          <select
            value={bulkCategoryId}
            onChange={(event) => setBulkCategoryId(event.target.value)}
          >
            <option value="">Categoria</option>
            {categories.map((category) => (
              <option key={`bulk-${category.id}`} value={category.id}>{category.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            onClick={selectByBulkCategory}
            disabled={!bulkCategoryId}
          >
            Selecionar na tabela
          </button>
          <button
            type="button"
            className="secondary"
            onClick={filterByBulkCategory}
            disabled={!bulkCategoryId}
          >
            Filtrar para categoria
          </button>
          <button
            type="button"
            onClick={() => categorizeSelected(bulkCategoryId || null)}
            disabled={!bulkCategoryId}
          >
            Adicionar categoria
          </button>
          <button type="button" className="ghost" onClick={() => categorizeSelected(null)}>
            Remover categoria
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                  aria-label="Selecionar todas as transações filtradas"
                />
              </th>
              <th>Data</th>
              <th>Descrição</th>
              <th>Valor</th>
                <th>Categoria</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((transaction) => (
              <tr key={transaction.id} className={transaction.categoryId ? "" : "row-pending"}>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(selectedIds[transaction.id])}
                    onChange={(event) => toggleSelectOne(transaction.id, event.target.checked)}
                    aria-label={`Selecionar transação ${transaction.description}`}
                  />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{transaction.date}</td>
                <td>
                  {transaction.description}
                  {!transaction.categoryId && suggestions[transaction.id] ? (
                    <span className="suggestion-badge">
                      {suggestions[transaction.id].categoryName}
                    </span>
                  ) : null}
                </td>
                <td className={transaction.type === "expense" ? "amount-expense" : "amount-income"}>
                  {formatSignedAmount(transaction.amount, transaction.type)}
                </td>
                <td>
                  <select
                    className="cat-select"
                    value={transaction.categoryId ?? ""}
                    onChange={(e) => applyCategory(transaction.id, e.target.value || null)}
                  >
                    <option value="">— sem categoria —</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>
                  Nenhuma transação encontrada para os filtros selecionados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
