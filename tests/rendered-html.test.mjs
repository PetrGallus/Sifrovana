import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the branded Šifrovaná pilot", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Šifrovaná — Město je šifra<\/title>/i);
  assert.match(html, /Město není kulisa/);
  assert.match(html, /Vyber si svou výpravu/);
  assert.match(html, /Mapa městských částí Brna/);
  assert.doesNotMatch(html, /Rozkládáme mapu/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("contains the versioned local-first route model", async () => {
  const [page, routeContent, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/route-content.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type RouteProgress =/);
  assert.match(page, /const storageKey = "sifrovana-demo-v1"/);
  assert.match(page, /Město není kulisa/);
  assert.match(page, /Stopy proměny/);
  assert.match(page, /Jak se hraje Šifrovaná/);
  assert.match(routeContent, /export type City =/);
  assert.match(routeContent, /export type RouteProduct =/);
  assert.match(routeContent, /export type RouteLifecycle =/);
  assert.match(routeContent, /version: string/);
  assert.match(routeContent, /audience: RouteAudience\[\]/);
  assert.match(routeContent, /language: "cs"/);
  assert.match(routeContent, /accessibilityNote: string/);
  assert.match(routeContent, /safetyNote: string/);
  assert.match(routeContent, /lastFieldCheck: string \| null/);
  assert.match(routeContent, /sourceRefs: SourceRef\[\]/);
  assert.doesNotMatch(routeContent, /accepted_answers|fallback_answers|answers:\s*\[/);
  assert.doesNotMatch(page, /getRouteCheckpoints|puzzle\.answers|fallback\.answers/);
  assert.match(page, /usePublishedGame\(auth\.user\?\.id \?\? null\)/);
  assert.match(page, /submitAnswer\(/);
  assert.match(routeContent, /price: 449/);
  assert.match(routeContent, /price: 999/);
  assert.doesNotMatch(routeContent, /xpReward/);
  assert.doesNotMatch(page, /1 284 průzkumníků|10 \/ tras/);
  assert.match(page, /Místo nejde přečíst\? Použít záložní otázku/);
  assert.match(layout, /images: \[\{ url: "\/og\.png"/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", templateRoot)));
});

test("keeps map navigation provider-neutral and reveals only the current checkpoint", async () => {
  const [mapComponent, mapLinks, cms] = await Promise.all([
    readFile(new URL("../app/checkpoint-map.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/map-links.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/route-cms.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(mapComponent, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(mapComponent, /zobrazen je pouze aktuální bod/);
  assert.match(mapComponent, /Navigovat v Mapy\.com/);
  assert.match(mapComponent, /Google Maps/);
  assert.match(mapLinks, /mapy\.com\/fnc\/v1\/route\?end=/);
  assert.match(mapLinks, /www\.google\.com\/maps\/dir\/\?api=1/);
  assert.match(mapLinks, /openstreetmap\.org\/export\/embed\.html/);
  assert.match(cms, /Zkontrolovat v Mapy\.com/);
  assert.match(cms, /Zkontrolovat v Google Maps/);
});
