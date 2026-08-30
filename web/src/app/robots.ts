import type { MetadataRoute } from "next";
import { SITE_URL, SITEMAP_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: SITEMAP_URL,
    host: SITE_URL,
  };
}
