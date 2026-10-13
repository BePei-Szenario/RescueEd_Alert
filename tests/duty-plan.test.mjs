import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {assertBookingWrite,dutyDate,dutyUsage,DutyPlanConflict} from "../lib/duty-plan.ts";
import {decryptDutyCode,decryptDutyEmail,encryptDutyCode,encryptDutyEmail,generateDutyCode,hashDutyEmail,normalizeDutyCode,normalizeDutyEmail} from "../lib/duty-secret-crypto.ts";

process.env.EVENT_ACCESS_CODE_KEY="11".repeat(32);

test("duty instants support services crossing midnight",()=>{
 const start=dutyDate("2026-10-24T22:00:00+02:00"),end=dutyDate("2026-10-25T06:00:00+01:00");
 assert.ok(start&&end);
 assert.ok(end.getTime()>start.getTime());
});

test("personal duty code is exactly eight numeric digits",()=>{
 for(let index=0;index<25;index++)assert.match(generateDutyCode(),/^\d{8}$/);
 assert.equal(normalizeDutyCode("12 34-5678"),"12345678");
});

test("duty email normalization hashes case-insensitively",async()=>{
 assert.equal(normalizeDutyEmail(" Test@Example.DE "),"test@example.de");
 assert.equal(await hashDutyEmail(" Test@Example.DE "),await hashDutyEmail("test@example.de"));
});

test("duty secrets use authenticated record-bound encryption",async()=>{
 const codeEncrypted=await encryptDutyCode("12345678","booking-1","event-1");
 assert.equal(await decryptDutyCode(codeEncrypted,"booking-1","event-1"),"12345678");
 await assert.rejects(()=>decryptDutyCode(codeEncrypted,"booking-2","event-1"));
 const emailEncrypted=await encryptDutyEmail("Test@Example.DE","booking","booking-1","event-1");
 assert.equal(await decryptDutyEmail(emailEncrypted,"booking","booking-1","event-1"),"test@example.de");
 await assert.rejects(()=>decryptDutyEmail(emailEncrypted,"invitation","booking-1","event-1"));
});

function dutyDatabase(){
 const db=new DatabaseSync(":memory:");
 db.exec(`
  CREATE TABLE events (id TEXT PRIMARY KEY, helper_limit INTEGER NOT NULL);
  CREATE TABLE assignments (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, removed_at INTEGER);
  CREATE TABLE duty_shifts (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, assignment_id TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, capacity INTEGER NOT NULL, reserved INTEGER NOT NULL);
  CREATE TABLE helpers (id TEXT PRIMARY KEY, event_id TEXT NOT NULL, removed_at INTEGER);
  CREATE TABLE duty_bookings (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL, email_hash TEXT NOT NULL, helper_id TEXT);
 `);
 db.prepare("INSERT INTO events VALUES (?,?)").run("event-1",5);
 db.prepare("INSERT INTO assignments VALUES (?,?,NULL)").run("unit-1","event-1");
 return db;
}

test("reserved capacity, free bookings and active unplanned helpers share the event limit",()=>{
 const db=dutyDatabase();
 db.prepare("INSERT INTO duty_shifts VALUES (?,?,?,?,?,?,?)").run("reserved","event-1","unit-1",1,2,2,1);
 db.prepare("INSERT INTO duty_shifts VALUES (?,?,?,?,?,?,?)").run("free","event-1","unit-1",3,4,3,0);
 db.prepare("INSERT INTO duty_bookings VALUES (?,?,?,NULL)").run("booking-free","free","mail-a");
 db.prepare("INSERT INTO duty_bookings VALUES (?,?,?,?)").run("booking-reserved","reserved","mail-b","planned-helper");
 db.prepare("INSERT INTO helpers VALUES (?,?,NULL)").run("planned-helper","event-1");
 db.prepare("INSERT INTO helpers VALUES (?,?,NULL)").run("spontaneous-helper","event-1");
 assert.deepEqual(dutyUsage(db,"event-1"),{limit:5,used:4});
 db.close();
});

test("booking writes reject overlapping services and the shared helper limit",()=>{
 const db=dutyDatabase();
 db.prepare("INSERT INTO duty_shifts VALUES (?,?,?,?,?,?,?)").run("reserved","event-1","unit-1",1,2,3,1);
 db.prepare("INSERT INTO duty_shifts VALUES (?,?,?,?,?,?,?)").run("free-a","event-1","unit-1",10,20,3,0);
 db.prepare("INSERT INTO duty_shifts VALUES (?,?,?,?,?,?,?)").run("free-b","event-1","unit-1",15,25,3,0);
 db.prepare("INSERT INTO duty_bookings VALUES (?,?,?,NULL)").run("existing","free-a","same-mail");
 assert.throws(()=>assertBookingWrite(db,{eventId:"event-1",shiftId:"free-b",emailHash:"same-mail"}),DutyPlanConflict);
 db.prepare("INSERT INTO helpers VALUES (?,?,NULL)").run("spontaneous","event-1");
 assert.throws(()=>assertBookingWrite(db,{eventId:"event-1",shiftId:"free-b",emailHash:"other-mail"}),/Helferlimit/);
 db.close();
});
