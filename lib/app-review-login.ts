type ReviewEnvironment = {
 APP_REVIEW_EMAIL?: string;
 APP_REVIEW_MFA_CODE?: string;
};

export function appReviewMfaCode(
 email: string,
 accountType: string | null | undefined,
 environment?: ReviewEnvironment,
){
 const reviewEmail=(environment?.APP_REVIEW_EMAIL??process.env.APP_REVIEW_EMAIL)?.trim().toLowerCase();
 const reviewCode=(environment?.APP_REVIEW_MFA_CODE??process.env.APP_REVIEW_MFA_CODE)?.trim();
 if(accountType!=="consumer"||!reviewEmail||email.trim().toLowerCase()!==reviewEmail)return null;
 return /^\d{6}$/.test(reviewCode||"")?reviewCode!:null;
}

type GoogleReviewEnvironment = {
 GOOGLE_REVIEW_USER_ID?: string;
 GOOGLE_REVIEW_EMAIL?: string;
 GOOGLE_REVIEW_MFA_CODE?: string;
};

// Only this explicitly configured review customer receives a reusable code.
// Password, active-account checks, rate limits and MFA verification still apply.
export function googleReviewMfaCode(
 user:{id:string;email:string;accountType:string;role:string},
 environment:GoogleReviewEnvironment={GOOGLE_REVIEW_USER_ID:process.env.GOOGLE_REVIEW_USER_ID,GOOGLE_REVIEW_EMAIL:process.env.GOOGLE_REVIEW_EMAIL,GOOGLE_REVIEW_MFA_CODE:process.env.GOOGLE_REVIEW_MFA_CODE},
){
 const email=environment.GOOGLE_REVIEW_EMAIL?.trim().toLowerCase();
 const code=environment.GOOGLE_REVIEW_MFA_CODE?.trim();
 if(!environment.GOOGLE_REVIEW_USER_ID||!email||user.id!==environment.GOOGLE_REVIEW_USER_ID||user.email.trim().toLowerCase()!==email||user.accountType!=="organization"||user.role!=="customer")return null;
 return /^\d{6}$/.test(code||"")?code!:null;
}
