export const fallbackSiteUrl = "https://sifrovana-mestska-hra.galluspeginpetr.chatgpt.site";

export function resolveSiteUrl(configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
  if (!configuredUrl) return new URL(fallbackSiteUrl);

  try {
    const siteUrl = new URL(configuredUrl);
    if (siteUrl.protocol === "https:" || siteUrl.hostname === "localhost" || siteUrl.hostname === "127.0.0.1") {
      return siteUrl;
    }
  } catch {
    // A malformed build-time value must not make metadata generation fail.
  }

  return new URL(fallbackSiteUrl);
}
