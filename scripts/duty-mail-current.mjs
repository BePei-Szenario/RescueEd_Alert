import {createHash} from "node:crypto";

const hash=value=>createHash("sha256").update(value).digest("hex");

// Revalidate even legacy bundled confirmations, which have no duty_booking_id.
// Removing/changing an address or deleting/moving a booking must invalidate its
// queued content. Already handed-off SMTP messages cannot be recalled.
export function currentDutyMail(db,row,data){
 if(!["duty_confirmation","duty_reminder"].includes(row.type))return data;
 const emailHash=hash(String(row.recipient_email||"").trim().toLowerCase());
 const lookup=db.prepare("SELECT b.id FROM duty_bookings b JOIN duty_shifts s ON s.id=b.shift_id WHERE s.event_id=? AND b.code_hash=? AND b.email_hash=?");
 const duties=(Array.isArray(data.duties)?data.duties:[]).filter(duty=>{
  if(typeof duty.code!=="string"||!/^\d{8}$/.test(duty.code))return false;
  const booking=lookup.get(row.event_id,hash(duty.code),emailHash);
  return Boolean(booking&&(!row.duty_booking_id||booking.id===row.duty_booking_id));
 });
 return duties.length?{...data,duties}:null;
}
