const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function timestamp(date: string, time: string): number | null {
  if (!DATE.test(date) || !TIME.test(time)) return null;
  const value = new Date(`${date}T${time}:00.000Z`);
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 16) !== `${date}T${time}`) return null;
  return value.getTime();
}

// Compare local calendar values without depending on the server's time zone.
export function eventDurationMinutes(startDate: string, startTime: string, endDate: string, endTime: string): number | null {
  const start = timestamp(startDate, startTime);
  const end = timestamp(endDate, endTime);
  return start === null || end === null ? null : (end - start) / 60_000;
}

export const STANDARD_EVENT_MAX_MINUTES = 2 * 24 * 60;

// Older events did not store an end date; their earlier overnight convention
// treated an end time before the start time as the following day.
export function effectiveEventEndDate(startDate:string,startTime:string|null,endDate:string|null|undefined,endTime:string|null):string {
  if(endDate)return endDate;
  if(!startTime||!endTime||endTime>startTime)return startDate;
  const next=new Date(`${startDate}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate()+1);
  return next.toISOString().slice(0,10);
}
