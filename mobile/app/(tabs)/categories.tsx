import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { useFocusEffect } from "expo-router";

import {
  createCategory,
  createCategoryRule,
  listCategories,
  listCategoryRules,
  updateCategoryFixed
} from "@/db/financeRepository";
import { Category, CategoryRule } from "@/types/finance";

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [fixed, setFixed] = useState(false);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [ruleMatcher, setRuleMatcher] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const nextCategories = listCategories();
    setCategories(nextCategories);
    setRules(listCategoryRules());
    const hasSelected = nextCategories.some((category) => category.id === ruleCategoryId);
    if ((!ruleCategoryId || !hasSelected) && nextCategories.length > 0) {
      setRuleCategoryId(nextCategories[0].id);
    }
  }, [ruleCategoryId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function handleCreate() {
    setError(null);
    try {
      createCategory(name, fixed);
      setName("");
      setFixed(false);
      load();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Nao foi possivel criar categoria"
      );
    }
  }

  function handleToggle(categoryId: string, nextValue: boolean) {
    updateCategoryFixed(categoryId, nextValue);
    load();
  }

  function handleCreateRule() {
    if (!ruleCategoryId) {
      setError("Crie uma categoria antes de criar regras.");
      return;
    }

    try {
      createCategoryRule(ruleCategoryId, ruleMatcher, "contains");
      setRuleMatcher("");
      setError(null);
      load();
    } catch (ruleError) {
      setError(ruleError instanceof Error ? ruleError.message : "Nao foi possivel criar regra");
    }
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Categorias</Text>
      <Text style={styles.subtitle}>Crie categorias e marque quais sao gastos fixos.</Text>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>Nova categoria</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ex: Aluguel"
        />

        <View style={styles.rowBetween}>
          <Text>Marcar como gasto fixo</Text>
          <Switch value={fixed} onValueChange={setFixed} />
        </View>

        <Pressable style={styles.button} onPress={handleCreate}>
          <Text style={styles.buttonText}>Adicionar categoria</Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>Categorias cadastradas</Text>

        {categories.length === 0 ? <Text>Nenhuma categoria criada.</Text> : null}

        {categories.map((category) => (
          <View style={styles.categoryRow} key={category.id}>
            <View>
              <Text style={styles.categoryName}>{category.name}</Text>
              <Text style={styles.categoryMeta}>{category.isFixed ? "Fixa" : "Variavel"}</Text>
            </View>
            <Switch
              value={category.isFixed}
              onValueChange={(value) => handleToggle(category.id, value)}
            />
          </View>
        ))}
      </View>

      <View style={styles.listCard}>
        <Text style={styles.sectionTitle}>Regras de sugestao (descricao contem)</Text>
        <TextInput
          style={styles.input}
          value={ruleMatcher}
          onChangeText={setRuleMatcher}
          placeholder="Ex: ifood, uber, escola"
        />

        <Text style={styles.categoryMeta}>Escolha a categoria alvo</Text>
        <View style={styles.chipsWrap}>
          {categories.map((category) => (
            <Pressable
              key={`rule-${category.id}`}
              style={ruleCategoryId === category.id ? styles.chipActive : styles.chip}
              onPress={() => setRuleCategoryId(category.id)}
            >
              <Text style={ruleCategoryId === category.id ? styles.chipActiveText : styles.chipText}>
                {category.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.button} onPress={handleCreateRule}>
          <Text style={styles.buttonText}>Adicionar regra</Text>
        </Pressable>

        {rules.length === 0 ? <Text>Nenhuma regra cadastrada.</Text> : null}
        {rules.map((rule) => (
          <View key={rule.id} style={styles.ruleRow}>
            <Text style={styles.categoryName}>{rule.matcher}</Text>
            <Text style={styles.categoryMeta}>
              Categoria: {categoryById.get(rule.categoryId)?.name ?? "(removida)"}
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
  formCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 10
  },
  listCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 12,
    gap: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700"
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
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
  error: {
    color: "#B91C1C",
    fontWeight: "600"
  },
  categoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 8,
    marginBottom: 8
  },
  categoryName: {
    fontWeight: "600"
  },
  categoryMeta: {
    color: "#475569"
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
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
  chipActive: {
    backgroundColor: "#0F766E",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  chipActiveText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  ruleRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 8,
    marginBottom: 8
  }
});
