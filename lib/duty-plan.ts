import type {DatabaseSync} from "node:sqlite";

export class DutyPlanConflict extends Error{constructor(message:string){super(message);this.name="DutyPlanConflict"}}

export function cleanDutyText(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):""}
export function validDutyEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254}
export function dutyDate(value:unknown){if(typeof value!=="string")return null;const date=new Date(value);return Number.isFinite(date.getTime())?date:null}

type SqlShift={id:string;event_id:string;start_at:number;end_at:number;capacity:number;reserved_count:number};

export function assertPublicDutySeats(connection:DatabaseSync,eventId:string,shiftIds:string[]){
 if(!shiftIds.length||new Set(shiftIds).size!==shiftIds.length)throw new DutyPlanConflict("Bitte unterschiedliche Dienste auswählen.");
 const rows=connection.prepare(`SELECT ds.id,ds.start_at,ds.end_at,ds.capacity,ds.reserved_count,(SELECT COUNT(*) FROM duty_bookings b WHERE b.shift_id=ds.id) AS booking_count FROM duty_shifts ds WHERE ds.event_id=? AND ds.id IN (${shiftIds.map(()=>"?").join(",")})`).all(eventId,...shiftIds) as Array<{id:string;start_at:number;end_at:number;capacity:number;reserved_count:number;booking_count:number}>;
 if(rows.length!==shiftIds.length||rows.some(row=>row.booking_count+row.reserved_count>=row.capacity))throw new DutyPlanConflict("Mindestens ein ausgewählter Dienst ist nicht mehr frei.");
 return rows;
}

export function dutyUsage(connection:DatabaseSync,eventId:string,excludeShiftId?:string){
 const row=connection.prepare(`
  SELECT e.helper_limit AS helper_limit,
   COALESCE(SUM(s.reserved_count),0) AS reserved_capacity,
   (SELECT COUNT(*) FROM duty_bookings b JOIN duty_shifts bs ON bs.id=b.shift_id WHERE bs.event_id=e.id ${excludeShiftId?"AND bs.id<>?":""}) AS free_bookings,
   (SELECT COUNT(*) FROM helpers h WHERE h.event_id=e.id AND h.removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM duty_bookings linked WHERE linked.helper_id=h.id)) AS active_unplanned
  FROM events e LEFT JOIN duty_shifts s ON s.event_id=e.id ${excludeShiftId?"AND s.id<>?":""}
  WHERE e.id=? GROUP BY e.id
 `).get(...(excludeShiftId?[excludeShiftId,excludeShiftId,eventId]:[eventId])) as {helper_limit:number;reserved_capacity:number;free_bookings:number;active_unplanned:number}|undefined;
 if(!row)throw new DutyPlanConflict("Event nicht gefunden.");
 return {limit:Number(row.helper_limit),used:Number(row.reserved_capacity)+Number(row.free_bookings)+Number(row.active_unplanned)};
}

export function assertShiftWrite(connection:DatabaseSync,input:{eventId:string;shiftId?:string;assignmentId:string;startAt:number;endAt:number;capacity:number;reservedCount:number}){
 if(input.endAt<=input.startAt)throw new DutyPlanConflict("Das Dienstende muss nach dem Beginn liegen.");
 if(!Number.isInteger(input.capacity)||input.capacity<1||input.capacity>999)throw new DutyPlanConflict("Die Besatzungsstärke muss zwischen 1 und 999 liegen.");
 const assignment=connection.prepare("SELECT id FROM assignments WHERE id=? AND event_id=? AND removed_at IS NULL").get(input.assignmentId,input.eventId);
 if(!assignment)throw new DutyPlanConflict("Das Einsatzmittel gehört nicht zu diesem Event.");
 const booked=input.shiftId?Number((connection.prepare("SELECT COUNT(*) AS count FROM duty_bookings WHERE shift_id=?").get(input.shiftId) as {count:number}).count):0;
 if(!Number.isInteger(input.reservedCount)||input.reservedCount<0||booked+input.reservedCount>input.capacity)throw new DutyPlanConflict("Gebuchte und reservierte Plätze dürfen die Besatzungsstärke nicht überschreiten.");
 const usage=dutyUsage(connection,input.eventId,input.shiftId);
 const contribution=input.reservedCount+booked;
 if(usage.used+contribution>usage.limit)throw new DutyPlanConflict(`Das Helferlimit von ${usage.limit} wird überschritten.`);
}

/** Organizer-only allocation; call inside the transaction that writes the booking. */
export function assertBookingWrite(connection:DatabaseSync,input:{eventId:string;shiftId:string;emailHash:string;excludeBookingId?:string}){
 const shift=connection.prepare("SELECT id,event_id,start_at,end_at,capacity,reserved_count FROM duty_shifts WHERE id=? AND event_id=?").get(input.shiftId,input.eventId) as SqlShift|undefined;
 if(!shift)throw new DutyPlanConflict("Der Dienst wurde nicht gefunden.");
 const booked=Number((connection.prepare(`SELECT COUNT(*) AS count FROM duty_bookings WHERE shift_id=? ${input.excludeBookingId?"AND id<>?":""}`).get(...(input.excludeBookingId?[shift.id,input.excludeBookingId]:[shift.id])) as {count:number}).count);
 if(booked>=shift.capacity)throw new DutyPlanConflict("Dieser Dienst ist bereits vollständig besetzt.");
 const overlap=connection.prepare(`SELECT b.id FROM duty_bookings b JOIN duty_shifts s ON s.id=b.shift_id WHERE s.event_id=? AND b.email_hash=? AND s.start_at<? AND s.end_at>? ${input.excludeBookingId?"AND b.id<>?":""} LIMIT 1`).get(...(input.excludeBookingId?[input.eventId,input.emailHash,shift.end_at,shift.start_at,input.excludeBookingId]:[input.eventId,input.emailHash,shift.end_at,shift.start_at]));
 if(overlap)throw new DutyPlanConflict("Für diese E-Mail-Adresse besteht bereits ein zeitlich überschneidender Dienst.");
 const old=input.excludeBookingId?connection.prepare("SELECT b.shift_id FROM duty_bookings b JOIN duty_shifts s ON s.id=b.shift_id WHERE b.id=? AND s.event_id=?").get(input.excludeBookingId,input.eventId) as {shift_id:string}|undefined:undefined;
 const consumesReservation=shift.reserved_count>0&&old?.shift_id!==shift.id;
 const usage=dutyUsage(connection,input.eventId);
 if(usage.used-(old?1:0)+(consumesReservation?0:1)>usage.limit)throw new DutyPlanConflict(`Das Helferlimit von ${usage.limit} wird überschritten.`);
 // The caller performs this check and the booking write in one immediate transaction.
 if(consumesReservation)connection.prepare("UPDATE duty_shifts SET reserved_count=reserved_count-1 WHERE id=?").run(shift.id);
 return shift;
}
