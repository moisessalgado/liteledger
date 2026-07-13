import { useMemo, useState } from "react";

import {
  createCategory,
  createCategoryRule,
  deleteCategoryAndReassign,
  deleteCategoryPermanently,
  deleteCategoryRule,
  exportLevel3Config,
  importCategoryRules,
  importLevel3Config,
  listCategories,
  listCategoryRules,
  moveCategoryRule,
  reorderCategoryRule,
  renameCategory,
  updateCategoryColor
} from "@/db/financeRepository";
import {
  exportCategoryRulesCsv,
  parseCategoryRulesCsv
} from "@/importers/categoryRulesCsv";
import { LEVEL1_CATEGORIES } from "@/services/level1Aggregator";
import { ALL_LEVEL2_CATEGORIES } from "@/services/level2Categories";

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

export function CategoriesPage() {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2B6CB0");
  const [ruleMatcher, setRuleMatcher] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState<string>("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTargetById, setDeleteTargetById] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [draggingRuleId, setDraggingRuleId] = useState<string | null>(null);

  const categories = useMemo(() => listCategories(), [reloadToken]);
  const rules = useMemo(() => listCategoryRules(), [reloadToken]);

  function refresh() {
    setReloadToken((value) => value + 1);
  }

  function handleCreateCategory() {
    setError(null);
    setStatusMessage(null);
    try {
      createCategory(name, color);
      setName("");
      setColor("#2B6CB0");
      setStatusMessage("Categoria adicionada.");
      refresh();
    } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Erro ao criar categoria");
    }
  }

  function handleUpdateColor(categoryId: string, value: string) {
    updateCategoryColor(categoryId, value);
    setStatusMessage("Cor da categoria atualizada.");
    setError(null);
    refresh();
  }

  function beginEdit(categoryId: string, currentName: string) {
    setEditingCategoryId(categoryId);
    setEditingName(currentName);
    setError(null);
    setStatusMessage(null);
  }

  function cancelEdit() {
    setEditingCategoryId(null);
    setEditingName("");
  }

  function handleSaveRename() {
    if (!editingCategoryId) {
      return;
    }

    try {
      renameCategory(editingCategoryId, editingName);
      setStatusMessage("Categoria renomeada.");
      cancelEdit();
      refresh();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Erro ao renomear categoria");
    }
  }

  function handleCreateRule() {
    const selected = ruleCategoryId || categories[0]?.id;
    if (!selected) {
      setError("Crie uma categoria antes de adicionar regra.");
      return;
    }

    try {
      createCategoryRule(selected, ruleMatcher, "contains");
      setRuleMatcher("");
      setRuleCategoryId("");
      setError(null);
      setStatusMessage("Regra criada.");
      refresh();
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Erro ao criar regra");
    }
  }

  function updateDeleteTarget(categoryId: string, targetId: string) {
    setDeleteTargetById((current) => ({
      ...current,
      [categoryId]: targetId
    }));
  }

  function handleMoveRule(ruleId: string, direction: "up" | "down") {
    moveCategoryRule(ruleId, direction);
    setStatusMessage("Ordem das regras atualizada.");
    setError(null);
    refresh();
  }

  function handleDropRule(targetRuleId: string) {
    if (!draggingRuleId || draggingRuleId === targetRuleId) {
      return;
    }

    reorderCategoryRule(draggingRuleId, targetRuleId);
    setDraggingRuleId(null);
    setStatusMessage("Ordem das regras atualizada.");
    setError(null);
    refresh();
  }

  function handleDeleteRule(ruleId: string) {
    const confirmed = window.confirm("Remover esta regra da pilha de sugestão?");
    if (!confirmed) {
      return;
    }

    deleteCategoryRule(ruleId);
    setDraggingRuleId(null);
    setStatusMessage("Regra removida.");
    setError(null);
    refresh();
  }

  function handleDeleteInline(categoryId: string) {
    const targetId = deleteTargetById[categoryId];
    const category = categories.find((c) => c.id === categoryId);
    const categoryName = category?.name ?? categoryId;

    try {
      if (!targetId) {
        const confirmed = window.confirm(
          `Excluir "${categoryName}" permanentemente? As transações associadas ficarão sem categoria.`
        );
        if (!confirmed) return;

        const moved = deleteCategoryPermanently(categoryId);
        setStatusMessage(`Categoria removida. ${moved} transações ficaram sem categoria.`);
      } else {
        const targetName = categories.find((c) => c.id === targetId)?.name ?? targetId;
        const confirmed = window.confirm(
          `Excluir "${categoryName}" e reclassificar transações para "${targetName}"?`
        );
        if (!confirmed) return;

        const moved = deleteCategoryAndReassign(categoryId, targetId);
        setStatusMessage(`Categoria removida. ${moved} transações reatribuídas para "${targetName}".`);
      }

      setError(null);
      setDeleteTargetById((current) => {
        const next = { ...current };
        delete next[categoryId];
        return next;
      });
      refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Erro ao excluir categoria");
    }
  }

  async function handleImportRules(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setError(null);
    setStatusMessage(null);

    try {
      const file = files[0];
      const content = await file.text();
      const parsed = parseCategoryRulesCsv(content);
      const imported = importCategoryRules(parsed.rows);
      const totalErrors = [...parsed.errors, ...imported.errors];

      if (totalErrors.length > 0) {
        setError(
          totalErrors
            .map((item) => `Linha ${item.line}: ${item.reason}`)
            .join(" | ")
        );
      }

      setStatusMessage(
        `${imported.inserted} regra(s) importada(s) do CSV${
          totalErrors.length > 0 ? ` com ${totalErrors.length} erro(s)` : ""
        }.`
      );
      refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Erro ao importar regras");
    }
  }

  function handleExportRules() {
    const csv = exportCategoryRulesCsv(rules, categories);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "liteledger-regras-sugestao.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Regras exportadas em CSV.");
    setError(null);
  }

  function handleExportConfig() {
    const json = exportLevel3Config();
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "liteledger-categorias-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Configuracao exportada (categorias + regras).");
    setError(null);
  }

  async function handleImportConfig(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setError(null);
    setStatusMessage(null);

    try {
      const file = files[0];
      const content = await file.text();
      const result = importLevel3Config(content);

      if (result.errors.length > 0) {
        setError(result.errors.join(" | "));
      }

      setStatusMessage(
        `Importado: ${result.categoriesInserted} categoria(s), ${result.rulesInserted} regra(s)${
          result.errors.length > 0 ? ` com ${result.errors.length} erro(s)` : ""
        }.`
      );
      refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Erro ao importar configuracao");
    }
  }

  const categoryNameById = new Map(categories.map((item) => [item.id, item.name]));

  return (
    <section className="page">
      <header>
        <h2>Categorias</h2>
        <p className="meta">Gerencie categorias e regras para categorizacao automatica.</p>
      </header>

      {/* Levels overview */}
      <div className="card">
        <h3>Niveis de categorizacao</h3>
        <p className="meta" style={{ marginBottom: "8px" }}>
          O sistema classifica transacoes em 3 niveis. Os niveis 1 e 2 sao automaticos,
          o nivel 3 e personalizado por voce.
        </p>
        <table className="tx-table compact-table" style={{ marginBottom: "0" }}>
          <thead>
            <tr>
              <th>Nivel</th>
              <th>Descricao</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1</strong></td>
              <td>Entrada / Saida — baseado no sinal do valor</td>
              <td><span className="meta">Automatico</span></td>
            </tr>
            <tr>
              <td><strong>2</strong></td>
              <td>Subcategorias — baseado no tipo de transacao (PIX, Boleto, Debito, etc.)</td>
              <td><span className="meta">Automatico</span></td>
            </tr>
            <tr>
              <td><strong>3</strong></td>
              <td>Categorias customizadas — definidas e gerenciadas abaixo</td>
              <td><span className="meta">Manual</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Level 1 reference */}
      <div className="card">
        <h3>Nivel 1 — Categorias automaticas</h3>
        <p className="meta">
          Classificacao automatica baseada no sinal do valor da transacao.
        </p>
        <div className="table-wrap">
          <table className="tx-table compact-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Regra de classificacao</th>
              </tr>
            </thead>
            <tbody>
              {LEVEL1_CATEGORIES.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <span
                      className="category-chip-display"
                      style={{
                        background: cat.color,
                        color: getReadableTextColor(cat.color)
                      }}
                    >
                      {cat.name}
                    </span>
                  </td>
                  <td>
                    {cat.id === "l1-entrada"
                      ? "Toda transacao com valor positivo (>= 0) recebe categoria Entrada."
                      : "Toda transacao com valor negativo (< 0) recebe categoria Saida."}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Level 2 reference */}
      <div className="card">
        <h3>Nivel 2 — Subcategorias automaticas</h3>
        <p className="meta">
          Referencia somente leitura das subcategorias atribuidas automaticamente ao importar transacoes.
        </p>
        <div className="table-wrap">
          <table className="tx-table compact-table">
            <thead>
              <tr>
                <th>Subcategoria</th>
                <th>Tipo</th>
                <th>Regra de classificacao</th>
              </tr>
            </thead>
            <tbody>
              {ALL_LEVEL2_CATEGORIES.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <span
                      className="category-chip-display"
                      style={{
                        background: cat.color,
                        color: getReadableTextColor(cat.color)
                      }}
                    >
                      {cat.name}
                    </span>
                  </td>
                  <td>{cat.parentType === "income" ? "Entrada" : "Saida"}</td>
                  <td>
                    {cat.patterns.length > 0
                      ? <span>Toda transacao contendo {cat.patterns.map((p, i) => (<span key={i}>{i > 0 && " ou "}<strong>{p}</strong></span>))} recebe subcategoria <strong>{cat.name}</strong>.</span>
                      : <span className="meta">Fallback: transacoes nao classificadas nas demais subcategorias.</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Level 3 config export/import */}
      <div className="card">
        <h3>Nivel 3 — Configuracao</h3>
        <p className="meta">
          Exporte ou importe suas categorias e regras de nivel 3 em arquivo JSON.
          Ao importar, categorias existentes com mesmo nome sao preservadas e regras sao adicionadas.
        </p>
        <div className="row" style={{ marginTop: "8px" }}>
          <button type="button" className="secondary" onClick={handleExportConfig}>
            Exportar configuracao (JSON)
          </button>
          <label className="file-trigger secondary">
            Importar configuracao (JSON)
            <input
              className="file-input-hidden"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                handleImportConfig(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        {statusMessage ? <p className="success">{statusMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h3>Nivel 3 — Nova categoria</h3>
        <div className="row">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex: Aluguel"
          />
          <label className="row">
            <span className="meta">Cor</span>
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              aria-label="Cor da categoria"
            />
          </label>
          <button type="button" onClick={handleCreateCategory}>Adicionar</button>
        </div>
        {statusMessage ? <p className="success">{statusMessage}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="card">
        <h3>Nivel 3 — Categorias cadastradas</h3>
        <div className="table-wrap">
          <table className="tx-table compact-table categories-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Renomear</th>
                <th>Excluir com reatribuição</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <label
                      className="category-chip-editable"
                      style={{
                        background: category.color,
                        color: getReadableTextColor(category.color)
                      }}
                      title="Clique para alterar a cor da categoria"
                    >
                      <span>{category.name}</span>
                      <input
                        type="color"
                        className="category-color-input"
                        value={category.color}
                        onChange={(event) => handleUpdateColor(category.id, event.target.value)}
                        aria-label={`Cor da categoria ${category.name}`}
                      />
                    </label>
                  </td>
                  <td>
                    {editingCategoryId === category.id ? (
                      <div className="row compact-actions">
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          placeholder="Novo nome"
                        />
                        <button type="button" onClick={handleSaveRename}>Salvar</button>
                        <button type="button" className="secondary" onClick={cancelEdit}>Cancelar</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => beginEdit(category.id, category.name)}
                      >
                        Renomear
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="row compact-actions">
                      <select
                        value={deleteTargetById[category.id] ?? ""}
                        onChange={(event) => updateDeleteTarget(category.id, event.target.value)}
                      >
                        <option value="">Sem categoria</option>
                        {categories
                          .filter((option) => option.id !== category.id)
                          .map((option) => (
                            <option key={`reassign-${category.id}-${option.id}`} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                      </select>
                      <button type="button" className="ghost" onClick={() => handleDeleteInline(category.id)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Nivel 3 — Regras de sugestao</h3>
        <p className="meta">
          Toda transação contendo o texto abaixo deve receber a categoria selecionada.
          A regra mais abaixo na lista tem prioridade (última que combina vence).
        </p>
        <div className="row">
          <span className="meta">Toda transação contendo o texto:</span>
          <input
            value={ruleMatcher}
            onChange={(event) => setRuleMatcher(event.target.value)}
            placeholder="Ex: ifood"
          />
          <span className="meta">deve receber a categoria:</span>
          <select
            value={ruleCategoryId}
            onChange={(event) => setRuleCategoryId(event.target.value)}
          >
            <option value="">Selecione a categoria</option>
            {categories.map((category) => (
              <option key={`rule-cat-${category.id}`} value={category.id}>{category.name}</option>
            ))}
          </select>
          <button type="button" onClick={handleCreateRule}>Adicionar regra</button>
        </div>

        <div className="row" style={{ marginTop: "10px" }}>
          <button type="button" className="secondary" onClick={handleExportRules}>
            Exportar regras em CSV
          </button>
          <label className="file-trigger secondary">
            Importar regras por CSV
            <input
              className="file-input-hidden"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => handleImportRules(event.target.files)}
            />
          </label>
          <span className="meta">Formato: ordem, matcher, tipo, categoria</span>
        </div>

        <div className="list" style={{ marginTop: "12px" }}>
          {rules.map((rule, index) => (
            <article
              key={rule.id}
              className={draggingRuleId === rule.id ? "item rule-item dragging" : "item rule-item"}
              draggable
              onDragStart={() => setDraggingRuleId(rule.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDropRule(rule.id)}
              onDragEnd={() => setDraggingRuleId(null)}
            >
              <div className="rule-row">
                <span className="rule-priority">#{index + 1}</span>
                <p>
                  Toda transação contendo <strong>{rule.matcher}</strong> recebe categoria
                  <strong> {categoryNameById.get(rule.categoryId) ?? "(removida)"}</strong>.
                </p>
              </div>
              <div className="row compact-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleMoveRule(rule.id, "up")}
                  disabled={index === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => handleMoveRule(rule.id, "down")}
                  disabled={index === rules.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
