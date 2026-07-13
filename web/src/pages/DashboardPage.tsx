import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  getCategoryEvolution,
  getLevel1Evolution,
  getLevel2Evolution,
  listCategories,
  listTransactionsByMonths,
  listTransactionMonths
} from "@/db/financeRepository";
import { CategoryLevel } from "@/types/finance";

interface DashboardFilterState {
  fromMonth: string;
  toMonth: string;
  level: CategoryLevel;
}

const DASHBOARD_FILTERS_KEY = "liteledger-web-dashboard-filters-v2";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatAmount(amount: number): string {
  return Math.abs(amount).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCurrency(amount: number): string {
  return `R$ ${formatAmount(amount)}`;
}

function getReadableTextColor(backgroundHex: string): string {
  const hex = backgroundHex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return "#ffffff";
  }

  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1a0d2b" : "#ffffff";
}

function loadStoredDashboardFilters(): DashboardFilterState | null {
  const raw = localStorage.getItem(DASHBOARD_FILTERS_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DashboardFilterState>;
    const valid =
      typeof parsed.fromMonth === "string" &&
      typeof parsed.toMonth === "string" &&
      /^\d{4}-\d{2}$/.test(parsed.fromMonth) &&
      /^\d{4}-\d{2}$/.test(parsed.toMonth);
    if (!valid) {
      return null;
    }

    return {
      fromMonth: parsed.fromMonth as string,
      toMonth: parsed.toMonth as string,
      level: (parsed.level === 1 || parsed.level === 2 || parsed.level === 3) ? parsed.level : 2
    };
  } catch {
    return null;
  }
}

function monthRangeInclusive(fromMonth: string, toMonth: string): string[] {
  const [fromYearRaw, fromMonthRaw] = fromMonth.split("-").map((value) => Number(value));
  const [toYearRaw, toMonthRaw] = toMonth.split("-").map((value) => Number(value));

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
}

interface EvolutionRow {
  month: string;
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
}

const LEVEL_LABELS: Record<CategoryLevel, string> = {
  1: "Nivel 1 — Entrada / Saida",
  2: "Nivel 2 — Subcategorias",
  3: "Nivel 3 — Categorias customizadas"
};

