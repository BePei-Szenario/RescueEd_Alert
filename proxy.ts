import {NextRequest,NextResponse} from "next/server";

const SECURITY_HEADERS={
 "Content-Security-Policy":"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests",
 "Cross-Origin-Opener-Policy":"same-origin",
 "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
 "Referrer-Policy":"strict-origin-when-cross-origin",
 "Strict-Transport-Security":"max-age=63072000; includeSubDomains",
 "X-Content-Type-Options":"nosniff",
 "X-Frame-Options":"DENY"
} as const;

export function proxy(request:NextRequest){
 const response=NextResponse.next();
 for(const [name,value] of Object.entries(SECURITY_HEADERS))response.headers.set(name,value);
 if(/^\/api\/legal-documents\/[^/]+\/pdf$/.test(request.nextUrl.pathname)){
  response.headers.set("X-Frame-Options","SAMEORIGIN");
  response.headers.set("Content-Security-Policy","default-src 'none'; frame-ancestors 'self'");
 }
 return response;
}

export const config={matcher:"/:path*"};
