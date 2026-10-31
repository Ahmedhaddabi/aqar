import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/config";

// Search and AI crawlers (incl. OAI-SearchBot, §15.2) may index public pages; private paths are excluded.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/doc/", "/portal", "/ar/my-request", "/en/my-request"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
