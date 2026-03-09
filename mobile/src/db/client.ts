import * as SQLite from "expo-sqlite";

import { INIT_SQL } from "@/db/schema";

const db = SQLite.openDatabaseSync("liteledger.db");

export function initializeDatabase(): void {
  db.execSync(INIT_SQL);
}

export function getDatabase(): SQLite.SQLiteDatabase {
  return db;
}
