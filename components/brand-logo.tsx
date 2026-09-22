import Image from "next/image";

export function RescueEdLogo({className=""}:{className?:string}){
 return <Image className={`brand-logo ${className}`.trim()} src="/rescueed-alert-logo.png" width={512} height={512} alt="RescueEd Alert Logo" priority/>;
}
