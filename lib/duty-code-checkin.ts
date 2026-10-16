import type {DatabaseSync} from "node:sqlite";

export class DutyCodeConflict extends Error{}

export function redeemDutyCode(connection:DatabaseSync,input:{eventId:string;codeHash:string;helperId:string;sessionTokenHash:string;registeredAt:number}){
 const event={id:input.eventId};const {codeHash,helperId,sessionTokenHash,registeredAt}=input;

     const booking=connection.prepare(`SELECT db.id,db.first_name,db.last_name,db.qualification,db.helper_id,ds.assignment_id,e.helper_limit,h.registration_source AS linked_source,h.removed_at AS linked_removed_at FROM duty_bookings db JOIN duty_shifts ds ON ds.id=db.shift_id JOIN events e ON e.id=ds.event_id LEFT JOIN helpers h ON h.id=db.helper_id WHERE ds.event_id=? AND db.code_hash=? AND db.redeemed_at IS NULL AND e.status='active' AND (db.helper_id IS NULL OR (h.event_id=ds.event_id AND h.registration_source='manual' AND h.removed_at IS NULL)) LIMIT 1`).get(event.id,codeHash) as {id:string;first_name:string;last_name:string;qualification:string|null;helper_id:string|null;assignment_id:string;helper_limit:number;linked_source:string|null;linked_removed_at:number|null}|undefined;
     if(!booking)throw new DutyCodeConflict("Dieser Dienstcode ist ungültig oder wurde bereits verwendet.");
     const manualMatches=booking.helper_id?[{id:booking.helper_id}]:connection.prepare(`SELECT id FROM helpers WHERE event_id=? AND removed_at IS NULL AND registration_source='manual' AND lower(trim(COALESCE(first_name,'')))=lower(trim(?)) AND lower(trim(COALESCE(last_name,'')))=lower(trim(?)) ORDER BY registered_at DESC LIMIT 2`).all(event.id,booking.first_name,booking.last_name) as Array<{id:string}>;
     if(manualMatches.length>1)throw new DutyCodeConflict("Mehrere manuelle Einträge haben denselben Namen. Bitte zuerst den Veranstalter um eindeutige Zuordnung bitten.");
     const manual=manualMatches[0],targetId=manual?.id||helperId;
     if(manual){
      const updated=connection.prepare(`UPDATE helpers SET assignment_id=?,name=?,first_name=?,last_name=?,qualification=?,session_token_hash=?,registration_source='qr' WHERE id=? AND event_id=? AND removed_at IS NULL AND registration_source='manual'`).run(booking.assignment_id,`${booking.first_name} ${booking.last_name}`,booking.first_name,booking.last_name,booking.qualification||"Nicht angegeben",sessionTokenHash,manual.id,event.id);
      if(Number(updated.changes)!==1)throw new DutyCodeConflict("Der manuelle Eintrag konnte nicht mit diesem Gerät verbunden werden.");
     }else{
      const active=(connection.prepare("SELECT COUNT(*) AS count FROM helpers WHERE event_id=? AND removed_at IS NULL").get(event.id) as {count:number}).count;
      if(Number(active)>=booking.helper_limit)throw new DutyCodeConflict("Die maximale Helferzahl des Events ist erreicht.");
      connection.prepare(`INSERT INTO helpers (id,event_id,assignment_id,name,first_name,last_name,qualification,phone,session_token_hash,registration_source,registered_at,removed_at) VALUES (?,?,?,?,?,?,?,?,?,'qr',?,NULL)`).run(targetId,event.id,booking.assignment_id,`${booking.first_name} ${booking.last_name}`,booking.first_name,booking.last_name,booking.qualification||"Nicht angegeben",null,sessionTokenHash,registeredAt);
     }
     const redeemed=connection.prepare("UPDATE duty_bookings SET helper_id=?,redeemed_at=? WHERE id=? AND redeemed_at IS NULL AND (helper_id IS NULL OR helper_id=?)").run(targetId,registeredAt,booking.id,targetId);
     if(Number(redeemed.changes)!==1)throw new DutyCodeConflict("Dieser Dienstcode wurde bereits verwendet.");
     return targetId;
    
}
