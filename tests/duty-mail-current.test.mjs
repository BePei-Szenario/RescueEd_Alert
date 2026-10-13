import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import {currentDutyMail} from "../scripts/duty-mail-current.mjs";

const hash=value=>createHash("sha256").update(value).digest("hex");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("CREATE TABLE duty_shifts(id TEXT,event_id TEXT); CREATE TABLE duty_bookings(id TEXT,shift_id TEXT,code_hash TEXT,email_hash TEXT); INSERT INTO duty_shifts VALUES('s1','event-1'),('s2','event-2');");
 for(const [id,code] of [["b1","12345678"],["b2","87654321"]])db.prepare("INSERT INTO duty_bookings VALUES(?,?,?,?)").run(id,"s1",hash(code),hash("person@example.test"));
 return db;
}
const row={type:"duty_confirmation",event_id:"event-1",recipient_email:"Person@Example.Test",duty_booking_id:null};
const payload={template:"duty_confirmation",duties:[{code:"12345678"},{code:"87654321"}]};
test("legacy bundled confirmation excludes removed or changed recipients",()=>{
 const db=fixture();
 try{
  assert.equal(currentDutyMail(db,row,payload).duties.length,2);
  db.prepare("UPDATE duty_bookings SET email_hash=? WHERE id='b1'").run("no-email:b1");
  assert.deepEqual(currentDutyMail(db,row,payload).duties,[{code:"87654321"}]);
  db.prepare("UPDATE duty_bookings SET email_hash=? WHERE id='b2'").run(hash("new@example.test"));
  assert.equal(currentDutyMail(db,row,payload),null);
 }finally{db.close()}
});
test("linked reminder checks booking, event and current code",()=>{
 const db=fixture();
 try{
  const reminder={...row,type:"duty_reminder",duty_booking_id:"b1"};
  assert.deepEqual(currentDutyMail(db,reminder,payload).duties,[{code:"12345678"}]);
  assert.equal(currentDutyMail(db,{...reminder,event_id:"event-2"},payload),null);
  db.prepare("UPDATE duty_bookings SET code_hash=? WHERE id='b1'").run(hash("11223344"));
  assert.equal(currentDutyMail(db,reminder,payload),null);
  db.exec("DELETE FROM duty_bookings");
  assert.equal(currentDutyMail(db,row,payload),null);
 }finally{db.close()}
});
test("unrelated mail and cancellation notices retain their payload",()=>{
 const db=fixture();
 try{for(const type of ["security_code","duty_cancellation"])assert.equal(currentDutyMail(db,{...row,type},payload),payload)}finally{db.close()}
});
test("invitation mail requires a current unused invitation for the same event and recipient",()=>{
 const db=fixture(),token="ab".repeat(32),data={invitationUrl:`https://localhost:3000/dienstplan/${token}`},mail={...row,type:"duty_invitation"};
 try{
  db.exec("CREATE TABLE duty_invitations(id TEXT,event_id TEXT,token_hash TEXT,used_at INTEGER,expires_at INTEGER,email_hash TEXT)");
  db.prepare("INSERT INTO duty_invitations VALUES('i','event-1',?,NULL,?,?)").run(hash(token),Date.now()+60000,hash("person@example.test"));
  assert.equal(currentDutyMail(db,mail,data),data);
  assert.equal(currentDutyMail(db,{...mail,event_id:"event-2"},data),null);
  assert.equal(currentDutyMail(db,{...mail,recipient_email:"other@example.test"},data),null);
  db.exec("UPDATE duty_invitations SET used_at=1"); assert.equal(currentDutyMail(db,mail,data),null);
  db.exec("UPDATE duty_invitations SET used_at=NULL,expires_at=1"); assert.equal(currentDutyMail(db,mail,data),null);
  db.exec("DELETE FROM duty_invitations"); assert.equal(currentDutyMail(db,mail,data),null);
 }finally{db.close()}
});
