import { useMemo, useState } from "react";

import { listImportHistory, saveImportedTransactions } from "@/db/financeRepository";
import { parseNubankCsv } from "@/importers/nubankCsvImporter";
import { ImportResult } from "@/types/finance";

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString("pt-BR");
}

interface BatchImportSummary {
  filesProcessed: number;
  totalLines: number;
  inserted: number;
  duplicates: number;
  errors: number;
}

export function ImportPage() {
  const [results, setResults] = useState<ImportResult[]>([]);
  const [batchSummary, setBatchSummary] = useState<BatchImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const history = useMemo(() => listImportHistory(20), [reloadToken]);

  async function handleFileChange(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    setIsImporting(true);
    setError(null);
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
        const parsed = parseNubankCsv({
          fileName: file.name,
          content
        });

        const persisted = saveImportedTransactions(
          parsed.importResult.fileName,
          parsed.transactions,
          parsed.importResult.errors,
          parsed.importResult.totalLines
        );

        processed += 1;
        totalLines += persisted.totalLines;
        inserted += persisted.inserted;
        duplicates += persisted.duplicates;
        errors += persisted.errors.length;
        nextResults.push(persisted);
      } catch (parseError) {
        processed += 1;
        errors += 1;
        setError(
          parseError instanceof Error
            ? `Falha ao importar ${file.name}: ${parseError.message}`
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
    setReloadToken((value) => value + 1);
  }

  return (
    <section className="page">
      <header>
        <h2>Importação mensal</h2>
        <p className="meta">Selecione um ou mais CSVs do Nubank para importar as transações.</p>
      </header>

      <div className="card">
        <div className="row">
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            onChange={(event) => handleFileChange(event.target.files)}
          />
          {isImporting ? <p className="meta">Importando arquivos…</p> : null}
        </div>
        {error ? <p className="error">{error}</p> : null}
      </div>

      {batchSummary ? (
        <div className="card">
          <h3>Resumo do lote</h3>
          <p><strong>Arquivos processados:</strong> {batchSummary.filesProcessed}</p>
          <p><strong>Total de linhas:</strong> {batchSummary.totalLines}</p>
          <p><strong>Inseridas:</strong> {batchSummary.inserted}</p>
          <p><strong>Duplicadas:</strong> {batchSummary.duplicates}</p>
          <p><strong>Erros:</strong> {batchSummary.errors}</p>
          {batchSummary.inserted > 0 ? (
            <p className="success">{batchSummary.inserted} transações importadas com sucesso.</p>
          ) : null}
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="card">
          <h3>Resultado por arquivo</h3>
          <div className="list">
            {results.map((item) => (
              <article key={`${item.fileName}-${item.totalLines}`} className="item">
                <strong>{item.fileName}</strong>
                <p className="meta">
                  Linhas {item.totalLines} | Inseridas {item.inserted} | Dup {item.duplicates} | Erros {item.errors.length}
                </p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3>Histórico de importações</h3>
        {history.length === 0 ? <p>Nenhuma importação registrada.</p> : null}
        <div className="list">
          {history.map((item) => (
            <article key={item.id} className="item">
              <strong>{item.fileName}</strong>
              <p className="meta">{formatDateTime(item.importedAt)}</p>
              <p className="meta">
                Linhas {item.totalLines} | Inseridas {item.insertedCount} | Dup {item.duplicateCount} | Erros {item.errorCount}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
