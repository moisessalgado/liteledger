import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: "center"
      }}
    >
      <Tabs.Screen name="import" options={{ title: "Importar" }} />
      <Tabs.Screen name="transactions" options={{ title: "Transacoes" }} />
      <Tabs.Screen name="categories" options={{ title: "Categorias" }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="MonthlyAssistantScreen" options={{ title: "Assistente" }} />
    </Tabs>
  );
}
