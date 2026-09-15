export function rejectCrossSiteMutation(request:Request){
 const origin=request.headers.get("origin");
 if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"Ungültige Anfragequelle."},{status:403});
 if(request.method!=="GET"&&!request.headers.get("content-type")?.toLowerCase().includes("application/json"))return Response.json({error:"JSON erforderlich."},{status:415});
 return null;
}
