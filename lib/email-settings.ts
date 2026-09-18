import {eq} from "drizzle-orm";
import {getDb} from "@/db";
import {emailSenderSettings} from "@/db/schema";
export type EmailAction="mfa"|"registration_link"|"password_reset"|"customer_contact";
export async function senderFor(action:EmailAction){const [setting]=await getDb().select({email:emailSenderSettings.senderEmail}).from(emailSenderSettings).where(eq(emailSenderSettings.action,action)).limit(1);return setting?.email||(action==="customer_contact"?process.env.MAIL_FROM_CONTACT||"info_ra@rescueed.de":process.env.MAIL_FROM_MFA||"noreply_ra@rescueed.de")}
