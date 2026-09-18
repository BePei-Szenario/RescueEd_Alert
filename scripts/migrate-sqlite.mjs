import { createHash } from "node:crypto";
import { chmodSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("../", import.meta.url));
const file = process.env.DATABASE_PATH;
if (!file || !path.isAbsolute(file)) throw new Error("DATABASE_PATH muss ein absoluter Dateipfad sein.");
mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(file);
if (process.platform !== "win32") chmodSync(file, 0o600);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
db.exec("CREATE TABLE IF NOT EXISTS _rescueed_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)");
const migrations = readdirSync(path.join(root, "drizzle")).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
for (const name of migrations) {
  const contents = readFileSync(path.join(root, "drizzle", name), "utf8");
  const hash = createHash("sha256").update(contents).digest("hex");
  const applied = db.prepare("SELECT sha256 FROM _rescueed_migrations WHERE name = ?").get(name);
  if (applied) {
    if (applied.sha256 !== hash) throw new Error(`Bereits angewendete Migration geändert: ${name}`);
    continue;
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(contents);
    db.prepare("INSERT INTO _rescueed_migrations (name, sha256, applied_at) VALUES (?, ?, ?)").run(name, hash, new Date().toISOString());
    db.exec("COMMIT");
    process.stdout.write(`Migration angewendet: ${name}\n`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
db.close();
