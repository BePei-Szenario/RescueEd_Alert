import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:"/:path*",headers:[
    {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
    {key:"X-Content-Type-Options",value:"nosniff"},
    {key:"X-Frame-Options",value:"DENY"},
    {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
    {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
    {key:"Content-Security-Policy",value:"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests"}
  ]}]}
};

export default nextConfig;
