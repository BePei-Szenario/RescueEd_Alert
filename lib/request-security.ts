export function rejectCrossSiteMutation(request:Request){
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Ungültige Anfragequelle."},{status:403});
 const fetchSite=request.headers.get("sec-fetch-site")?.toLowerCase();
 if(fetchSite==="cross-site")return Response.json({error:"Ungültige Anfragequelle."},{status:403});
 const mediaType=request.headers.get("content-type")?.split(";",1)[0].trim().toLowerCase();
 if(request.method!=="GET"&&mediaType!=="application/json")return Response.json({error:"JSON erforderlich."},{status:415});
 return null;
}
