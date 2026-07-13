import { Level2Category, Transaction } from "@/types/finance";

export interface Level2MonthlyTotal {
  month: string;
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
  previousMonthTotal: number;
  variationPercent: number;
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function aggregateLevel2Totals(
  transactions: Transaction[],
  level2Categories: Level2Category[],
  months: string[]
): Level2MonthlyTotal[] {
  const totals = new Map<string, number>();

  for (const tx of transactions) {
    const month = tx.date.slice(0, 7);
    if (!months.includes(month)) {
      continue;
    }
    const key = `${month}|${tx.level2CategoryId}`;
    totals.set(key, round2((totals.get(key) ?? 0) + Math.abs(tx.amount)));
  }

  const catMap = new Map(level2Categories.map((c) => [c.id, c]));
  const results: Level2MonthlyTotal[] = [];

  for (const cat of level2Categories) {
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
