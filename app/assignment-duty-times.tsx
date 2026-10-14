export type AssignmentDutyShift={id:string;title:string;startAt:string;endAt:string;upcoming:boolean};

function berlinTime(value:string){
 return new Intl.DateTimeFormat("de-DE",{timeZone:"Europe/Berlin",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"}).format(new Date(value));
}

export function AssignmentDutyTimes({shifts=[]}:{shifts?:AssignmentDutyShift[]}){
 if(!shifts.length)return null;
 return <div className="assignment-duty-times" aria-label="Geplante Schichtzeiten">
  {shifts.map(shift=><div className="assignment-duty-time" key={shift.id}>
   <strong>{shift.title}</strong>
   <span>Von <time dateTime={shift.startAt}>{berlinTime(shift.startAt)}</time></span>
   <span>Bis <time dateTime={shift.endAt}>{berlinTime(shift.endAt)}</time></span>
   {shift.upcoming&&<small className="assignment-duty-warning">Hinweis: Schichtbeginn noch nicht erreicht. Alarmierung bereits möglich, sofern Helfergeräte verbunden sind.</small>}
  </div>)}
 </div>;
}
