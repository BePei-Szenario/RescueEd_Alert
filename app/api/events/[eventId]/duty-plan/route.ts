import {and,asc,eq,isNotNull,isNull} from "drizzle-orm";
import {getDb,withImmediateTransaction} from "@/db";
import {assignments,dutyBookings,dutyInvitations,dutyShifts,helperDevices,helpers,organizations} from "@/db/schema";
import {decryptDutyCode,decryptDutyEmail,maskDutyEmail} from "@/lib/duty-secret-crypto";
import {assertShiftWrite,cleanDutyText,dutyDate,DutyPlanConflict} from "@/lib/duty-plan";
import {eventAuthenticated,ownedEvent} from "@/lib/event-access";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {id} from "@/lib/security";

async function context(eventId:string){
 const authorization=await ownedEvent(eventId),db=getDb();
 if(!eventAuthenticated(authorization))return {error:Response.json({error:"Bitte zuerst anmelden."},{status:401})} as const;
 if(!authorization.event)return {error:Response.json({error:"Event nicht gefunden."},{status:404})} as const;
 if(!authorization.user||!authorization.permissions?.manageAssignments)return {error:Response.json({error:"Dieser Zugang darf den Dienstplan nicht verwalten."},{status:403})} as const;
 const [organization]=await db.select({name:organizations.name,dutyPlanEnabled:organizations.dutyPlanEnabled,dutyEmailSignature:organizations.dutyEmailSignature}).from(organizations).where(eq(organizations.id,authorization.event.organizationId)).limit(1);
 return {authorization,organization,db} as const;
}

