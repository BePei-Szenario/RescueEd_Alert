import { createDecipheriv } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const required = ["DATABASE_PATH", "PUBLIC_BASE_URL", "EMAIL_PAYLOAD_KEY", "MAIL_FROM_MFA", "MAIL_FROM_CONTACT", "MSMTP_CONFIG"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} fehlt.`);
const origin = new URL(process.env.PUBLIC_BASE_URL);
if (origin.protocol !== "https:" || origin.pathname !== "/") throw new Error("PUBLIC_BASE_URL muss eine HTTPS-Origin sein.");
const db = new DatabaseSync(process.env.DATABASE_PATH);
db.exec("PRAGMA busy_timeout=5000;");

function keyBytes(value) {
  return /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
}
function payload(row) {
  let data = JSON.parse(row.payload_json);
  if (data.alg !== "A256GCM") return data;
  const expected = `rescueed-email:v1:${row.type}:${row.id}`;
  if (data.aad !== expected) throw new Error("E-Mail-AAD stimmt nicht überein.");
  const key = keyBytes(process.env.EMAIL_PAYLOAD_KEY);
  if (key.length !== 32) throw new Error("EMAIL_PAYLOAD_KEY ungültig.");
  const bytes = Buffer.from(data.ciphertext, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(data.iv, "base64"));
  decipher.setAAD(Buffer.from(expected));
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString("utf8"));
  return data;
}
function euro(cents) { return (Number(cents || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }); }
function body(data) {
  const lines = [String(data.message || "")];
  if (data.template === "security_code") lines.push("", `Sicherheitscode: ${data.securityCode}`, `Gültig bis: ${data.expiresAt}`);
  if (data.template === "registration_link" || data.template === "password_link") {
    const mode = data.template === "registration_link" ? "registration" : "reset";
    lines.push("", `${origin.origin}/password-reset?mode=${mode}&token=${encodeURIComponent(data.token)}`, `Gültig bis: ${data.expiresAt}`);
  }
  if (data.template === "order_confirmation") {
    lines.push("", `Bestellreferenz: ${data.orderReference}`, `Bestellt am: ${data.orderedAt}`, `Empfänger: ${data.recipientName}`);
    if (data.billingAddress) lines.push(`${data.billingAddress.street}, ${data.billingAddress.postalCode} ${data.billingAddress.city}`);
    if (data.event) lines.push(`Event: ${data.event.name}`, `Zeitraum: ${data.event.period}`, `Helferzahl: ${data.event.helperLimit}`);
    lines.push(`Leistung: ${data.service}`, `Netto: ${euro(data.pricing?.netCents)}`, `Umsatzsteuer (${data.pricing?.vatRatePercent || 0} %): ${euro(data.pricing?.vatCents)}`, `Gesamtbetrag: ${euro(data.pricing?.grossCents)}`, `Zahlungsart: ${data.paymentMethod}`, String(data.billingTiming || ""));
  }
  lines.push("", "---", String(data.signature || ""));
  return lines.join("\n");
}
function header(value) { if (/[\r\n]/.test(value)) throw new Error("Ungültiger E-Mail-Header."); return value; }
function message(row, data) {
  const from = header(row.sender_email), to = header(row.recipient_email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Ungültige E-Mail-Adresse.");
  const subject = `=?UTF-8?B?${Buffer.from(header(row.subject)).toString("base64")}?=`;
  const headers = [`From: RescueEd Alert <${from}>`, `To: <${to}>`, `Subject: ${subject}`, "MIME-Version: 1.0", `Date: ${new Date().toUTCString()}`, `Message-ID: <${row.id}@alert-rescueed.de>`];
  const text = body(data).replace(/\r?\n/g, "\r\n");
  if (!data.attachment) return [...headers, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(text).toString("base64").match(/.{1,76}/g).join("\r\n"), ""].join("\r\n");
  const attachment = data.attachment;
  if (attachment.contentType !== "application/pdf" || attachment.encoding !== "base64" || !/^[a-zA-Z0-9._-]+\.pdf$/.test(attachment.filename)) throw new Error("Ungültiger PDF-Anhang.");
  const boundary = `rescueed-${row.id.replace(/[^a-zA-Z0-9]/g, "")}`;
  return [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", ...Buffer.from(text).toString("base64").match(/.{1,76}/g), `--${boundary}`, `Content-Type: application/pdf; name="${attachment.filename}"`, `Content-Disposition: attachment; filename="${attachment.filename}"`, "Content-Transfer-Encoding: base64", "", ...(attachment.data.match(/.{1,76}/g) || []), `--${boundary}--`, ""].join("\r\n");
}
function send(account, content) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/msmtp", [`--file=${process.env.MSMTP_CONFIG}`, `--account=${account}`, "-t"], { stdio: ["pipe", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", chunk => { errors = (errors + chunk.toString()).slice(-500); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`msmtp exit ${code}: ${errors.replace(/[\r\n]/g, " ")}`)));
    child.stdin.end(content);
  });
}
// An interrupted send is ambiguous; do not resend it automatically.
db.prepare("UPDATE email_outbox SET status='failed' WHERE status='processing'").run();
const rows = db.prepare("SELECT * FROM email_outbox WHERE status='pending' ORDER BY created_at LIMIT 50").all();
for (const row of rows) {
  db.exec("BEGIN IMMEDIATE");
  const claimed = db.prepare("UPDATE email_outbox SET status='processing' WHERE id=? AND status='pending'").run(row.id).changes === 1;
  db.exec("COMMIT");
  if (!claimed) continue;
  try {
    if (row.sensitive_expires_at && row.sensitive_expires_at <= Date.now()) throw new Error("Sicherheits-E-Mail abgelaufen.");
    const account = row.sender_email.toLowerCase() === process.env.MAIL_FROM_MFA.toLowerCase() ? "mfa" : row.sender_email.toLowerCase() === process.env.MAIL_FROM_CONTACT.toLowerCase() ? "kontakt" : null;
    if (!account) throw new Error("Absender ist nicht freigegeben.");
    await send(account, message(row, payload(row)));
    db.prepare("UPDATE email_outbox SET status='sent', sent_at=?, payload_json='{}' WHERE id=? AND status='processing'").run(Date.now(), row.id);
    process.stdout.write(`E-Mail an SMTP übergeben: ${row.id}\n`);
  } catch (error) {
    db.prepare("UPDATE email_outbox SET status='failed', payload_json=CASE WHEN sensitive_expires_at IS NOT NULL AND sensitive_expires_at <= ? THEN '{}' ELSE payload_json END WHERE id=? AND status='processing'").run(Date.now(), row.id);
    process.stderr.write(`E-Mail-Auftrag fehlgeschlagen (${row.id}): ${error.message}\n`);
  }
}
db.close();
