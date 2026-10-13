export const DUTY_INVITATION_TTL_MS = 24 * 60 * 60 * 1000;

/** @param {Date} now */
export function dutyInvitationExpiresAt(now) {
  return new Date(now.getTime() + DUTY_INVITATION_TTL_MS);
}

/** @param {string} token @param {string} baseUrl @param {boolean} allowLocal */
export function dutyInvitationUrl(token, baseUrl, allowLocal = false) {
  const base = new URL(baseUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/" ||
      (local ? !allowLocal || !["http:", "https:"].includes(base.protocol) : base.protocol !== "https:")) {
    throw new Error("PUBLIC_BASE_URL muss eine öffentliche HTTPS-Origin sein.");
  }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Ungültiger Einladungstoken.");
  return `${base.origin}/dienstplan/${token}`;
}

// Rebuild legacy queued URLs against the configured public origin, never their saved host.
/** @param {string} savedUrl @param {string} baseUrl */
export function canonicalDutyInvitationUrl(savedUrl, baseUrl) {
  const match = new URL(savedUrl).pathname.match(/^\/dienstplan\/([a-f0-9]{64})$/);
  if (!match) throw new Error("Ungültiger Einladungslink.");
  return dutyInvitationUrl(match[1], baseUrl);
}
