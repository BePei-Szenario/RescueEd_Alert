import {activeMobileHelper} from "@/lib/mobile-helper-session";
import {currentUser} from "@/lib/session";

export async function supportPrincipal(request:Request,eventId?:string|null){
 const user=await currentUser();
 if(user)return {type:"user" as const,id:user.id,eventId:null};
 if(eventId&&eventId.length<=100){
  const helper=await activeMobileHelper(request,eventId);
  if(helper)return {type:"helper" as const,id:helper.helperId,eventId:helper.eventId};
 }
 return null;
}
