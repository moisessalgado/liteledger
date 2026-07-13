import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";

import { initializeDatabase, resetDatabase } from "@/db/client";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { TransactionsPage } from "@/pages/TransactionsPage";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/transactions", label: "Transações" },
  { to: "/categories", label: "Categorias" }
];

export default function App() {
  const [appVersion, setAppVersion] = useState(0);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    initializeDatabase();
  }, []);

  function handleResetDatabase() {
    const confirmed = window.confirm(
      "Atenção: isso vai apagar todas as transações, importações e regras salvas localmente. Deseja continuar?"
    );

    if (!confirmed) {
      return;
    }

    resetDatabase();
    setAppVersion((value) => value + 1);
    setResetMessage("Base local limpa com sucesso.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/favicon-liteledger.png" alt="LiteLedger" className="brand-logo" />
          <div>
            <h1>LiteLedger</h1>
            <p className="brand-subtitle">Gestão financeira pessoal</p>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="danger-btn" onClick={handleResetDatabase}>
            Limpar base de dados
          </button>
          <p className="meta sidebar-warning">A ação remove dados do localStorage.</p>
          {resetMessage ? <p className="success">{resetMessage}</p> : null}
        </div>
      </aside>

      <main className="content" key={appVersion}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
