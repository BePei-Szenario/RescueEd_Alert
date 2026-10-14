import assert from "node:assert/strict";
import test from "node:test";
import {dutyNotAttended} from "../lib/duty-no-shows.ts";
const now=new Date("2026-10-14T20:00:00Z"),row={helperId:null,redeemedAt:null,startAt:"2026-10-14T18:00:00Z"};
test("only started services without attendance are missed",()=>{
 assert.equal(dutyNotAttended(row,now),true);
 assert.equal(dutyNotAttended({...row,startAt:now},now),true);
 assert.equal(dutyNotAttended({...row,startAt:"2026-10-15T18:00:00Z"},now),false);
});
test("manual, QR and completed attendance are excluded",()=>{
 assert.equal(dutyNotAttended({...row,helperId:"manual-helper"},now),false);
 assert.equal(dutyNotAttended({...row,helperId:"qr-helper",redeemedAt:now},now),false);
 assert.equal(dutyNotAttended({...row,helperId:"checked-out-helper",removedAt:now},now),false);
 assert.equal(dutyNotAttended({...row,redeemedAt:now},now),false);
});
