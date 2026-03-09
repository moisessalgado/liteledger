import { Category, MonthlyFixedCategoryTotal, Transaction } from "@/types/finance";

export function aggregateFixedCategoryTotals(
  transactions: Transaction[],
  categories: Category[],
  months: string[]
): MonthlyFixedCategoryTotal[] {
  const fixedCategories = categories.filter((category) => category.isFixed);
  const totalsByMonthAndCategory = new Map<string, number>();

  for (const transaction of transactions) {
    if (!transaction.categoryId || transaction.type !== "expense") {
      continue;
    }

    const month = transaction.date.slice(0, 7);
    if (!months.includes(month)) {
      continue;
    }

    const key = `${month}|${transaction.categoryId}`;
    const previous = totalsByMonthAndCategory.get(key) ?? 0;
    totalsByMonthAndCategory.set(key, previous + Math.abs(transaction.amount));
  }

  const results: MonthlyFixedCategoryTotal[] = [];

  for (const category of fixedCategories) {
    for (let index = 0; index < months.length; index += 1) {
      const month = months[index];
      const previousMonth = months[index - 1];

      const currentKey = `${month}|${category.id}`;
      const previousKey = previousMonth ? `${previousMonth}|${category.id}` : "";

      const total = roundCurrency(totalsByMonthAndCategory.get(currentKey) ?? 0);
      const previousMonthTotal = roundCurrency(
        previousKey ? totalsByMonthAndCategory.get(previousKey) ?? 0 : 0
      );

      const variationPercent =
        previousMonthTotal === 0
          ? total > 0
            ? 100
            : 0
          : roundCurrency(((total - previousMonthTotal) / previousMonthTotal) * 100);

      results.push({
        month,
        categoryId: category.id,
        categoryName: category.name,
        total,
        previousMonthTotal,
        variationPercent
      });
    }
  }

  return results;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}
