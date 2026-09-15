type TimedEvent={status:string;eventDate:string;startTime:string|null;endTime:string|null};

function localParts(date:Date){
 const values=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Berlin",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
 return {date:`${values.year}-${values.month}-${values.day}`,minutes:Number(values.hour)*60+Number(values.minute)};
}

function addDays(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}
function minutes(value:string|null){if(!value||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))return null;const [hour,minute]=value.split(":").map(Number);return hour*60+minute}

export function attendanceWindowOpen(event:TimedEvent,now=new Date()){
 if(event.status!=="active"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(event.eventDate))return false;
 const current=localParts(now),start=minutes(event.startTime),end=minutes(event.endTime);
 if(start===null||end===null)return current.date===event.eventDate;
 const overnight=end<=start,endDate=overnight?addDays(event.eventDate,1):event.eventDate;
 const openDay=start<360?addDays(event.eventDate,-1):event.eventDate,openMinute=(start-360+1440)%1440;
 const closeDay=end+720>=1440?addDays(endDate,1):endDate,closeMinute=(end+720)%1440;
 const currentKey=`${current.date} ${String(current.minutes).padStart(4,"0")}`;
 const openKey=`${openDay} ${String(openMinute).padStart(4,"0")}`;
 const closeKey=`${closeDay} ${String(closeMinute).padStart(4,"0")}`;
 return currentKey>=openKey&&currentKey<=closeKey;
}
