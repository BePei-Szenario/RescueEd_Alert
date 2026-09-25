import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:"/:path*",headers:[
    {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
    {key:"X-Content-Type-Options",value:"nosniff"},
    {key:"X-Frame-Options",value:"DENY"},
    {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
    {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
    {key:"Content-Security-Policy",value:"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'self' blob:; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests"}
  ]},{source:"/api/legal-documents/:slug/pdf",headers:[
    {key:"X-Frame-Options",value:"SAMEORIGIN"},
    {key:"Content-Security-Policy",value:"default-src 'none'; frame-ancestors 'self'"}
  ]}]}
};

export default nextConfig;
