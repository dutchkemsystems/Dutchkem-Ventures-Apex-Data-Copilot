import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://apex.dutchkemventures.com";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/jobs/", "/blog/"],
        disallow: ["/dashboard", "/settings", "/api/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
