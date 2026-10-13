import {and,eq,gt,isNull,sql} from "drizzle-orm";
import {getDb,withImmediateTransaction} from "@/db";
import {assignments,dutyBookings,dutyInvitations,dutyShifts,events,organizations} from "@/db/schema";
import {decryptDutyEmail,encryptDutyCode,encryptDutyEmail,generateDutyCode,maskDutyEmail} from "@/lib/duty-secret-crypto";
import {consumeRateLimit,rateLimited,requestNetwork} from "@/lib/rate-limit";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {senderFor} from "@/lib/email-settings";
import {outboxPayloadExpiresAt,sensitiveEmailPayload} from "@/lib/secure-email-payload";
import {id,tokenHash} from "@/lib/security";
import {assertPublicDutySeats,DutyPlanConflict} from "@/lib/duty-plan";

type PreparedBooking={id:string;shiftId:string;code:string;codeHash:string;codeEncrypted:string;emailEncrypted:string};
class BookingConflict extends Error{}

function placeholders(count:number){return Array.from({length:count},()=>"?").join(",")}
function text(value:unknown){return typeof value==="string"?value.trim():""}

export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const {token}=await params;if(!token||token.length>256)return Response.json({error:"Diese Einladung ist ungültig oder abgelaufen."},{status:404,headers:{"cache-control":"no-store"}});
  const networkLimit=await consumeRateLimit({scope:"duty-invitation-read",subject:requestNetwork(request),limit:120,windowMs:10*60_000});if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const hash=await tokenHash(token),now=new Date(),db=getDb();
  const [invitation]=await db.select({id:dutyInvitations.id,eventId:dutyInvitations.eventId,emailEncrypted:dutyInvitations.emailEncrypted,expiresAt:dutyInvitations.expiresAt,eventName:events.name}).from(dutyInvitations).innerJoin(events,eq(events.id,dutyInvitations.eventId)).innerJoin(organizations,eq(organizations.id,events.organizationId)).where(and(eq(dutyInvitations.tokenHash,hash),gt(dutyInvitations.expiresAt,now),isNull(dutyInvitations.usedAt),eq(events.status,"active"),eq(organizations.dutyPlanEnabled,true))).limit(1);
  if(!invitation)return Response.json({error:"Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet."},{status:404,headers:{"cache-control":"no-store"}});
  const rows=await db.select({id:dutyShifts.id,title:dutyShifts.title,startAt:dutyShifts.startAt,endAt:dutyShifts.endAt,capacity:dutyShifts.capacity,reservedCount:dutyShifts.reservedCount,assignmentName:assignments.name,bookingCount:sql<number>`count(${dutyBookings.id})`}).from(dutyShifts).innerJoin(assignments,eq(assignments.id,dutyShifts.assignmentId)).leftJoin(dutyBookings,eq(dutyBookings.shiftId,dutyShifts.id)).where(eq(dutyShifts.eventId,invitation.eventId)).groupBy(dutyShifts.id,assignments.name).orderBy(dutyShifts.startAt);
  const shifts=rows.map(row=>({id:row.id,title:row.title,startAt:row.startAt,endAt:row.endAt,assignmentName:row.assignmentName,remainingCapacity:row.capacity-row.reservedCount-Number(row.bookingCount)})).filter(row=>row.remainingCapacity>0);
  const email=await decryptDutyEmail(invitation.emailEncrypted,"invitation",invitation.id,invitation.eventId);
  return Response.json({event:{id:invitation.eventId,name:invitation.eventName},invitation:{maskedEmail:maskDutyEmail(email),expiresAt:invitation.expiresAt.toISOString()},shifts},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("duty_invitation_read_failed",error);return Response.json({error:"Einladung konnte nicht geladen werden."},{status:500,headers:{"cache-control":"no-store"}})}
}

