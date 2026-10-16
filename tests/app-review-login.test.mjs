import assert from "node:assert/strict";
import test from "node:test";
import {appReviewMfaCode,googleReviewMfaCode} from "../lib/app-review-login.ts";

const configured={APP_REVIEW_EMAIL:"apple-review@example.com",APP_REVIEW_MFA_CODE:"482731"};
const google={GOOGLE_REVIEW_USER_ID:"usr_review",GOOGLE_REVIEW_EMAIL:"google@example.com",GOOGLE_REVIEW_MFA_CODE:"726531"};
const user={id:"usr_review",email:"google@example.com",accountType:"organization",role:"customer"};
test("Google review exception requires matching ID, email, type and customer role",()=>{
 assert.equal(googleReviewMfaCode(user,google),"726531");
 for(const change of [{id:"usr_other"},{email:"other@example.com"},{accountType:"consumer"},{role:"platform_owner"},{role:"platform_staff"},{role:"organization_member"}])assert.equal(googleReviewMfaCode({...user,...change},google),null);
 for(const key of Object.keys(google))assert.equal(googleReviewMfaCode(user,{...google,[key]:""}),null);
 assert.equal(googleReviewMfaCode(user,{...google,GOOGLE_REVIEW_MFA_CODE:"12345"}),null);
});

test("returns the configured code only for the matching consumer account",()=>{
 assert.equal(appReviewMfaCode("APPLE-REVIEW@example.com","consumer",configured),"482731");
 assert.equal(appReviewMfaCode("other@example.com","consumer",configured),null);
 assert.equal(appReviewMfaCode("apple-review@example.com","organization",configured),null);
});

test("rejects missing or malformed review codes",()=>{
 assert.equal(appReviewMfaCode("apple-review@example.com","consumer",{...configured,APP_REVIEW_MFA_CODE:"12345"}),null);
 assert.equal(appReviewMfaCode("apple-review@example.com","consumer",{APP_REVIEW_EMAIL:"apple-review@example.com"}),null);
});
