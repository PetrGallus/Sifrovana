import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const sections = await readFile(new URL("../app/product-sections.tsx", import.meta.url), "utf8");

test("nákup zůstane zavřený, dokud živý katalog nepotvrdí cenu", () => {
  assert.match(page, /isCommerceCatalogVerified\(data, commerciallyReleasedRouteIds\)/);
  assert.match(page, /if \(catalogStatus !== "verified"\) return;/);
  assert.match(page, /const canBuy = playable && catalogStatus === "verified" && !ownershipLoading && !ownershipUnavailable;/);
  assert.match(page, /disabled=\{!purchaseAction \|\| ownershipLoading\}/);
  assert.match(sections, /const purchasable = published && catalogStatus === "verified";/);
  assert.match(sections, /disabled=\{!purchasable\}/);
});

test("výpadek katalogu ponechá čitelný obsah a zobrazí srozumitelný stav", () => {
  assert.match(page, /setCatalogStatus\("unavailable"\)/);
  assert.match(page, /Nákup je dočasně pozastavený/);
  assert.match(page, /Trasy si můžeš prohlížet/);
  assert.match(sections, /Trasu lze prohlížet; nákup se odemkne/);
  assert.match(page, /setCatalogRefreshKey\(\(current\) => current \+ 1\)/);
  assert.match(page, /Ověřit katalog znovu/);
  assert.match(page, /Ověřit cenu znovu/);
});
