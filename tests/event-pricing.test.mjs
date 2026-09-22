import assert from "node:assert/strict";
import test from "node:test";
import {eventPriceCents,SHORT_EVENT_MAX_MINUTES} from "../lib/event-duration.ts";

test("events through two days use the short price tier",()=>{
 assert.equal(eventPriceCents(20,SHORT_EVENT_MAX_MINUTES),599);
 assert.equal(eventPriceCents(21,SHORT_EVENT_MAX_MINUTES),999);
});

test("events over two days use the five-day price tier",()=>{
 assert.equal(eventPriceCents(20,SHORT_EVENT_MAX_MINUTES+1),1799);
 assert.equal(eventPriceCents(21,SHORT_EVENT_MAX_MINUTES+1),1999);
});