export function DashboardPage() {
  const storedFilters = loadStoredDashboardFilters();
  const [fromMonth, setFromMonth] = useState(storedFilters?.fromMonth ?? currentMonth());
  const [toMonth, setToMonth] = useState(storedFilters?.toMonth ?? currentMonth());
  const [level, setLevel] = useState<CategoryLevel>(storedFilters?.level ?? 2);
  const [reloadToken, setReloadToken] = useState(0);
  const [visibleCategories, setVisibleCategories] = useState<Record<string, boolean>>({});

  // Persist filters
  useEffect(() => {
    const state: DashboardFilterState = { fromMonth, toMonth, level };
    localStorage.setItem(DASHBOARD_FILTERS_KEY, JSON.stringify(state));
  }, [fromMonth, toMonth, level]);

  const isRangeValid = fromMonth <= toMonth;
  const monthsInRange = useMemo(
    () => (isRangeValid ? monthRangeInclusive(fromMonth, toMonth) : []),
    [fromMonth, toMonth, isRangeValid]
  );

  const transactionsInRange = useMemo(
    () => listTransactionsByMonths(monthsInRange),
    [monthsInRange, reloadToken]
  );

  const allCategories = useMemo(() => listCategories(), [reloadToken]);
  const availableMonths = useMemo(() => listTransactionMonths(), [reloadToken]);

  // Auto-correct filters if needed
  useEffect(() => {
    if (availableMonths.length === 0) {
      return;
    }

    const firstMonth = availableMonths[0];
    const lastMonth = availableMonths[availableMonths.length - 1];
    const shouldBootstrap = fromMonth === currentMonth() && toMonth === currentMonth();

    if (
      shouldBootstrap ||
      !availableMonths.includes(fromMonth) ||
      !availableMonths.includes(toMonth) ||
      fromMonth > toMonth
    ) {
      setFromMonth(firstMonth);
      setToMonth(lastMonth);
    }
  }, [availableMonths, fromMonth, toMonth]);

  // Calculate summary for range
  const summary = useMemo(() => {
    const income = transactionsInRange
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = Math.abs(
      transactionsInRange
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0)
    );
    return {
      income: Math.round(income * 100) / 100,
      expense: Math.round(expense * 100) / 100,
      balance: Math.round((income - expense) * 100) / 100
    };
  }, [transactionsInRange]);

  // Get evolution data based on current level
  const evolution: EvolutionRow[] = useMemo(() => {
    if (level === 1) {
      return getLevel1Evolution(monthsInRange);
    }
    if (level === 2) {
      return getLevel2Evolution(monthsInRange);
    }
    // Level 3: existing category evolution
    const categoryById = new Map(allCategories.map((c) => [c.id, c]));
    return getCategoryEvolution(monthsInRange).map((row) => ({
      month: row.month,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      color: categoryById.get(row.categoryId)?.color ?? "#2B6CB0",
      total: row.total
    }));
  }, [level, monthsInRange, reloadToken, allCategories]);

  const chartCategories = useMemo(() => {
    const seen = new Set<string>();
    return evolution
      .filter((row) => {
        if (row.total <= 0 || seen.has(row.categoryId)) {
          return false;
        }
        seen.add(row.categoryId);
        return true;
      })
      .map((row) => ({
        id: row.categoryId,
        name: row.categoryName,
        color: row.color
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [evolution]);

  const categoryColorByName = useMemo(
    () => new Map(chartCategories.map((item) => [item.name, item.color])),
    [chartCategories]
  );

  const visibleChartCategories = useMemo(
    () => chartCategories.filter((cat) => visibleCategories[cat.id] !== false),
    [chartCategories, visibleCategories]
  );

  // Reset visibility when level changes
  useEffect(() => {
    setVisibleCategories({});
  }, [level]);

  // Initialize visibility for all categories
  useEffect(() => {
    const newVisibility: Record<string, boolean> = {};
    for (const cat of chartCategories) {
      if (!(cat.id in visibleCategories)) {
        newVisibility[cat.id] = true;
      }
    }
    if (Object.keys(newVisibility).length > 0) {
      setVisibleCategories((prev) => ({ ...prev, ...newVisibility }));
    }
  }, [chartCategories, visibleCategories]);

  // Build chart rows with only visible categories
  const categoryChartRows = useMemo(() => {
    return monthsInRange.map((monthKey) => {
      const base: Record<string, number | string> = { month: monthKey };
      for (const category of visibleChartCategories) {
        base[category.name] = 0;
      }
      for (const row of evolution.filter((item) => item.month === monthKey)) {
        if (visibleCategories[row.categoryId] !== false) {
          base[row.categoryName] = Number(row.total.toFixed(2));
        }
      }
      return base;
    });
  }, [monthsInRange, visibleChartCategories, evolution, visibleCategories]);

  // Get detail rows for the full selected range
  const detailRows = useMemo(() => {
    const monthsCount = monthsInRange.length || 1;
    const totalsByCategoryId = new Map<string, number>();

    for (const row of evolution) {
      if (visibleCategories[row.categoryId] === false) {
        continue;
      }

      totalsByCategoryId.set(
        row.categoryId,
        Number(((totalsByCategoryId.get(row.categoryId) ?? 0) + row.total).toFixed(2))
      );
    }

    const periodTotal = Array.from(totalsByCategoryId.values()).reduce((sum, value) => sum + value, 0);

    return chartCategories
      .filter((category) => visibleCategories[category.id] !== false)
      .map((category) => {
        const periodCategoryTotal = totalsByCategoryId.get(category.id) ?? 0;
        const averageByMonth = Number((periodCategoryTotal / monthsCount).toFixed(2));
        const sharePercent = periodTotal > 0 ? Number(((periodCategoryTotal / periodTotal) * 100).toFixed(1)) : 0;

        return {
          id: category.id,
          name: category.name,
          color: category.color,
          periodCategoryTotal,
          averageByMonth,
          sharePercent
        };
      })
      .sort((a, b) => b.periodCategoryTotal - a.periodCategoryTotal);
  }, [monthsInRange.length, evolution, chartCategories, visibleCategories]);

  const toggleCategoryVisibility = (categoryId: string) => {
    setVisibleCategories((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const hasLevel3Data = level === 3 && chartCategories.length > 0;
  const showEmptyLevel3 = level === 3 && chartCategories.length === 0 && transactionsInRange.length > 0;

  return (
    <section className="page">
      <header>
        <h2>Dashboard</h2>
        <p className="meta">Analise financeira — compare categorias e acompanhe tendencias.</p>
      </header>

      <div className="card">
        <h3>Periodo de analise</h3>
        <div className="row">
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ marginBottom: 0 }}>De:</label>
            <input
              type="month"
              value={fromMonth}
              onChange={(event) => setFromMonth(event.target.value)}
              style={{ flex: 1, maxWidth: "150px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <label style={{ marginBottom: 0 }}>Ate:</label>
            <input
              type="month"
              value={toMonth}
              onChange={(event) => setToMonth(event.target.value)}
              style={{ flex: 1, maxWidth: "150px" }}
            />
          </div>
          <button type="button" onClick={() => setReloadToken((value) => value + 1)}>
            Atualizar
          </button>
        </div>
      </div>

      {/* Level selector */}
      <div className="card">
        <h3>Nivel de visualizacao</h3>
        <p className="meta">
          Niveis 1 e 2 sao classificados automaticamente ao importar transacoes. O nivel 3 usa categorias e regras personalizadas.
        </p>
        <div style={{ display: "flex", gap: "4px", marginTop: "8px" }}>
          {([1, 2, 3] as CategoryLevel[]).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevel(lvl)}
              style={{
                padding: "10px 16px",
                borderRadius: "6px",
                border: level === lvl ? "2px solid var(--accent)" : "2px solid var(--line)",
                background: level === lvl ? "var(--accent)" : "transparent",
                color: level === lvl ? "#fff" : "var(--text)",
                cursor: "pointer",
                fontWeight: level === lvl ? 700 : 400,
                fontSize: "13px",
                transition: "all 0.15s"
              }}
            >
              {LEVEL_LABELS[lvl]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Resumo de {fromMonth} ate {toMonth}</h3>
        <div className="kpi-grid">
          <div className="kpi-card kpi-income">
            <span className="kpi-label">Receitas</span>
            <span className="kpi-value">{formatCurrency(summary.income)}</span>
          </div>
          <div className="kpi-card kpi-expense">
            <span className="kpi-label">Despesas</span>
            <span className="kpi-value">{formatCurrency(summary.expense)}</span>
          </div>
          <div className="kpi-card kpi-balance">
            <span className="kpi-label">Saldo</span>
            <span className="kpi-value" style={{ color: summary.balance >= 0 ? "#166534" : "#b91c1c" }}>
              {formatCurrency(summary.balance)}
            </span>
          </div>
        </div>
      </div>

      {showEmptyLevel3 && (
        <div className="card">
          <h3>Nivel 3 — Categorias customizadas</h3>
          <p className="meta">
            Nenhuma transacao foi categorizada com categorias customizadas neste periodo.
            Acesse a pagina de <Link to="/categories">Categorias</Link> para configurar categorias e regras,
            depois aplique sugestoes na pagina de <Link to="/transactions">Transacoes</Link>.
          </p>
        </div>
      )}

      {(level !== 3 || hasLevel3Data) && (
        <>
          <div className="card">
            <h3>{level === 1 ? "Entrada vs Saida" : level === 2 ? "Subcategorias automaticas" : "Gastos por categoria"}</h3>
            <p className="meta">
              Clique nas categorias abaixo para mostrar ou ocultar do grafico.
            </p>

            {/* Category toggles */}
            <div className="category-toggles" style={{ marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {chartCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategoryVisibility(category.id)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: `2px solid ${category.color}`,
                    background: visibleCategories[category.id] !== false ? category.color : "transparent",
                    color: visibleCategories[category.id] !== false
                      ? getReadableTextColor(category.color)
                      : category.color,
                    cursor: "pointer",
                    fontWeight: 500,
                    fontSize: "13px",
                    transition: "all 0.15s"
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>

            <div className="chart-container">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={categoryChartRows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) => formatAmount(v)}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: number, categoryName: string, payload: { color?: string }) => [
                      <span style={{ color: payload?.color ?? "var(--text)", fontWeight: 700 }}>
                        {formatCurrency(value)}
                      </span>,
                      categoryName
                    ]}
                    labelFormatter={(label: string) => `Mes: ${label}`}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "16px" }}
                    formatter={(value: string) => (
                      <span style={{ color: categoryColorByName.get(value) ?? "var(--text)", fontWeight: 600 }}>
                        {value}
                      </span>
                    )}
                  />
                  {chartCategories
                    .filter((cat) => visibleCategories[cat.id] !== false)
                    .map((category) => (
                      <Bar
                        key={category.id}
                        dataKey={category.name}
                        stackId="category-total"
                        fill={category.color}
                        radius={[4, 4, 0, 0]}
                        name={category.name}
                      />
                    ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3>Tendencia</h3>
            <p className="meta">Evolucao mensal considerando as categorias selecionadas acima.</p>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={categoryChartRows} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: number) => formatAmount(v)}
                    width={60}
                  />
                  <Tooltip
                    formatter={(value: number, categoryName: string, payload: { color?: string }) => [
                      <span style={{ color: payload?.color ?? "var(--text)", fontWeight: 700 }}>
                        {formatCurrency(value)}
                      </span>,
                      categoryName
                    ]}
                    labelFormatter={(label: string) => `Mes: ${label}`}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: "16px" }}
                    formatter={(value: string) => (
                      <span style={{ color: categoryColorByName.get(value) ?? "var(--text)", fontWeight: 600 }}>
                        {value}
                      </span>
                    )}
                  />
                  {visibleChartCategories.map((category) => (
                    <Area
                      key={`trend-${category.id}`}
                      type="monotone"
                      dataKey={category.name}
                      stroke={category.color}
                      fill={category.color}
                      fillOpacity={0.14}
                      strokeWidth={2}
                      name={category.name}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {detailRows.length > 0 && (
            <div className="card">
              <h3>Detalhe — {fromMonth} ate {toMonth}</h3>
              <div className="table-wrap">
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Categoria</th>
                      <th>Total no periodo</th>
                      <th>Media mensal</th>
                      <th>Participacao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((item) => (
                      <tr key={`detail-${item.id}`}>
                        <td>
                          <span
                            className="category-chip-display"
                            style={{
                              background: item.color,
                              color: getReadableTextColor(item.color)
                            }}
                          >
                            {item.name}
                          </span>
                        </td>
                        <td>{formatCurrency(item.periodCategoryTotal)}</td>
                        <td>{formatCurrency(item.averageByMonth)}</td>
                        <td style={{ fontWeight: 600 }}>{item.sharePercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="card">
        <h3>Proximos passos</h3>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <p className="meta">Revise pendencias em transacoes e mantenha as regras de categorizacao atualizadas.</p>
          <div className="row">
            <Link className="cta-link" to="/transactions">
              Abrir transacoes
            </Link>
            <Link className="cta-link secondary" to="/categories">
              Abrir categorias
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
