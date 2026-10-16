import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {additionalAccessRoles, insertMissingEventAccessCode} from "../lib/add-event-access-code.ts";

const now = new Date("2026-10-16T12:00:00").getTime();
function database(t) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  db.exec(`
    CREATE TABLE events(id TEXT PRIMARY KEY, owner_user_id TEXT, organization_id TEXT, status TEXT, event_date TEXT, end_date TEXT, start_time TEXT, end_time TEXT);
    CREATE TABLE event_access_codes(id TEXT PRIMARY KEY, event_id TEXT, role TEXT, code_hash TEXT UNIQUE, code_encrypted TEXT, expires_at INTEGER, created_by_user_id TEXT, created_at INTEGER, revoked_at INTEGER, UNIQUE(event_id,role));
    CREATE TABLE event_access_sessions(id TEXT, token_hash TEXT);
    CREATE TABLE helpers(id TEXT, session_token_hash TEXT, assignment_id TEXT);
    CREATE TABLE helper_devices(id TEXT, helper_id TEXT, disabled_at INTEGER);
    INSERT INTO events VALUES('event','creator','org','active','2026-10-16','2026-10-16','11:00','14:00');
    INSERT INTO event_access_sessions VALUES('session','unchanged');
    INSERT INTO helpers VALUES('helper','unchanged','rtw');
    INSERT INTO helper_devices VALUES('device','helper',NULL);
  `);
  return db;
}
function create(db, overrides = {}, at = now) {
  const role = overrides.role || "helper_attendance";
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = insertMissingEventAccessCode(db, {eventId:"event",userId:"creator",organizationId:"org",role,id:role,hash:`hash-${role}`,encrypted:`encrypted-${role}`,...overrides}, at);
    db.exec("COMMIT"); return result;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
test("all four missing roles can be added during a running event without altering existing data", t => {
  const db = database(t);
  const snapshot = () => ["event_access_sessions","helpers","helper_devices","events"].map(table => db.prepare(`SELECT * FROM ${table}`).all());
  const before = snapshot();
  for (const role of additionalAccessRoles) {
    const codes = db.prepare("SELECT * FROM event_access_codes").all();
    assert.equal(create(db,{role}).status,201);
    for (const code of codes) assert.deepEqual(db.prepare("SELECT * FROM event_access_codes WHERE id=?").get(code.id),code);
  }
  assert.deepEqual(snapshot(),before);
  assert.equal(db.prepare("SELECT count(*) n FROM event_access_codes").get().n,4);
  assert.equal(db.prepare("SELECT expires_at FROM event_access_codes LIMIT 1").get().expires_at,new Date("2026-10-16T14:00:00").getTime());
});
test("repeated requests and revoked existing codes never replace a code", t => {
  const db = database(t); create(db);
  for (const revoked of [null,now]) {
    db.prepare("UPDATE event_access_codes SET revoked_at=?").run(revoked);
    const before=db.prepare("SELECT * FROM event_access_codes").all();
    assert.equal(create(db,{id:"second",hash:"second"}).status,409);
    assert.deepEqual(db.prepare("SELECT * FROM event_access_codes").all(),before);
  }
});
test("only actual creator in correct organization is allowed", t => {
  const db = database(t);
  for (const userId of ["other","organization_member","event_manager",""]) assert.equal(create(db,{userId}).status,403);
  assert.equal(create(db,{organizationId:"other"}).status,403);
  assert.equal(create(db,{eventId:"missing"}).status,404);
  assert.equal(create(db,{role:"platform_owner"}).status,400);
  assert.equal(db.prepare("SELECT count(*) n FROM event_access_codes").get().n,0);
});
test("ended, cancelled and invalid-date events cannot create codes", t => {
  const db = database(t);
  assert.equal(create(db,{},new Date("2026-10-16T14:00:00").getTime()).status,409);
  db.exec("UPDATE events SET status='cancelled'"); assert.equal(create(db).status,409);
  db.exec("UPDATE events SET status='active',end_time=NULL"); assert.equal(create(db).status,409);
  assert.equal(db.prepare("SELECT count(*) n FROM event_access_codes").get().n,0);
});
test("future and legacy overnight events use their event end", t => {
  const db=database(t);
  assert.equal(create(db,{},new Date("2026-10-15T12:00:00").getTime()).status,201);
  db.exec("UPDATE events SET end_date=NULL,start_time='22:00',end_time='02:00'");
  const result=create(db,{role:"alarm_operator"},new Date("2026-10-17T01:00:00").getTime());
  assert.equal(result.status,201); assert.equal(result.expiresAt,new Date("2026-10-17T02:00:00").getTime());
});
