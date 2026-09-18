import {redirect} from "next/navigation";
import {currentUser} from "@/lib/session";
import {SupportClient} from "./support-client";
import "./support.css";

export const dynamic="force-dynamic";
export default async function SupportPage(){
 const user=await currentUser();if(!user)redirect("/");
 return <SupportClient name={user.fullName}/>;
}
