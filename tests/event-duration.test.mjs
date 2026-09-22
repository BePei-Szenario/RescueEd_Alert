import assert from "node:assert/strict";
import test from "node:test";
import {eventDurationMinutes,SHORT_EVENT_MAX_MINUTES,STANDARD_EVENT_MAX_MINUTES,effectiveEventEndDate} from "../lib/event-duration.ts";
import {attendanceWindowOpen} from "../lib/attendance-window.ts";

test("short event tier ends after exactly 48 hours",()=>{
 assert.equal(eventDurationMinutes("2026-09-16","08:00","2026-09-18","08:00"),SHORT_EVENT_MAX_MINUTES);
 assert.equal(eventDurationMinutes("2026-09-16","08:00","2026-09-18","08:01"),SHORT_EVENT_MAX_MINUTES+1);
});

test("standard event limit is exactly five days",()=>{
 assert.equal(eventDurationMinutes("2026-09-16","08:00","2026-09-21","08:00"),STANDARD_EVENT_MAX_MINUTES);
 assert.equal(eventDurationMinutes("2026-09-16","08:00","2026-09-21","08:01"),STANDARD_EVENT_MAX_MINUTES+1);
});

test("invalid or reversed event periods cannot pass validation",()=>{
 assert.equal(eventDurationMinutes("2026-02-30","08:00","2026-03-02","09:00"),null);
 assert.equal(eventDurationMinutes("2026-09-16","24:00","2026-09-17","08:00"),null);
 assert.equal(eventDurationMinutes("2026-09-17","08:00","2026-09-16","08:00"),-1440);
});

test("legacy overnight events retain their inferred end date",()=>{
 assert.equal(effectiveEventEndDate("2026-09-16","20:00",null,"04:00"),"2026-09-17");
 assert.equal(effectiveEventEndDate("2026-09-16","08:00",null,"16:00"),"2026-09-16");
});

test("multi-day QR attendance remains open through its configured end date",()=>{
 const event={status:"active",eventDate:"2026-09-16",endDate:"2026-09-20",startTime:"08:00",endTime:"20:00"};
 assert.equal(attendanceWindowOpen(event,new Date("2026-09-19T10:00:00.000Z")),true);
 assert.equal(attendanceWindowOpen(event,new Date("2026-09-21T10:00:00.000Z")),false);
});
