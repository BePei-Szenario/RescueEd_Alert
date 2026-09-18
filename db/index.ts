import "server-only";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

const state = globalThis as typeof globalThis & {
  rescueEdSqlite?: DatabaseSync;
  rescueEdDb?: ReturnType<typeof createDb>;
};

function sqlite() {
  if (state.rescueEdSqlite) return state.rescueEdSqlite;
  const file = process.env.DATABASE_PATH;
  if (!file || !path.isAbsolute(file)) throw new Error("DATABASE_PATH muss ein absoluter Pfad zu einer persistenten SQLite-Datei sein.");
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const connection = new DatabaseSync(file);
  if (process.platform !== "win32") chmodSync(file, 0o600);
  connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  state.rescueEdSqlite = connection;
  return connection;
}

type Query = { sql: string; params: unknown[]; method: string };

function execute(query: Query) {
  const statement = sqlite().prepare(query.sql);
  statement.setReturnArrays(true);
  const params = query.params as Array<string | number | bigint | null | Uint8Array>;
  if (query.method === "run") {
    const result = statement.run(...params);
    return { rows: [], changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }
  if (query.method === "get") return { rows: statement.get(...params) as unknown[] | undefined ?? [] };
  return { rows: statement.all(...params) };
}

function createDb() {
  return drizzle(
    async (sql, params, method) => execute({ sql, params, method }),
    async (queries) => {
      const connection = sqlite();
      connection.exec("BEGIN IMMEDIATE");
      try {
        const results = queries.map(execute);
        connection.exec("COMMIT");
        return results;
      } catch (error) {
        connection.exec("ROLLBACK");
        throw error;
      }
    },
    { schema },
  );
}

export function getDb() {
  state.rescueEdDb ??= createDb();
  return state.rescueEdDb;
}
