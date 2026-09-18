"use client";
import {useState,type InputHTMLAttributes} from "react";
import {Eye,EyeOff} from "lucide-react";
import "./password-field.css";

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,"type">;

export function PasswordField(props:Props){
 const [visible,setVisible]=useState(false);
 return <span className="password-field"><input {...props} type={visible?"text":"password"}/><button type="button" className="password-field-toggle" aria-label={visible?"Passwort verbergen":"Passwort anzeigen"} aria-pressed={visible} title={visible?"Passwort verbergen":"Passwort anzeigen"} onClick={()=>setVisible(value=>!value)}>{visible?<EyeOff size={18} aria-hidden="true"/>:<Eye size={18} aria-hidden="true"/>}</button></span>;
}
