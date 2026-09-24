import type {MetadataRoute} from "next";

const baseUrl="https://alert-rescueed.de";

export default function sitemap():MetadataRoute.Sitemap{
 return [
  {url:baseUrl,changeFrequency:"weekly",priority:1},
  {url:`${baseUrl}/rechtliches/impressum`,changeFrequency:"yearly",priority:0.2},
  {url:`${baseUrl}/rechtliches/datenschutz`,changeFrequency:"yearly",priority:0.2},
 ];
}
