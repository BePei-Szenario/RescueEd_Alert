import assert from "node:assert/strict";
import test from "node:test";
import {rejectCrossSiteMutation} from "../lib/request-security.ts";

function request(host,origin,site="same-origin",protocol="http"){
 return new Request("http://localhost:5173/api/auth/login",{
  method:"POST",
  headers:{host,"x-forwarded-proto":protocol,origin,"sec-fetch-site":site,"content-type":"application/json"},
  body:"{}"
 });
}

test("accepts the browser origin when Next.js normalizes its internal URL",()=>{
 assert.equal(rejectCrossSiteMutation(request("127.0.0.1:5173","http://127.0.0.1:5173")),null);
 assert.equal(rejectCrossSiteMutation(request("localhost:5173","http://localhost:5173")),null);
});

test("accepts an HTTPS origin behind the trusted reverse proxy",()=>{
 assert.equal(rejectCrossSiteMutation(request("alert-rescueed.de","https://alert-rescueed.de","same-origin","https")),null);
});

test("rejects a foreign origin or cross-site browser request",()=>{
 assert.equal(rejectCrossSiteMutation(request("127.0.0.1:5173","https://example.invalid"))?.status,403);
 assert.equal(rejectCrossSiteMutation(request("127.0.0.1:5173","http://127.0.0.1:5173","cross-site"))?.status,403);
});
