import { Level2Category } from "@/types/finance";

interface Level2Definition extends Level2Category {
  patterns: string[];
}

const EXPENSE_SUBCATEGORIES: Level2Definition[] = [
  {
    id: "l2-pix-enviado",
    name: "PIX Enviado",
    parentType: "expense",
    color: "#dc2626",
    patterns: ["transferencia enviada pelo pix", "transferência enviada pelo pix"]
  },
  {
    id: "l2-compra-debito",
    name: "Compra no Debito",
    parentType: "expense",
    color: "#f97316",
    patterns: ["compra no debito", "compra no débito"]
  },
  {
    id: "l2-boleto",
    name: "Pagamento de Boleto",
    parentType: "expense",
    color: "#7f1d1d",
    patterns: ["pagamento de boleto efetuado", "pagamento de boleto"]
  },
  {
    id: "l2-fatura-cartao",
    name: "Fatura Cartao",
    parentType: "expense",
    color: "#fb7185",
    patterns: ["pagamento de fatura"]
  },
  {
    id: "l2-aplicacao-investimento",
    name: "Aplicacao Investimento",
    parentType: "expense",
    color: "#be185d",
    patterns: ["aplicacao rdb", "aplicação rdb"]
  },
  {
    id: "l2-outras-saidas",
    name: "Outras Saidas",
    parentType: "expense",
    color: "#fdba74",
    patterns: []
  }
];

const INCOME_SUBCATEGORIES: Level2Definition[] = [
  {
    id: "l2-pix-recebido",
    name: "PIX Recebido",
    parentType: "income",
    color: "#16a34a",
    patterns: [
      "transferencia recebida pelo pix",
      "transferência recebida pelo pix",
      "transferencia recebida",
      "transferência recebida"
    ]
  },
  {
    id: "l2-resgate-investimento",
    name: "Resgate Investimento",
    parentType: "income",
    color: "#064e3b",
    patterns: ["resgate rdb"]
  },
  {
    id: "l2-credito-conta",
    name: "Credito em Conta",
    parentType: "income",
    color: "#84cc16",
    patterns: ["credito em conta", "crédito em conta"]
  },
  {
    id: "l2-estorno",
    name: "Estorno",
    parentType: "income",
    color: "#34d399",
    patterns: ["estorno"]
  },
  {
    id: "l2-outras-entradas",
    name: "Outras Entradas",
    parentType: "income",
    color: "#bbf7d0",
    patterns: []
  }
];

export const ALL_LEVEL2_CATEGORIES: Level2Definition[] = [
  ...EXPENSE_SUBCATEGORIES,
  ...INCOME_SUBCATEGORIES
];

export const LEVEL2_CATEGORY_MAP = new Map<string, Level2Category>(
  ALL_LEVEL2_CATEGORIES.map((item) => [item.id, { id: item.id, name: item.name, parentType: item.parentType, color: item.color }])
);

export function classifyLevel2(description: string, type: "income" | "expense"): string {
  const descLower = description.toLowerCase();
  const pool = type === "expense" ? EXPENSE_SUBCATEGORIES : INCOME_SUBCATEGORIES;

  for (const subcategory of pool) {
    for (const pattern of subcategory.patterns) {
      if (descLower.includes(pattern)) {
        return subcategory.id;
      }
    }
  }

  return type === "expense" ? "l2-outras-saidas" : "l2-outras-entradas";
}
