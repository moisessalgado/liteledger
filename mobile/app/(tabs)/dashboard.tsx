import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";

import {
  getFixedCategoryEvolution,
  getFixedExpenseTrendByMonth,
  getMonthlyTotals
} from "@/db/financeRepository";
import { MonthlyFixedCategoryTotal, MonthlyTrendItem } from "@/types/finance";

interface Summary {
  income: number;
  expense: number;
  balance: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function previousMonths(anchorMonth: string, count: number): string[] {
  const [yearRaw, monthRaw] = anchorMonth.split("-").map((value) => Number(value));
  const months: string[] = [];
  if (!yearRaw || !monthRaw) {
    return months;
  }

  const cursor = new Date(Date.UTC(yearRaw, monthRaw - 1, 1));
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  return months;
}

export default function DashboardScreen() {
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary>({ income: 0, expense: 0, balance: 0 });
  const [evolution, setEvolution] = useState<MonthlyFixedCategoryTotal[]>([]);
  const [trend, setTrend] = useState<MonthlyTrendItem[]>([]);

  const months = useMemo(() => previousMonths(month, 6), [month]);

  const load = useCallback(() => {
    setSummary(getMonthlyTotals(month));
    setEvolution(getFixedCategoryEvolution(months));
    setTrend(getFixedExpenseTrendByMonth(months));
  }, [month, months]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const currentMonthRows = useMemo(
    () => evolution.filter((item) => item.month === month),
    [evolution, month]
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.subtitle}>Evolucao mes a mes dos gastos fixos por categoria.</Text>

      <View style={styles.filterCard}>
        <Text style={styles.filterLabel}>Mes de referencia (YYYY-MM)</Text>
        <TextInput style={styles.input} value={month} onChangeText={setMonth} />
        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Atualizar dashboard</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Resumo do mes</Text>
        <Text>Receitas: R$ {summary.income.toFixed(2)}</Text>
        <Text>Despesas: R$ {summary.expense.toFixed(2)}</Text>
        <Text style={summary.balance >= 0 ? styles.positive : styles.negative}>
          Saldo: R$ {summary.balance.toFixed(2)}
        </Text>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Gastos fixos por categoria</Text>
        {currentMonthRows.length === 0 ? (
          <Text>Nenhum gasto fixo encontrado neste mes.</Text>
        ) : (
          currentMonthRows.map((item) => (
            <View key={`${item.month}-${item.categoryId}`} style={styles.rowBetween}>
              <View>
                <Text style={styles.categoryName}>{item.categoryName}</Text>
                <Text style={styles.categoryMeta}>
                  Mes anterior: R$ {item.previousMonthTotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.alignEnd}>
                <Text style={styles.categoryValue}>R$ {item.total.toFixed(2)}</Text>
                <Text
                  style={item.variationPercent > 0 ? styles.negative : styles.positive}
                >
                  {item.variationPercent.toFixed(2)}%
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Tendencia (ultimos 6 meses)</Text>
        {trend.length === 0 ? <Text>Sem dados para tendencia.</Text> : null}
        {trend.map((item) => (
          <View key={`trend-${item.month}`} style={styles.trendRow}>
            <Text style={styles.categoryMeta}>{item.month}</Text>
            <View style={styles.trendBarWrap}>
              <View
                style={[
                  styles.trendBar,
                  {
                    width: `${Math.max(
                      8,
                      trend.reduce((max, row) => Math.max(max, row.fixedExpenseTotal), 0) === 0
                        ? 8
                        : (item.fixedExpenseTotal /
                            trend.reduce((max, row) => Math.max(max, row.fixedExpenseTotal), 0)) *
                            100
                    )}%`
                  }
                ]}
              />
            </View>
            <Text style={styles.categoryValue}>R$ {item.fixedExpenseTotal.toFixed(2)}</Text>
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
    fontWeight: "600"
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700"
  },
  positive: {
    color: "#166534",
    fontWeight: "700"
  },
  negative: {
    color: "#B91C1C",
    fontWeight: "700"
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 8,
    marginBottom: 8
  },
  alignEnd: {
    alignItems: "flex-end"
  },
  categoryName: {
    fontWeight: "600"
  },
  categoryMeta: {
    color: "#475569"
  },
  categoryValue: {
    fontWeight: "700"
  },
  trendRow: {
    gap: 6
  },
  trendBarWrap: {
    width: "100%",
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    overflow: "hidden"
  },
  trendBar: {
    height: 8,
    backgroundColor: "#0F766E",
    borderRadius: 999
  }
});
