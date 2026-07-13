import { Transaction } from "@/types/finance";

export interface Level1MonthlyTotal {
  month: string;
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
  previousMonthTotal: number;
  variationPercent: number;
}

const LEVEL1_ENTRADA = { id: "l1-entrada", name: "Entrada", color: "#22c55e" };
const LEVEL1_SAIDA = { id: "l1-saida", name: "Saida", color: "#ef4444" };

export const LEVEL1_CATEGORIES = [LEVEL1_ENTRADA, LEVEL1_SAIDA];

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function aggregateLevel1Totals(
  transactions: Transaction[],
  months: string[]
): Level1MonthlyTotal[] {
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    if (!months.includes(month)) {
      continue;
    }
    const catId = tx.type === "income" ? LEVEL1_ENTRADA.id : LEVEL1_SAIDA.id;
    const key = `${month}|${catId}`;
    totals.set(key, round2((totals.get(key) ?? 0) + Math.abs(tx.amount)));
  }

  const results: Level1MonthlyTotal[] = [];

  for (const cat of LEVEL1_CATEGORIES) {
    for (let i = 0; i < months.length; i += 1) {
      const month = months[i];
      const prevMonth = months[i - 1];

      const total = round2(totals.get(`${month}|${cat.id}`) ?? 0);
      const previousMonthTotal = round2(
        prevMonth ? totals.get(`${prevMonth}|${cat.id}`) ?? 0 : 0
      );

      const variationPercent =
        previousMonthTotal === 0
          ? total > 0
            ? 100
            : 0
          : round2(((total - previousMonthTotal) / previousMonthTotal) * 100);

      results.push({
        month,
        categoryId: cat.id,
        categoryName: cat.name,
        color: cat.color,
        total,
        previousMonthTotal,
        variationPercent
      });
    }
  }

  return results;
}
