import * as SQLite from "expo-sqlite";
import { INIT_SQL } from "@/db/schema";
import { Platform } from "react-native";

let db: SQLite.SQLiteDatabase | undefined;

export function initializeDatabase(): void {
  if (Platform.OS === "web") {
    return;
  }

  getDatabase();
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (Platform.OS === "web") {
    throw new Error("expo-sqlite is not supported on web. Use a native device or emulator.");
  }

  if (!db) {
    db = SQLite.openDatabaseSync("liteledger.db");
    db.execSync(INIT_SQL);
  }

  return db;
}
