export function rejectCrossSiteMutation(request:Request){
 const origin=request.headers.get("origin");
 // Next.js can normalize request.url to localhost even when the browser used
 // 127.0.0.1. Caddy overwrites X-Forwarded-Proto and preserves the public Host.
 const url=new URL(request.url);
 const host=request.headers.get("host")?.trim()||url.host;
 const protocol=request.headers.get("x-forwarded-proto")?.trim().toLowerCase()||url.protocol.slice(0,-1);
 if(!["http","https"].includes(protocol)||!host||origin&&origin!==`${protocol}://${host}`)return Response.json({error:"Ungültige Anfragequelle."},{status:403});
 const fetchSite=request.headers.get("sec-fetch-site")?.toLowerCase();
 if(fetchSite==="cross-site")return Response.json({error:"Ungültige Anfragequelle."},{status:403});
 const mediaType=request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase();
 if(request.method!=="GET"&&mediaType!=="application/json")return Response.json({error:"JSON erforderlich."},{status:415});
 return null;
}