export async function GET(_request:Request,{params}:{params:Promise<{eventId:string}>}){
 try{
  const {eventId}=await params,result=await context(eventId);if("error" in result)return result.error;
  const {authorization,organization,db}=result,event=authorization.event!,owner=authorization.user!.id===event.ownerUserId;
  if(!organization?.dutyPlanEnabled)return Response.json({enabled:false,signature:organization?.dutyEmailSignature??"",assignments:[],shifts:[],invitations:[]},{headers:{"cache-control":"no-store"}});
  const [shiftRows,bookingRows,invitationRows,assignmentRows,deviceRows]=await Promise.all([
   db.select({id:dutyShifts.id,title:dutyShifts.title,startAt:dutyShifts.startAt,endAt:dutyShifts.endAt,capacity:dutyShifts.capacity,reservedCount:dutyShifts.reservedCount,assignmentId:assignments.id,assignmentName:assignments.name}).from(dutyShifts).innerJoin(assignments,eq(assignments.id,dutyShifts.assignmentId)).where(eq(dutyShifts.eventId,event.id)).orderBy(asc(dutyShifts.startAt),asc(dutyShifts.title)),
   db.select().from(dutyBookings).innerJoin(dutyShifts,eq(dutyShifts.id,dutyBookings.shiftId)).where(eq(dutyShifts.eventId,event.id)).orderBy(asc(dutyBookings.createdAt)),
   db.select().from(dutyInvitations).where(eq(dutyInvitations.eventId,event.id)).orderBy(asc(dutyInvitations.createdAt)),
   db.select({id:assignments.id,name:assignments.name}).from(assignments).where(and(eq(assignments.eventId,event.id),isNull(assignments.removedAt))).orderBy(asc(assignments.name)),
   db.select({helperId:helperDevices.helperId}).from(helperDevices).innerJoin(helpers,eq(helpers.id,helperDevices.helperId)).where(and(eq(helpers.eventId,event.id),isNull(helpers.removedAt),isNull(helperDevices.disabledAt),isNotNull(helperDevices.pushTokenEncrypted)))
  ]);
  const connectedHelperIds=new Set(deviceRows.map(row=>row.helperId));
  const bookingsByShift=new Map<string,unknown[]>();
  for(const joined of bookingRows){const row=joined.duty_bookings;let email:string|null=null,maskedEmail:string|null=null,code:string|null=null;try{const decrypted=await decryptDutyEmail(row.emailEncrypted,"booking",row.id,event.id);maskedEmail=maskDutyEmail(decrypted);email=owner?decrypted:maskedEmail;if(owner)code=await decryptDutyCode(row.codeEncrypted,row.id,event.id)}catch(error){console.error("duty_booking_decryption_failed",{eventId:event.id,bookingId:row.id,error})}const deviceConnected=Boolean(row.helperId&&connectedHelperIds.has(row.helperId)),visible={id:row.id,firstName:row.firstName,lastName:row.lastName,email,maskedEmail,qualification:row.qualification,organizerNote:row.organizerNote,code,helperId:deviceConnected?row.helperId:null,deviceConnected,redeemedAt:row.redeemedAt,reminderSentAt:row.reminderSentAt,createdAt:row.createdAt};const list=bookingsByShift.get(row.shiftId)||[];list.push(visible);bookingsByShift.set(row.shiftId,list)}
  const invitations=[] as Array<Record<string,unknown>>;for(const row of invitationRows){let email:string|null=null,maskedEmail:string|null=null;try{const decrypted=await decryptDutyEmail(row.emailEncrypted,"invitation",row.id,event.id);maskedEmail=maskDutyEmail(decrypted);email=owner?decrypted:maskedEmail}catch(error){console.error("duty_invitation_decryption_failed",{eventId:event.id,invitationId:row.id,error})}invitations.push({id:row.id,email,maskedEmail,organizerNote:row.organizerNote,expiresAt:row.expiresAt,usedAt:row.usedAt,createdAt:row.createdAt})}
  return Response.json({enabled:true,signature:organization.dutyEmailSignature,assignments:assignmentRows,shifts:shiftRows.map(row=>({...row,assignment:{id:row.assignmentId,name:row.assignmentName},bookings:bookingsByShift.get(row.id)||[]})),invitations},{headers:{"cache-control":"no-store"}});
 }catch(error){console.error("duty_plan_read_failed",error);return Response.json({error:"Dienstplan konnte nicht geladen werden."},{status:500})}
}

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
 const bad=rejectCrossSiteMutation(request);if(bad)return bad;
 try{
  const {eventId}=await params,result=await context(eventId);if("error" in result)return result.error;
  const {authorization,organization}=result,event=authorization.event!;if(!organization?.dutyPlanEnabled)return Response.json({error:"Das Dienstplan-Modul ist nicht freigeschaltet."},{status:403});
  const body=await request.json() as Record<string,unknown>,title=cleanDutyText(body.title,120),assignmentId=cleanDutyText(body.assignmentId,100),startAt=dutyDate(body.startAt),endAt=dutyDate(body.endAt),capacity=Number(body.capacity),reservedCount=Number(body.reservedCount??0);
  if(!title||!assignmentId||!startAt||!endAt||!Number.isInteger(capacity))return Response.json({error:"Bitte Dienst, Einsatzmittel, Zeiten und Besatzungsstärke vollständig angeben."},{status:400});
  const shiftId=id("dsh"),now=Date.now();withImmediateTransaction(connection=>{assertShiftWrite(connection,{eventId:event.id,assignmentId,startAt:startAt.getTime(),endAt:endAt.getTime(),capacity,reservedCount});connection.prepare("INSERT INTO duty_shifts (id,event_id,assignment_id,title,start_at,end_at,capacity,reserved_count,created_by_user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(shiftId,event.id,assignmentId,title,startAt.getTime(),endAt.getTime(),capacity,reservedCount,authorization.user!.id,now)});
  return Response.json({shift:{id:shiftId,title,assignmentId,startAt,endAt,capacity,reservedCount}},{status:201});
 }catch(error){if(error instanceof DutyPlanConflict)return Response.json({error:error.message},{status:409});console.error("duty_shift_create_failed",error);return Response.json({error:"Dienst konnte nicht angelegt werden."},{status:500})}
}
