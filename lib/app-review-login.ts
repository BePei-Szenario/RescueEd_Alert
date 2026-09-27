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
