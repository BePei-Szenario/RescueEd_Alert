import assert from "node:assert/strict";
import test from "node:test";
import {appReviewMfaCode} from "../lib/app-review-login.ts";

const configured={APP_REVIEW_EMAIL:"apple-review@example.com",APP_REVIEW_MFA_CODE:"482731"};

test("returns the configured code only for the matching consumer account",()=>{
 assert.equal(appReviewMfaCode("APPLE-REVIEW@example.com","consumer",configured),"482731");
 assert.equal(appReviewMfaCode("other@example.com","consumer",configured),null);
 assert.equal(appReviewMfaCode("apple-review@example.com","organization",configured),null);
});

test("rejects missing or malformed review codes",()=>{
 assert.equal(appReviewMfaCode("apple-review@example.com","consumer",{...configured,APP_REVIEW_MFA_CODE:"12345"}),null);
 assert.equal(appReviewMfaCode("apple-review@example.com","consumer",{APP_REVIEW_EMAIL:"apple-review@example.com"}),null);
});