export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
 try{
  const bad=rejectCrossSiteMutation(request);if(bad)return bad;
  const {token}=await params;if(!token||token.length>256)return Response.json({error:"Diese Einladung ist ungültig oder abgelaufen."},{status:404});
  const network=requestNetwork(request),networkLimit=await consumeRateLimit({scope:"duty-booking-network",subject:network,limit:20,windowMs:10*60_000,blockMs:30*60_000});if(!networkLimit.allowed)return rateLimited(networkLimit.retryAfterSeconds);
  const invitationHash=await tokenHash(token),tokenLimit=await consumeRateLimit({scope:"duty-booking-token",subject:invitationHash,limit:8,windowMs:60*60_000,blockMs:60*60_000});if(!tokenLimit.allowed)return rateLimited(tokenLimit.retryAfterSeconds);
  const body=await request.json() as {firstName?:unknown;lastName?:unknown;qualification?:unknown;shiftIds?:unknown},firstName=text(body.firstName),lastName=text(body.lastName),qualification=text(body.qualification)||null;
  const shiftIds=Array.isArray(body.shiftIds)?[...new Set(body.shiftIds.filter((value):value is string=>typeof value==="string"&&value.length>0&&value.length<=100))]:[];
  if(!firstName||!lastName||!shiftIds.length)return Response.json({error:"Bitte Vorname, Nachname und mindestens einen Dienst angeben."},{status:400});
  if(firstName.length>80||lastName.length>80||(qualification?.length||0)>100||shiftIds.length>20)return Response.json({error:"Eine Eingabe ist zu lang oder es wurden zu viele Dienste gewählt."},{status:400});
  const db=getDb(),[invitation]=await db.select({id:dutyInvitations.id,eventId:dutyInvitations.eventId,emailHash:dutyInvitations.emailHash,emailEncrypted:dutyInvitations.emailEncrypted,expiresAt:dutyInvitations.expiresAt,usedAt:dutyInvitations.usedAt,eventName:events.name,organizationName:organizations.name,customerSignature:organizations.dutyEmailSignature}).from(dutyInvitations).innerJoin(events,eq(events.id,dutyInvitations.eventId)).innerJoin(organizations,eq(organizations.id,events.organizationId)).where(and(eq(dutyInvitations.tokenHash,invitationHash),eq(organizations.dutyPlanEnabled,true),eq(events.status,"active"))).limit(1);
  if(!invitation||invitation.usedAt||invitation.expiresAt.getTime()<=Date.now())return Response.json({error:"Diese Einladung ist ungültig, abgelaufen oder wurde bereits verwendet."},{status:409});
  if(!invitation.customerSignature.trim())return Response.json({error:"Der Veranstalter muss vor der Buchung seine E-Mail-Signatur hinterlegen."},{status:409});
  const email=await decryptDutyEmail(invitation.emailEncrypted,"invitation",invitation.id,invitation.eventId),prepared:PreparedBooking[]=[];
  for(const shiftId of shiftIds){
   const bookingId=id("dbook");let selected:null|{code:string;hash:string;encrypted:string}=null;
   for(let attempt=0;attempt<5&&!selected;attempt++){const code=generateDutyCode(),hash=await tokenHash(code),encrypted=await encryptDutyCode(code,bookingId,invitation.eventId);selected={code,hash,encrypted}}
   if(!selected)throw new Error("Dienstcode konnte nicht erstellt werden.");
   prepared.push({id:bookingId,shiftId,code:selected.code,codeHash:selected.hash,codeEncrypted:selected.encrypted,emailEncrypted:await encryptDutyEmail(email,"booking",bookingId,invitation.eventId)});
  }
  const publicRows=await db.select({id:dutyShifts.id,title:dutyShifts.title,startAt:dutyShifts.startAt,endAt:dutyShifts.endAt,assignmentName:assignments.name}).from(dutyShifts).innerJoin(assignments,eq(assignments.id,dutyShifts.assignmentId)).where(sql`${dutyShifts.id} IN (${sql.join(shiftIds.map(value=>sql`${value}`),sql`,`)})`),infoById=new Map(publicRows.map(row=>[row.id,row]));
  if(publicRows.length!==shiftIds.length)return Response.json({error:"Mindestens ein ausgewählter Dienst ist nicht verfügbar."},{status:409});
  const mailId=id("mail"),nowDate=new Date(),senderEmail=await senderFor("mfa"),duties=prepared.map(item=>{const shift=infoById.get(item.shiftId)!;return {title:shift.title,startAt:shift.startAt.toISOString(),endAt:shift.endAt.toISOString(),assignmentName:shift.assignmentName,code:item.code}}),mailPayload=await sensitiveEmailPayload(request,mailId,"duty_confirmation",JSON.stringify({template:"duty_confirmation",message:`Deine verbindliche Dienstbuchung für ${invitation.eventName} wurde gespeichert.`,organizationName:invitation.organizationName,customerSignature:invitation.customerSignature,duties})),mailExpiresAt=outboxPayloadExpiresAt(nowDate).getTime();
  const reminders=await Promise.all(prepared.map(async item=>{const shift=infoById.get(item.shiftId)!,scheduledAt=shift.startAt.getTime()-24*60*60_000;if(scheduledAt<=nowDate.getTime())return null;const reminderId=id("mail"),duty={title:shift.title,startAt:shift.startAt.toISOString(),endAt:shift.endAt.toISOString(),assignmentName:shift.assignmentName,code:item.code},payload=await sensitiveEmailPayload(request,reminderId,"duty_reminder",JSON.stringify({template:"duty_reminder",message:`Erinnerung an deinen bevorstehenden Dienst bei „${invitation.eventName}“.`,organizationName:invitation.organizationName,customerSignature:invitation.customerSignature,duties:[duty],bookingId:item.id}));return {id:reminderId,bookingId:item.id,payload,scheduledAt,expiresAt:shift.startAt.getTime()}}));
  const now=nowDate.getTime(),created=withImmediateTransaction(connection=>{
   const current=connection.prepare(`SELECT di.id,di.event_id,di.email_hash,di.organizer_note,e.helper_limit FROM duty_invitations di JOIN events e ON e.id=di.event_id JOIN organizations o ON o.id=e.organization_id WHERE di.token_hash=? AND di.used_at IS NULL AND di.expires_at>? AND e.status='active' AND o.duty_plan_enabled=1`).get(invitationHash,now) as {id:string;event_id:string;email_hash:string;organizer_note:string|null;helper_limit:number}|undefined;
   if(!current||current.id!==invitation.id)throw new BookingConflict("Diese Einladung ist abgelaufen oder wurde bereits verwendet.");
   const selectedRows=assertPublicDutySeats(connection,current.event_id,shiftIds);
   for(let left=0;left<selectedRows.length;left++)for(let right=left+1;right<selectedRows.length;right++)if(selectedRows[left].start_at<selectedRows[right].end_at&&selectedRows[right].start_at<selectedRows[left].end_at)throw new BookingConflict("Die ausgewählten Dienste überschneiden sich.");
   const overlap=connection.prepare(`SELECT 1 FROM duty_bookings db JOIN duty_shifts ds ON ds.id=db.shift_id WHERE db.email_hash=? AND ds.event_id=? AND EXISTS (SELECT 1 FROM duty_shifts chosen WHERE chosen.id IN (${placeholders(shiftIds.length)}) AND ds.start_at<chosen.end_at AND chosen.start_at<ds.end_at) LIMIT 1`).get(current.email_hash,current.event_id,...shiftIds);
   if(overlap)throw new BookingConflict("Mindestens ein ausgewählter Dienst überschneidet sich mit einer vorhandenen Buchung.");
   const [{used}]=connection.prepare(`SELECT (SELECT COUNT(*) FROM duty_bookings db JOIN duty_shifts ds ON ds.id=db.shift_id WHERE ds.event_id=?) + (SELECT COALESCE(SUM(reserved_count),0) FROM duty_shifts WHERE event_id=?) + (SELECT COUNT(*) FROM helpers h WHERE h.event_id=? AND h.removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM duty_bookings linked WHERE linked.helper_id=h.id)) AS used`).all(current.event_id,current.event_id,current.event_id) as Array<{used:number}>;
   if(Number(used)+prepared.length>current.helper_limit)throw new BookingConflict("Das Helferlimit des Events ist erreicht.");
   const insert=connection.prepare("INSERT INTO duty_bookings (id,shift_id,invitation_id,first_name,last_name,email_hash,email_encrypted,qualification,organizer_note,code_hash,code_encrypted,helper_id,redeemed_at,reminder_sent_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
   for(const item of prepared){
    const collision=connection.prepare("SELECT 1 FROM duty_bookings WHERE code_hash=? LIMIT 1").get(item.codeHash);if(collision)throw new BookingConflict("Dienstcode konnte nicht eindeutig erstellt werden. Bitte erneut versuchen.");
    insert.run(item.id,item.shiftId,current.id,firstName,lastName,current.email_hash,item.emailEncrypted,qualification,current.organizer_note,item.codeHash,item.codeEncrypted,null,null,null,now);
   }
   const consumed=connection.prepare("UPDATE duty_invitations SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?").run(now,current.id,now);if(Number(consumed.changes)!==1)throw new BookingConflict("Diese Einladung wurde bereits verwendet.");
   connection.prepare("INSERT INTO email_outbox (id,user_id,event_id,type,sender_email,recipient_email,subject,payload_json,sensitive_expires_at,scheduled_at,status,sent_at,created_at) VALUES (?,NULL,?,'duty_confirmation',?,?,?,?,?,NULL,'pending',NULL,?)").run(mailId,current.event_id,senderEmail,email,`RescueEd Alert – Dienstbestätigung ${invitation.eventName}`,mailPayload,mailExpiresAt,now);
   const insertReminder=connection.prepare("INSERT INTO email_outbox (id,user_id,event_id,duty_booking_id,type,sender_email,recipient_email,subject,payload_json,sensitive_expires_at,scheduled_at,status,sent_at,created_at) VALUES (?,NULL,?,?,'duty_reminder',?,?,?,?,?,?,'pending',NULL,?)");for(const reminder of reminders)if(reminder)insertReminder.run(reminder.id,current.event_id,reminder.bookingId,senderEmail,email,`RescueEd Alert – Diensterinnerung ${invitation.eventName}`,reminder.payload,reminder.expiresAt,reminder.scheduledAt,now);
   return selectedRows;
  });
  const shiftsById=new Map(created.map(row=>[row.id,row]));
  return Response.json({bookings:prepared.map(item=>{const shift=infoById.get(item.shiftId);if(!shift||!shiftsById.has(item.shiftId))throw new Error("Gebuchter Dienst fehlt.");return {id:item.id,title:shift.title,startAt:shift.startAt.toISOString(),endAt:shift.endAt.toISOString(),assignmentName:shift.assignmentName,dutyCode:item.code}})},{status:201,headers:{"cache-control":"no-store"}});
 }catch(error){
  if(error instanceof BookingConflict||error instanceof DutyPlanConflict)return Response.json({error:error.message},{status:409,headers:{"cache-control":"no-store"}});
  console.error("duty_booking_failed",error);return Response.json({error:"Dienste konnten nicht verbindlich gebucht werden."},{status:500,headers:{"cache-control":"no-store"}});
 }
}
