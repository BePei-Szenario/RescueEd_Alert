import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const [requestType, outcome, caseReference] = process.argv.slice(2);
if (!["access","erasure","rectification","objection","other"].includes(requestType) ||
    !["completed","partial","denied"].includes(outcome) ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(caseReference || "")) {
  throw new Error("Aufruf: node scripts/record-privacy-request.mjs access|erasure|rectification|objection|other completed|partial|denied ZUFÄLLIGE_FALLREFERENZ (mindestens 16 Zeichen, keine Namen/E-Mail)");
}
const file = process.env.DATABASE_PATH;
if (!file || !path.isAbsolute(file)) throw new Error("DATABASE_PATH muss absolut sein.");
const now = new Date();
const retainUntil = Date.UTC(now.getUTCFullYear() + 4, 0, 1);
const referenceHash = createHash("sha256").update(caseReference).digest("hex");
const id = randomUUID();
const db = new DatabaseSync(file);
try {
  db.exec("PRAGMA busy_timeout=5000");
  db.prepare("INSERT INTO privacy_request_records (id,reference_hash,request_type,outcome,completed_at,retain_until,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, referenceHash, requestType, outcome, now.getTime(), retainUntil, now.getTime());
  process.stdout.write(`Minimaler Erledigungsnachweis ${id} gespeichert; reguläre Löschung ab ${new Date(retainUntil).toISOString().slice(0,10)}.\n`);
} finally { db.close(); }
