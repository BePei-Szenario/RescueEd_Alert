import assert from "node:assert/strict";
import test from "node:test";
import {canonicalDutyInvitationUrl,dutyInvitationExpiresAt,dutyInvitationUrl} from "../lib/duty-invitation.mjs";

const token="a1".repeat(32);
test("invitations expire after exactly 24 hours, including clock changes",()=>{
  for(const value of ["2026-10-13T12:00:00Z","2026-10-24T12:00:00Z","2026-03-28T12:00:00Z"]){
    const now=new Date(value);
    assert.equal(dutyInvitationExpiresAt(now).getTime()-now.getTime(),86400000);
  }
});
test("invitation links use the configured public origin",()=>{
  assert.equal(dutyInvitationUrl(token,"https://alert-rescueed.de"),`https://alert-rescueed.de/dienstplan/${token}`);
});
test("queued localhost links are rebuilt with the public mail origin",()=>{
  assert.equal(canonicalDutyInvitationUrl(`https://localhost:3000/dienstplan/${token}`,"https://alert-rescueed.de/"),`https://alert-rescueed.de/dienstplan/${token}`);
});
test("production rejects local or invalid origins and malformed tokens",()=>{
  for(const base of ["","https://localhost:3000","http://127.0.0.1:5004","http://alert-rescueed.de","https://user:pass@alert-rescueed.de","https://alert-rescueed.de/path","https://alert-rescueed.de/?x=1"]){
    assert.throws(()=>dutyInvitationUrl(token,base));
  }
  assert.throws(()=>dutyInvitationUrl("bad/token","https://alert-rescueed.de"));
  assert.throws(()=>canonicalDutyInvitationUrl("https://localhost:3000/password-reset","https://alert-rescueed.de"));
});
test("local preview is allowed only explicitly",()=>{
  assert.equal(dutyInvitationUrl(token,"http://127.0.0.1:5004",true),`http://127.0.0.1:5004/dienstplan/${token}`);
});
