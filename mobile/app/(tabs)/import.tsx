import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import { listImportHistory, saveImportedTransactions } from "@/db/financeRepository";
import { parseNubankCsv } from "@/importers/nubankCsvImporter";
import { ImportHistoryItem, ImportResult } from "@/types/finance";

export default function ImportScreen() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);

  const loadHistory = useCallback(() => {
    setHistory(listImportHistory(12));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  async function pickAndParseCsv() {
    setError(null);

    const picked = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values"],
      copyToCacheDirectory: true
    });

    if (picked.canceled || picked.assets.length === 0) {
      return;
    }

    try {
      const file = picked.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.UTF8
      });

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

      setResult(persisted);
      loadHistory();
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Erro ao importar arquivo");
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Importacao mensal</Text>
      <Text style={styles.subtitle}>
        Importe o CSV do mes anterior para iniciar a categorizacao.
      </Text>

      <Pressable style={styles.button} onPress={pickAndParseCsv}>
        <Text style={styles.buttonText}>Selecionar CSV Nubank</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{result.fileName}</Text>
          <Text>Total de linhas: {result.totalLines}</Text>
          <Text>Inseridas: {result.inserted}</Text>
          <Text>Duplicadas: {result.duplicates}</Text>
          <Text>Erros: {result.errors.length}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Historico de importacoes</Text>
        {history.length === 0 ? <Text>Nenhuma importacao registrada.</Text> : null}

        {history.map((item) => (
          <View key={item.id} style={styles.historyRow}>
            <Text style={styles.historyFile}>{item.fileName}</Text>
            <Text style={styles.historyMeta}>{item.importedAt.slice(0, 10)}</Text>
            <Text style={styles.historyMeta}>
              Linhas {item.totalLines} | Inseridas {item.insertedCount} | Dup {item.duplicateCount} | Erros {item.errorCount}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 12
  },
  title: {
    fontSize: 24,
    fontWeight: "700"
  },
  subtitle: {
    color: "#334155"
  },
  button: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignSelf: "flex-start"
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  card: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 4
  },
  cardTitle: {
    fontWeight: "700",
    marginBottom: 4
  },
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 8,
    marginBottom: 8,
    gap: 2
  },
  historyFile: {
    fontWeight: "600"
  },
  historyMeta: {
    color: "#475569"
  },
  error: {
    color: "#B91C1C",
    fontWeight: "600"
  }
});
