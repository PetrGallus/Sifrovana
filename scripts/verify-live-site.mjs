import { pathToFileURL } from "node:url";

const maximumAssets = 60;
const maximumAssetBytes = 6 * 1024 * 1024;

function normalizeHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} není platná URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${label} musí být HTTPS URL bez přihlašovacích údajů.`);
  }
  return url;
}

export function discoverJavaScriptUrls(content, baseUrl, siteOrigin) {
  const urls = new Set();
  const patterns = [
    /<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi,
    /["']([^"'\s]+\.js(?:\?[^"']*)?)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      try {
        const candidate = new URL(match[1], baseUrl);
        if (candidate.origin === siteOrigin && candidate.pathname.startsWith("/_next/static/")) {
          candidate.hash = "";
          urls.add(candidate.href);
        }
      } catch {
        // Malformed strings inside minified bundles are not navigation targets.
      }
    }
  }
  return urls;
}

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Živý release vrátil HTTP ${response.status}: ${url}`);
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumAssetBytes) {
    throw new Error(`Klientský asset je pro bezpečné ověření příliš velký: ${url}`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > maximumAssetBytes) {
    throw new Error(`Klientský asset je pro bezpečné ověření příliš velký: ${url}`);
  }
  return text;
}

export async function verifyLiveSite({
  siteUrl,
  supabaseUrl,
  fetchImpl = fetch,
} = {}) {
  const site = normalizeHttpsUrl(siteUrl, "Adresa webu");
  const supabase = normalizeHttpsUrl(supabaseUrl, "Supabase URL");
  site.searchParams.set("release_verify", `${Date.now()}`);

  const html = await fetchText(fetchImpl, site.href);
  if (html.includes(supabase.href.replace(/\/$/, ""))) {
    return { assetCount: 0, siteHost: site.hostname, supabaseHost: supabase.hostname };
  }

  const queue = [...discoverJavaScriptUrls(html, site.href, site.origin)];
  const visited = new Set();
  while (queue.length > 0 && visited.size < maximumAssets) {
    const assetUrl = queue.shift();
    if (!assetUrl || visited.has(assetUrl)) continue;
    visited.add(assetUrl);
    const content = await fetchText(fetchImpl, assetUrl);
    if (content.includes(supabase.href.replace(/\/$/, ""))) {
      return {
        assetCount: visited.size,
        siteHost: site.hostname,
        supabaseHost: supabase.hostname,
      };
    }
    for (const discovered of discoverJavaScriptUrls(content, assetUrl, site.origin)) {
      if (!visited.has(discovered)) queue.push(discovered);
    }
  }
  throw new Error(
    `Živý klient neobsahuje očekávanou Supabase konfiguraci po kontrole ${visited.size} assetů.`,
  );
}

function parseCli(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!value || !["--url", "--supabase-url"].includes(flag)) {
      throw new Error("Použití: node scripts/verify-live-site.mjs --url HTTPS_URL [--supabase-url HTTPS_URL]");
    }
    options[flag] = value;
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseCli(process.argv.slice(2));
    const result = await verifyLiveSite({
      siteUrl: options["--url"] ?? process.env.NEXT_PUBLIC_SITE_URL,
      supabaseUrl: options["--supabase-url"] ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    });
    console.log(
      `Živý release ověřen: ${result.siteHost} → ${result.supabaseHost}; načteno ${result.assetCount} klientských assetů.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Živý release nelze ověřit.");
    process.exitCode = 1;
  }
}
