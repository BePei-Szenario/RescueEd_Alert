/** First UTC instant after `years` complete calendar years following the reference year. */
export function calendarYearRetentionEnd(reference:Date,years:number):Date{
 return new Date(Date.UTC(reference.getUTCFullYear()+years+1,0,1));
}
