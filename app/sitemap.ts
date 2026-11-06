import type { MetadataRoute } from "next";
import { resolveSiteUrl } from "../lib/site-url.js";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: resolveSiteUrl().href,
    changeFrequency: "weekly",
    priority: 1,
  }];
}
