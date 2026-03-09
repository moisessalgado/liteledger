import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect } from "expo-router";

import {
  assignCategoryToTransactions,
  assignCategoryToTransaction,
  listCategories,
  listTransactionsByMonth,
  suggestCategoriesForMonth
} from "@/db/financeRepository";
import { Category, SuggestedCategory, TransactionListItem } from "@/types/finance";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function TransactionsScreen() {
  const [month, setMonth] = useState(currentMonth());
  const [transactions, setTransactions] = useState<TransactionListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestedCategory>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    setTransactions(listTransactionsByMonth(month));
    setCategories(listCategories());
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function applyCategory(transactionId: string, categoryId: string | null) {
    assignCategoryToTransaction(transactionId, categoryId);
    setSuggestions((current) => {
      const next = { ...current };
      delete next[transactionId];
      return next;
    });
    load();
  }

  function generateSuggestions() {
    const items = suggestCategoriesForMonth(month);
    const indexed: Record<string, SuggestedCategory> = {};
    for (const item of items) {
      indexed[item.transactionId] = item;
    }
    setSuggestions(indexed);
    setStatusMessage(`${items.length} sugestoes geradas.`);
  }

  function applySuggestedBatch() {
    const transactionIds = Object.keys(suggestions);
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
    setStatusMessage(`${applied} sugestoes aplicadas.`);
    load();
  }

  function categorizeAllPending(categoryId: string | null) {
    const pendingIds = transactions.filter((item) => !item.categoryId).map((item) => item.id);
    const updated = assignCategoryToTransactions(pendingIds, categoryId);
    setSuggestions({});
    setStatusMessage(`${updated} transacoes pendentes atualizadas.`);
    load();
  }

  const uncategorizedCount = useMemo(
    () => transactions.filter((item) => !item.categoryId).length,
    [transactions]
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Transacoes</Text>
      <Text style={styles.subtitle}>Revise e categorize as movimentacoes importadas.</Text>

      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}>Mes de referencia (YYYY-MM)</Text>
        <TextInput style={styles.input} value={month} onChangeText={setMonth} />
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Atualizar lista</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text>Total de transacoes: {transactions.length}</Text>
        <Text>Pendentes de categoria: {uncategorizedCount}</Text>
        {statusMessage ? <Text style={styles.meta}>{statusMessage}</Text> : null}
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.description}>Acoes em lote</Text>
        <View style={styles.chipsWrap}>
          <Pressable style={styles.buttonSecondary} onPress={generateSuggestions}>
            <Text style={styles.buttonSecondaryText}>Sugerir categorias</Text>
          </Pressable>
          <Pressable style={styles.buttonSecondary} onPress={applySuggestedBatch}>
            <Text style={styles.buttonSecondaryText}>Aplicar sugestoes</Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>Categorizar todos os pendentes como:</Text>
        <View style={styles.chipsWrap}>
          {categories.map((category) => (
            <Pressable
              key={`batch-${category.id}`}
              style={styles.chip}
              onPress={() => categorizeAllPending(category.id)}
            >
              <Text style={styles.chipText}>{category.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {transactions.length === 0 ? <Text>Nenhuma transacao encontrada para este mes.</Text> : null}

      {transactions.map((transaction) => (
        <View key={transaction.id} style={styles.transactionCard}>
          <Text style={styles.description}>{transaction.description}</Text>
          <Text style={styles.meta}>{transaction.date}</Text>
          <Text style={transaction.type === "expense" ? styles.expense : styles.income}>
            R$ {Math.abs(transaction.amount).toFixed(2)}
          </Text>
          <Text style={styles.meta}>
            Categoria atual: {transaction.categoryName ?? "Nao categorizada"}
          </Text>

          {!transaction.categoryId && suggestions[transaction.id] ? (
            <Text style={styles.suggestionText}>
              Sugestao: {suggestions[transaction.id].categoryName} ({suggestions[transaction.id].reason})
            </Text>
          ) : null}

          <View style={styles.chipsWrap}>
            <Pressable style={styles.clearChip} onPress={() => applyCategory(transaction.id, null)}>
              <Text style={styles.clearChipText}>Limpar</Text>
            </Pressable>
            {categories.map((category) => (
              <Pressable
                key={`${transaction.id}-${category.id}`}
                style={styles.chip}
                onPress={() => applyCategory(transaction.id, category.id)}
              >
                <Text style={styles.chipText}>{category.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
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
  filterCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  filterLabel: {
    color: "#334155"
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
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
    fontWeight: "700"
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 4
  },
  actionsCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  transactionCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 6
  },
  description: {
    fontWeight: "600"
  },
  meta: {
    color: "#475569"
  },
  income: {
    color: "#166534",
    fontWeight: "700"
  },
  expense: {
    color: "#B91C1C",
    fontWeight: "700"
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6
  },
  buttonSecondary: {
    backgroundColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  buttonSecondaryText: {
    color: "#0F172A",
    fontWeight: "600"
  },
  chip: {
    backgroundColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipText: {
    color: "#0F172A"
  },
  clearChip: {
    backgroundColor: "#FEE2E2",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  clearChipText: {
    color: "#7F1D1D"
  },
  suggestionText: {
    color: "#1D4ED8",
    fontWeight: "600"
  }
});
