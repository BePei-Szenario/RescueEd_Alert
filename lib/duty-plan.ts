import type {DatabaseSync} from "node:sqlite";

export class DutyPlanConflict extends Error{constructor(message:string){super(message);this.name="DutyPlanConflict"}}

export function cleanDutyText(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):""}
export function validDutyEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254}
export function dutyDate(value:unknown){if(typeof value!=="string")return null;const date=new Date(value);return Number.isFinite(date.getTime())?date:null}

type SqlShift={id:string;event_id:string;start_at:number;end_at:number;capacity:number;reserved:number};

export function dutyUsage(connection:DatabaseSync,eventId:string,excludeShiftId?:string){
 const row=connection.prepare(`
  SELECT e.helper_limit AS helper_limit,
   COALESCE(SUM(CASE WHEN s.reserved=1 THEN s.capacity ELSE 0 END),0) AS reserved_capacity,
   (SELECT COUNT(*) FROM duty_bookings b JOIN duty_shifts bs ON bs.id=b.shift_id WHERE bs.event_id=e.id AND bs.reserved=0 ${excludeShiftId?"AND bs.id<>?":""}) AS free_bookings,
   (SELECT COUNT(*) FROM helpers h WHERE h.event_id=e.id AND h.removed_at IS NULL AND NOT EXISTS (SELECT 1 FROM duty_bookings linked WHERE linked.helper_id=h.id)) AS active_unplanned
  FROM events e LEFT JOIN duty_shifts s ON s.event_id=e.id ${excludeShiftId?"AND s.id<>?":""}
  WHERE e.id=? GROUP BY e.id
 `).get(...(excludeShiftId?[excludeShiftId,excludeShiftId,eventId]:[eventId])) as {helper_limit:number;reserved_capacity:number;free_bookings:number;active_unplanned:number}|undefined;
 if(!row)throw new DutyPlanConflict("Event nicht gefunden.");
 return {limit:Number(row.helper_limit),used:Number(row.reserved_capacity)+Number(row.free_bookings)+Number(row.active_unplanned)};
}

export function assertShiftWrite(connection:DatabaseSync,input:{eventId:string;shiftId?:string;assignmentId:string;startAt:number;endAt:number;capacity:number;reserved:boolean}){
 if(input.endAt<=input.startAt)throw new DutyPlanConflict("Das Dienstende muss nach dem Beginn liegen.");
 if(input.capacity<1||input.capacity>999)throw new DutyPlanConflict("Die Besatzungsstärke muss zwischen 1 und 999 liegen.");
 const assignment=connection.prepare("SELECT id FROM assignments WHERE id=? AND event_id=? AND removed_at IS NULL").get(input.assignmentId,input.eventId);
 if(!assignment)throw new DutyPlanConflict("Das Einsatzmittel gehört nicht zu diesem Event.");
 const booked=input.shiftId?Number((connection.prepare("SELECT COUNT(*) AS count FROM duty_bookings WHERE shift_id=?").get(input.shiftId) as {count:number}).count):0;
 if(booked>input.capacity)throw new DutyPlanConflict("Die Besatzungsstärke liegt unter der Zahl bereits gebuchter Dienste.");
 const usage=dutyUsage(connection,input.eventId,input.shiftId);
 const contribution=input.reserved?input.capacity:booked;
 if(usage.used+contribution>usage.limit)throw new DutyPlanConflict(`Das Helferlimit von ${usage.limit} wird überschritten.`);
}

export function assertBookingWrite(connection:DatabaseSync,input:{eventId:string;shiftId:string;emailHash:string;excludeBookingId?:string}){
 const shift=connection.prepare("SELECT id,event_id,start_at,end_at,capacity,reserved FROM duty_shifts WHERE id=? AND event_id=?").get(input.shiftId,input.eventId) as SqlShift|undefined;
 if(!shift)throw new DutyPlanConflict("Der Dienst wurde nicht gefunden.");
 const booked=Number((connection.prepare(`SELECT COUNT(*) AS count FROM duty_bookings WHERE shift_id=? ${input.excludeBookingId?"AND id<>?":""}`).get(...(input.excludeBookingId?[shift.id,input.excludeBookingId]:[shift.id])) as {count:number}).count);
 if(booked>=shift.capacity)throw new DutyPlanConflict("Dieser Dienst ist bereits vollständig besetzt.");
 const overlap=connection.prepare(`SELECT b.id FROM duty_bookings b JOIN duty_shifts s ON s.id=b.shift_id WHERE s.event_id=? AND b.email_hash=? AND s.start_at<? AND s.end_at>? ${input.excludeBookingId?"AND b.id<>?":""} LIMIT 1`).get(...(input.excludeBookingId?[input.eventId,input.emailHash,shift.end_at,shift.start_at,input.excludeBookingId]:[input.eventId,input.emailHash,shift.end_at,shift.start_at]));
 if(overlap)throw new DutyPlanConflict("Für diese E-Mail-Adresse besteht bereits ein zeitlich überschneidender Dienst.");
 if(!shift.reserved){const usage=dutyUsage(connection,input.eventId);let existingContribution=0;if(input.excludeBookingId){const old=connection.prepare("SELECT s.reserved FROM duty_bookings b JOIN duty_shifts s ON s.id=b.shift_id WHERE b.id=? AND s.event_id=?").get(input.excludeBookingId,input.eventId) as {reserved:number}|undefined;existingContribution=old&&!old.reserved?1:0}if(usage.used-existingContribution+1>usage.limit)throw new DutyPlanConflict(`Das Helferlimit von ${usage.limit} wird überschritten.`)}
 return shift;
}
