import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {checkInPlannedHelper,hasEventDutyPlan} from "../lib/duty-manual-checkin.ts";
import {dutyUsage} from "../lib/duty-plan.ts";

function database(){
 const db=new DatabaseSync(":memory:");
 db.exec(`
 CREATE TABLE events(id TEXT PRIMARY KEY,status TEXT,helper_limit INTEGER);
 CREATE TABLE duty_shifts(id TEXT PRIMARY KEY,event_id TEXT,reserved_count INTEGER);
 CREATE TABLE duty_bookings(id TEXT PRIMARY KEY,shift_id TEXT,first_name TEXT,last_name TEXT,qualification TEXT,helper_id TEXT,redeemed_at INTEGER,code_hash TEXT);
 CREATE TABLE helpers(id TEXT PRIMARY KEY,event_id TEXT,assignment_id TEXT,name TEXT,first_name TEXT,last_name TEXT,qualification TEXT,phone TEXT,session_token_hash TEXT,registration_source TEXT,registered_at INTEGER,removed_at INTEGER);
 INSERT INTO events VALUES('event','active',1),('other','active',10);
 INSERT INTO duty_shifts VALUES('shift','event',0);
 INSERT INTO duty_bookings VALUES('booking','shift','Erika','Muster','SanH',NULL,NULL,'hash');
 `);
 return db;
}
function checkin(db,selector={bookingId:"booking"}){
 db.exec("BEGIN IMMEDIATE");
 try{const result=checkInPlannedHelper(db,{eventId:"event",helperId:"helper",sessionTokenHash:"session",registeredAt:1000,...selector});db.exec("COMMIT");return result}catch(error){db.exec("ROLLBACK");throw error}
}
test("only events with actual shifts use duty check-in",()=>{
 const db=database();assert.equal(hasEventDutyPlan(db,"event"),true);assert.equal(hasEventDutyPlan(db,"other"),false);db.close();
});
for(const selector of [{bookingId:"booking"},{codeHash:"hash"}])test(`manual duty check-in via ${Object.keys(selector)[0]} keeps device code available and does not double-count the limit`,()=>{
 const db=database();assert.equal(checkin(db,selector),"helper");
 const booking=db.prepare("SELECT * FROM duty_bookings").get(),helper=db.prepare("SELECT * FROM helpers").get();
 assert.equal(booking.helper_id,"helper");assert.equal(booking.redeemed_at,null);
 assert.equal(helper.registration_source,"manual");assert.equal(helper.assignment_id,null);assert.equal(helper.registered_at,1000);assert.equal(helper.name,"Erika Muster");
 assert.deepEqual(dutyUsage(db,"event"),{limit:1,used:1});
 assert.throws(()=>checkin(db,selector),/bereits eingebucht/);assert.equal(db.prepare("SELECT COUNT(*) n FROM helpers").get().n,1);db.close();
});
test("wrong event, unknown code and redeemed code cannot create helpers",()=>{
 const db=database();
 assert.throws(()=>checkin(db,{bookingId:"booking",eventId:"other"}),/Kein passender/);
 assert.throws(()=>checkin(db,{codeHash:"wrong"}),/Kein passender/);
 db.exec("UPDATE duty_bookings SET redeemed_at=500");assert.throws(()=>checkin(db),/bereits eingebucht/);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM helpers").get().n,0);db.close();
});
test("inactive events and over-limit plans reject check-in",()=>{
 const db=database();db.exec("UPDATE events SET status='closed' WHERE id='event'");assert.throws(()=>checkin(db),/Kein passender/);
 db.exec("UPDATE events SET status='active',helper_limit=0 WHERE id='event'");assert.throws(()=>checkin(db),/Helferlimit/);assert.equal(db.prepare("SELECT COUNT(*) n FROM helpers").get().n,0);db.close();
});
test("existing attendance is not duplicated",()=>{
 const db=database();db.exec("INSERT INTO helpers(id,event_id,first_name,last_name) VALUES('existing','event','Erika','Muster')");
 assert.throws(()=>checkin(db),/bereits anwesend/);assert.equal(db.prepare("SELECT helper_id FROM duty_bookings").get().helper_id,null);db.close();
});
