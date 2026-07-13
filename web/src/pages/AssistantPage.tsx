import { useMemo } from "react";
import { Link } from "react-router-dom";

import {
  listImportHistory,
  listTransactionMonths,
  listTransactionsByMonths
} from "@/db/financeRepository";

export function AssistantPage() {
  const importHistory = useMemo(() => listImportHistory(100), []);
  const months = useMemo(() => listTransactionMonths(), []);
  const transactions = useMemo(() => listTransactionsByMonths(months), [months]);

  const totalImports = importHistory.length;
  const totalTransactions = transactions.length;
  const pendingCount = transactions.filter((t) => !t.categoryId).length;
  const categorizedCount = totalTransactions - pendingCount;
  const categorizationRate =
    totalTransactions > 0 ? Math.round((categorizedCount / totalTransactions) * 100) : 0;

  const hasImports = totalImports > 0;
  const allCategorized = totalTransactions > 0 && pendingCount === 0;

  const steps = [
    {
      key: "import",
      label: "Importar extratos",
      description: hasImports
        ? `${totalImports} arquivo${totalImports === 1 ? "" : "s"} importado${totalImports === 1 ? "" : "s"}, cobrindo ${months.length} m\u00eas${months.length === 1 ? "" : "es"}.`
        : "Nenhum extrato importado ainda. Selecione os CSVs do Nubank.",
      to: "/import",
      done: hasImports
    },
    {
      key: "review",
      label: "Revisar e categorizar",
      description: allCategorized
        ? "Todas as transa\u00e7\u00f5es est\u00e3o categorizadas \u2014 \u00f3timo!"
        : `${pendingCount} transa\u00e7\u00e3o${pendingCount === 1 ? "" : "\u00f5es"} pendente${pendingCount === 1 ? "" : "s"} de categoria.`,
      to: "/transactions",
      done: allCategorized
    },
    {
      key: "categories",
      label: "Ajustar categorias",
      description:
        "Renomeie, crie, defina como fixas ou exclua categorias conforme necess\u00e1rio.",
      to: "/categories",
      done: false
    },
    {
      key: "dashboard",
      label: "Analisar no Dashboard",
      description:
        "Compare gastos por categoria m\u00eas a m\u00eas com gr\u00e1ficos interativos.",
      to: "/dashboard",
      done: false
    }
  ];

  return (
    <section className="page">
      <header>
        <h2>Assistente</h2>
        <p className="meta">
          Vis\u00e3o geral do processo financeiro mensal e atalhos para cada etapa.
        </p>
      </header>

      <div className="assistant-stats">
        <div className="stat-chip">
          <span className="stat-value">{totalImports}</span>
          <span className="stat-label">Importa\u00e7\u00f5es</span>
        </div>
        <div className="stat-chip">
          <span className="stat-value">{months.length}</span>
          <span className="stat-label">Meses cobertos</span>
        </div>
        <div className="stat-chip">
          <span className="stat-value">{totalTransactions}</span>
          <span className="stat-label">Transa\u00e7\u00f5es</span>
        </div>
        <div className="stat-chip">
          <span className="stat-value">{categorizationRate}%</span>
          <span className="stat-label">Categorizadas</span>
        </div>
        <div className="stat-chip">
          <span
            className="stat-value"
            style={{ color: pendingCount > 0 ? "#b91c1c" : "#166534" }}
          >
            {pendingCount}
          </span>
          <span className="stat-label">Pendentes</span>
        </div>
      </div>

      <div className="workflow-steps">
        {steps.map((step, index) => (
          <div key={step.key} className={`workflow-step${step.done ? " step-done" : ""}`}>
            <div className="step-num">{step.done ? "\u2713" : index + 1}</div>
            <div className="step-body">
              <h4>{step.label}</h4>
              <p>{step.description}</p>
              <Link className="step-cta" to={step.to}>
                {step.done ? "Revisar" : "Ir para esta etapa"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
