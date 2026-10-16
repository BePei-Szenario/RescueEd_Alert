import {withImmediateTransaction} from "@/db";
import {currentUser} from "@/lib/session";
import {rejectCrossSiteMutation} from "@/lib/request-security";
import {consumeRateLimit, rateLimited} from "@/lib/rate-limit";
import {id, tokenHash} from "@/lib/security";
import {encryptEventAccessCode} from "@/lib/event-access-code-crypto";
import {additionalAccessRoles, insertMissingEventAccessCode, type AdditionalAccessRole} from "@/lib/add-event-access-code";

export async function POST(request: Request, {params}: {params: Promise<{eventId: string}>}) {
  const headers = {"cache-control": "no-store"};
  try {
    const bad = rejectCrossSiteMutation(request); if (bad) return bad;
    const user = await currentUser();
    if (!user) return Response.json({error: "Bitte zuerst anmelden."}, {status: 401, headers});
    const {eventId} = await params;
    const body = await request.json().catch(() => null) as {role?: unknown} | null;
    if (!body || typeof body.role !== "string" || !additionalAccessRoles.includes(body.role as AdditionalAccessRole)) return Response.json({error: "Bitte eine gültige Zugangsart auswählen."}, {status: 400, headers});
    const limit = await consumeRateLimit({scope: "event-access-create", subject: user.id, limit: 30, windowMs: 60_000});
    if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
    const role = body.role as AdditionalAccessRole, accessId = id("eac");
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = [...crypto.getRandomValues(new Uint8Array(8))].map(value => alphabet[value % alphabet.length]).join("");
    const hash = await tokenHash(code), encrypted = await encryptEventAccessCode(code, accessId, eventId, role);
    const result = withImmediateTransaction(connection => insertMissingEventAccessCode(connection, {eventId, userId: user.id, organizationId: user.organizationId, role, id: accessId, hash, encrypted}));
    if (result.status !== 201) return Response.json({error: result.error}, {status: result.status, headers});
    return Response.json({role, code, expiresAt: new Date(result.expiresAt!).toISOString()}, {status: 201, headers});
  } catch {
    return Response.json({error: "Zugangscode konnte nicht erstellt werden. Bitte erneut versuchen."}, {status: 500, headers});
  }
}
