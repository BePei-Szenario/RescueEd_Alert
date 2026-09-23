import type {MetadataRoute} from "next";

export default function robots():MetadataRoute.Robots{
 return {
  rules:{
   userAgent:"*",
   allow:["/", "/rechtliches/impressum", "/rechtliches/datenschutz"],
   disallow:[
    "/api/",
    "/event-attendance",
    "/password-reset",
    "/passwort-vergessen",
    "/profil",
    "/support",
    "/unternehmer/",
    "/rechtliches/aktualisierung",
   ],
  },
  sitemap:"https://alert-rescueed.de/sitemap.xml",
  host:"https://alert-rescueed.de",
 };
}
