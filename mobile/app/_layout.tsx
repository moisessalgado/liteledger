import { Stack } from "expo-router";
import { useEffect } from "react";

import { initializeDatabase } from "@/db/client";

export default function RootLayout() {
  useEffect(() => {
    initializeDatabase();
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}
