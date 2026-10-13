import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {purgeOperationalMail,deleteCompletedSummary} from '../scripts/operational-mail-retention.mjs';

const now=200000000,day=86400000;
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE duty_invitations(id TEXT,used_at INTEGER,expires_at INTEGER);
 CREATE TABLE email_outbox(id TEXT,type TEXT,status TEXT,payload_json TEXT,sensitive_expires_at INTEGER,created_at INTEGER,recipient_email TEXT,subject TEXT);
 INSERT INTO duty_invitations VALUES('expired',NULL,${now}),('active',NULL,${now+1}),('used',1,${now-1});`);
 return db;
}
function mail(db,id,type,status,created=now,expires=null,payload='secret'){
 db.prepare('INSERT INTO email_outbox VALUES(?,?,?,?,?,?,?,?)').run(id,type,status,payload,expires,created,'private@example.test','Private event');
}
test('expired unused invitations and legacy mail are deleted, used and live invitations remain',()=>{
 const db=fixture();
 try{
  mail(db,'legacy','duty_invitation','pending',now-day,now+6*day);
  mail(db,'boundary','duty_invitation','pending',now-1,now);
  mail(db,'live','duty_invitation','pending',now-1,now+1);
  const result=purgeOperationalMail(db,now);
  assert.equal(result.invitationsDeleted,1); assert.equal(result.invitationMailsDeleted,2);
  assert.deepEqual(db.prepare('SELECT id FROM duty_invitations ORDER BY id').all().map(r=>r.id),['active','used']);
  assert.deepEqual(db.prepare('SELECT id FROM email_outbox').all().map(r=>r.id),['live']);
 }finally{db.close()}
});
test('final PDF mail is fully removed on completion, unrelated messages are untouched',()=>{
 const db=fixture();
 try{
  mail(db,'summary','event_deletion_summary','processing'); mail(db,'billing','order_confirmation','sent');
  assert.equal(deleteCompletedSummary(db,{id:'summary',type:'event_deletion_summary'}),true);
  assert.equal(deleteCompletedSummary(db,{id:'billing',type:'order_confirmation'}),false);
  assert.deepEqual(db.prepare('SELECT id FROM email_outbox').all().map(r=>r.id),['billing']);
 }finally{db.close()}
});
test('maintenance removes old sent, failed, scrubbed and expired summaries but preserves pending delivery',()=>{
 const db=fixture();
 try{
  for(const status of ['sent','failed'])mail(db,status,'event_deletion_summary',status);
  mail(db,'scrubbed','event_deletion_summary','pending',now,null,'{}');
  mail(db,'expired','event_deletion_summary','pending',now,now);
  mail(db,'legacy','event_deletion_summary','pending',now-7*day);
  mail(db,'deliver','event_deletion_summary','pending',now,now+day);
  mail(db,'invoice','order_confirmation','sent',0);
  assert.equal(purgeOperationalMail(db,now).summaryMailsDeleted,5);
  assert.deepEqual(db.prepare('SELECT id FROM email_outbox ORDER BY id').all().map(r=>r.id),['deliver','invoice']);
  assert.equal(purgeOperationalMail(db,now).summaryMailsDeleted,0);
 }finally{db.close()}
});
