import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";

const database=process.env.DATABASE_PATH,base=process.env.BASE_URL||"http://127.0.0.1:5173";
if(!database||!path.isAbsolute(database))throw new Error("DATABASE_PATH muss absolut sein.");
const keyText=process.env.EVENT_ACCESS_CODE_KEY||"",keyBytes=Buffer.from(keyText,"base64");
if(keyBytes.length!==32)throw new Error("EVENT_ACCESS_CODE_KEY muss für den Laufzeittest 32 Byte Base64 enthalten.");
const db=new DatabaseSync(database),now=Date.now(),eventId=`evt_access_test_${randomUUID()}`,otherUserId=`usr_access_test_${randomUUID()}`,ownerToken=randomUUID()+randomUUID(),otherToken=randomUUID()+randomUUID();
const codeFor={helper_attendance:"CHECK2GH",helper_recorder:"HELP2RAB",alarm_operator:"ALARM2CD",event_manager:"MANAG2EF"};
const hash=value=>createHash("sha256").update(value).digest("hex");
const encode=bytes=>Buffer.from(bytes).toString("base64url");
const encrypt=async(code,id,role)=>{const iv=crypto.getRandomValues(new Uint8Array(12)),key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt"]),aad=new TextEncoder().encode(`rescueed-event-code:v1:${id}:${eventId}:${role}`),ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:aad},key,new TextEncoder().encode(code));return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`};
const request=async(url,options={},cookie="")=>fetch(`${base}${url}`,{...options,headers:{origin:base,"content-type":"application/json",...(cookie?{cookie}:{}),...options.headers}});
const login=async code=>{
  const response=await request("/api/auth/event-code",{method:"POST",body:JSON.stringify({code})});
  assert.equal(response.status,200,await response.text());
  return response.headers.get("set-cookie").split(",").find(value=>value.trim().startsWith("rescueed_event_session="))?.trim().split(";")[0];
};

try{
  const owner=db.prepare("SELECT id,organization_id FROM users WHERE status='active' AND account_type='organization' ORDER BY created_at LIMIT 1").get();
  assert.ok(owner,"Für den Laufzeittest wird ein aktives Organisationskonto benötigt.");
  db.prepare("INSERT INTO users (id,organization_id,full_name,email,password_hash,account_type,role,status,mfa_enabled,protected_account,created_at) VALUES (?,?,?,?,?,'organization','customer','active',1,0,?)").run(otherUserId,owner.organization_id,"Anderes Organisationskonto",`access-${randomUUID()}@example.test`,"test-only",now);
  const eventDate=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Berlin"}).format(new Date());
  db.prepare(`INSERT INTO events (id,organization_id,owner_user_id,name,event_date,end_date,start_time,end_time,helper_limit,price_cents,currency,public_join_token_hash,status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(eventId,owner.organization_id,owner.id,"Event-Code Sicherheitstest",eventDate,eventDate,"00:00","23:59",20,0,"EUR",hash(randomUUID()),"active",now);
  const insert=db.prepare("INSERT INTO event_access_codes (id,event_id,role,code_hash,code_encrypted,expires_at,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?,?)");
  for(const [role,code] of Object.entries(codeFor)){const codeId=`eac_${randomUUID()}`;insert.run(codeId,eventId,role,hash(code),await encrypt(code,codeId,role),now+3600000,owner.id,now)}

  db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").run(`ses_${randomUUID()}`,owner.id,hash(ownerToken),now+3600000,now);
  db.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)").run(`ses_${randomUUID()}`,otherUserId,hash(otherToken),now+3600000,now);
  const ownerDetail=await request(`/api/events/${eventId}`,{},`rescueed_session=${ownerToken}`),ownerPayload=await ownerDetail.json();
  assert.equal(ownerDetail.status,200);
  assert.deepEqual(Object.fromEntries(ownerPayload.eventAccessCodes.map(item=>[item.role,item.code])),codeFor);
  const otherDetail=await request(`/api/events/${eventId}`,{},`rescueed_session=${otherToken}`),otherPayload=await otherDetail.json();
  assert.equal(otherDetail.status,200);
  assert.equal(otherPayload.eventAccessCodes,undefined,"Andere Organisationskonten dürfen Event-Codes nicht erhalten.");

  const helperLogin=await request("/api/auth/event-code",{method:"POST",body:JSON.stringify({code:codeFor.helper_attendance})}),helperLoginPayload=await helperLogin.json();
  assert.equal(helperLogin.status,200);
  assert.equal(helperLoginPayload.flow,"helper_attendance");
  assert.equal(helperLoginPayload.eventId,eventId);
  assert.equal(helperLogin.headers.get("set-cookie"),null,"Ein Helferlogin darf keine Bedienersitzung erzeugen.");
  assert.equal((await request(`/api/attendance?eventId=${eventId}&mode=come&code=${codeFor.helper_attendance}`)).status,200);
  for(const suffix of ["Eins","Zwei"]){
   const response=await request("/api/attendance",{method:"POST",body:JSON.stringify({eventId,code:codeFor.helper_attendance,action:"come",firstName:"Code",lastName:suffix,qualification:"SanHelfer"})});
   assert.equal(response.status,201,await response.text());
  }

  const helperCookie=await login(codeFor.helper_recorder);
  assert.ok(helperCookie);
  assert.equal((await request(`/api/events/${eventId}`,{},helperCookie)).status,200);
  assert.equal((await request(`/api/events/${eventId}/helpers`,{method:"POST",body:JSON.stringify({firstName:"Rollen",lastName:"Helfer",qualification:"Test"})},helperCookie)).status,201);
  assert.equal((await request(`/api/events/${eventId}/assignments`,{method:"POST",body:JSON.stringify({name:"Verboten"})},helperCookie)).status,403);
  assert.equal((await request(`/api/events/${eventId}/alerts`,{},helperCookie)).status,403);
  assert.equal((await request(`/api/events/${eventId}/qr?kind=come`,{},helperCookie)).status,403);

  const assignmentId=`asg_${randomUUID()}`;
  db.prepare("INSERT INTO assignments (id,event_id,name,created_at) VALUES (?,?,?,?)").run(assignmentId,eventId,"Alarm-Testmittel",now);
  db.prepare("INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,phone,session_token_hash,registration_source,registered_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(`hlp_${randomUUID()}`,eventId,assignmentId,"Geheime Person","Geheime","Person","NotSan","+49 000",hash(randomUUID()),"qr",now);
  const alarmCookie=await login(codeFor.alarm_operator);
  assert.ok(alarmCookie);
  const secondAlarmCookie=await login(codeFor.alarm_operator);
  assert.ok(secondAlarmCookie);
  assert.notEqual(secondAlarmCookie,alarmCookie,"Ein Bediencode muss getrennte parallele Sitzungen erzeugen.");
  assert.equal((await request(`/api/events/${eventId}`,{},secondAlarmCookie)).status,200);
  const alarmDetail=await request(`/api/events/${eventId}`,{},alarmCookie),alarmPayload=await alarmDetail.json();
  assert.equal(alarmDetail.status,200);
  assert.equal(alarmPayload.helpers,undefined,"Alarmierungsrollen dürfen keine Helferidentitäten erhalten.");
  assert.equal(JSON.stringify(alarmPayload).includes("Geheime Person"),false);
  const alarmUnit=alarmPayload.assignments.find(item=>item.id===assignmentId);
  assert.equal(alarmUnit.activeHelperCount,1);
  assert.equal(alarmUnit.activeQrHelperCount,1);
  assert.equal((await request(`/api/events/${eventId}/helpers`,{method:"POST",body:JSON.stringify({firstName:"Nicht",lastName:"Erlaubt",qualification:"Test"})},alarmCookie)).status,403);
  assert.equal((await request(`/api/events/${eventId}/assignments`,{method:"POST",body:JSON.stringify({name:"Nicht erlaubt"})},alarmCookie)).status,403);
  assert.equal((await request(`/api/events/${eventId}/alerts`,{},alarmCookie)).status,200);
  for(let attempt=0;attempt<12;attempt++)assert.equal((await request(`/api/events/${eventId}/alerts`,{method:"POST",body:JSON.stringify({assignmentIds:[assignmentId],message:`Test ${attempt}`})},alarmCookie)).status,201);
  assert.equal((await request(`/api/events/${eventId}/alerts`,{method:"POST",body:JSON.stringify({assignmentIds:[assignmentId],message:"Zu viel"})},alarmCookie)).status,429,"Alarmierungsrollen müssen nach zwölf Alarmen pro Minute gedrosselt werden.");

  const managerCookie=await login(codeFor.event_manager);
  assert.ok(managerCookie);
  assert.equal((await request(`/api/events/${eventId}/helpers`,{method:"POST",body:JSON.stringify({firstName:"Rollen",lastName:"Manager",qualification:"Test"})},managerCookie)).status,201);
  assert.equal((await request(`/api/events/${eventId}/assignments`,{method:"POST",body:JSON.stringify({name:"Testmittel"})},managerCookie)).status,201);
  assert.equal((await request(`/api/events/${eventId}/qr?kind=come`,{},managerCookie)).status,403);
  assert.equal((await request(`/api/events/${eventId}`,{method:"DELETE",body:"{}"},managerCookie)).status,403);

  const activeHelpers=db.prepare("SELECT count(*) AS n FROM helpers WHERE event_id=? AND removed_at IS NULL").get(eventId).n;
  db.prepare("UPDATE events SET helper_limit=? WHERE id=?").run(activeHelpers,eventId);
  const capacityBlocked=await request("/api/attendance",{method:"POST",body:JSON.stringify({eventId,code:codeFor.helper_attendance,action:"come",firstName:"Zu",lastName:"Viel",qualification:"SanHelfer"})});
  assert.equal(capacityBlocked.status,409,"Der gemeinsame Helferlogin darf das Helferlimit nicht überschreiten.");

  assert.equal((await request("/api/auth/event-code",{method:"POST",body:JSON.stringify({code:"BADCD2EF"})})).status,401);
  process.stdout.write("Event-Code-Rollen und serverseitige Rechteprüfung bestanden.\n");
}finally{
  db.prepare("DELETE FROM events WHERE id=?").run(eventId);
  db.prepare("DELETE FROM sessions WHERE token_hash IN (?,?)").run(hash(ownerToken),hash(otherToken));
  db.prepare("DELETE FROM users WHERE id=?").run(otherUserId);
  db.close();
}
