export const RESCUEED_EMAIL_SIGNATURE=`RESCUEED
Digitale Ausbildungs- und Trainingsorganisation

✉ bpeinzger@rescueed.de
🌐 www.rescueed.de

RescueEd – Benjamin Peinzger
Mühltor 17 · 99986 Niederdorla

Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:
DE464531514`;

export function emailPayload(payload:Record<string,unknown>){return JSON.stringify({...payload,signature:RESCUEED_EMAIL_SIGNATURE})}
