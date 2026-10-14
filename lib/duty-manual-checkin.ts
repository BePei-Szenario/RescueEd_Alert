import type {DatabaseSync} from "node:sqlite";
import {DutyPlanConflict,dutyUsage} from "./duty-plan.ts";

export function hasEventDutyPlan(connection:DatabaseSync,eventId:string){
 return Boolean(connection.prepare("SELECT id FROM duty_shifts WHERE event_id=? LIMIT 1").get(eventId));
}

// Call inside an immediate transaction. Do not redeem the device code here:
// the helper must still be able to connect their own phone after manual arrival.
export function checkInPlannedHelper(connection:DatabaseSync,input:{eventId:string;bookingId?:string;codeHash?:string;helperId:string;sessionTokenHash:string;registeredAt:number}){
 const booking=connection.prepare(`SELECT b.id,b.first_name,b.last_name,b.qualification,b.helper_id,b.redeemed_at FROM duty_bookings b JOIN duty_shifts s ON s.id=b.shift_id JOIN events e ON e.id=s.event_id WHERE s.event_id=? AND e.status='active' AND ${input.bookingId?"b.id=?":"b.code_hash=?"} LIMIT 1`).get(input.eventId,input.bookingId||input.codeHash||"") as {id:string;first_name:string;last_name:string;qualification:string|null;helper_id:string|null;redeemed_at:number|null}|undefined;
 if(!booking)throw new DutyPlanConflict("Kein passender Dienstplaneintrag für dieses Event gefunden.");
 if(booking.helper_id||booking.redeemed_at!==null)throw new DutyPlanConflict("Dieser Dienst wurde bereits eingebucht.");
 const duplicate=connection.prepare("SELECT id FROM helpers WHERE event_id=? AND removed_at IS NULL AND lower(trim(first_name))=lower(trim(?)) AND lower(trim(last_name))=lower(trim(?))").get(input.eventId,booking.first_name,booking.last_name);
 if(duplicate)throw new DutyPlanConflict("Eine Person mit diesem Namen ist bereits anwesend. Bitte den bestehenden Eintrag prüfen.");
 const usage=dutyUsage(connection,input.eventId);
 if(usage.used>usage.limit)throw new DutyPlanConflict("Das Helferlimit des Events ist überschritten.");
 connection.prepare(`INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,phone,session_token_hash,registration_source,registered_at,removed_at) VALUES (?,?,NULL,?,?,?,?,NULL,?,'manual',?,NULL)`).run(input.helperId,input.eventId,`${booking.first_name} ${booking.last_name}`,booking.first_name,booking.last_name,booking.qualification||"Nicht angegeben",input.sessionTokenHash,input.registeredAt);
 const linked=connection.prepare("UPDATE duty_bookings SET helper_id=? WHERE id=? AND helper_id IS NULL AND redeemed_at IS NULL").run(input.helperId,booking.id);
 if(Number(linked.changes)!==1)throw new DutyPlanConflict("Dieser Dienst wurde bereits eingebucht.");
 return input.helperId;
}
