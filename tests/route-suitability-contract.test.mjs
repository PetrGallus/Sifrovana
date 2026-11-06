import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [helper, routeContent, routePortfolio, page, routeCatalog, productSections, cms, publishedGame, migration] = await Promise.all([
  readFile(new URL("../lib/route-suitability.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/route-content.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/route-portfolio.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/route-catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/product-sections.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/route-cms.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/supabase/published-game.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20261105223442_add_route_suitability_and_northern_portfolio.sql", import.meta.url), "utf8"),
]);

test("derives stable time badges from the maximum route duration", () => {
  assert.match(helper, /durationMaxMinutes <= 60/);
  assert.match(helper, /durationMaxMinutes <= 120/);
  assert.match(helper, /label: "Do 1 h"/);
  assert.match(helper, /label: "Do 2 h"/);
  assert.match(helper, /label: "2 h\+"/);
});

test("keeps stroller and preschool suitability explicit and conservative", () => {
  assert.match(helper, /RouteStrollerStatus = "verified" \| "not_recommended" \| "unknown"/);
  assert.match(helper, /RoutePreschoolStatus = "suitable" \| "with_adult" \| "not_recommended" \| "unknown"/);
  assert.match(helper, /Kočárek: ověřujeme/);
  assert.match(helper, /Předškoláci: ověřujeme/);
  assert.match(routeContent, /strollerStatus: "unknown"/);
  assert.match(routeContent, /preschoolStatus: "unknown"/);
});

test("propagates route badges through catalogue, map, CMS, and published game", () => {
  assert.match(page, /PUBLIC_ROUTE_CATALOG_SELECT/);
  assert.match(routeCatalog, /duration_min_minutes,duration_max_minutes,stroller_status,preschool_status/);
  assert.match(page, /<RouteSuitabilityBadges/);
  assert.match(productSections, /<RouteSuitabilityBadges/);
  assert.match(cms, /stroller_status: RouteStrollerStatus/);
  assert.match(cms, /preschool_status: RoutePreschoolStatus/);
  assert.match(cms, /value={route\.stroller_status}/);
  assert.match(cms, /value={route\.preschool_status}/);
  assert.match(publishedGame, /strollerStatus: normalizeStrollerStatus\(route\.stroller_status\)/);
  assert.match(publishedGame, /preschoolStatus: normalizePreschoolStatus\(route\.preschool_status\)/);
});

test("route counts are calculated from the current catalogue", () => {
  assert.match(page, /const activeRouteCount = routesForSale\.filter/);
  assert.match(page, /const upcomingRouteCount = routesForSale\.filter\(\(route\) => route\.status === "coming"\)\.length/);
  assert.match(page, /const seasonalRouteCount = routesForSale\.filter\(\(route\) => route\.status === "seasonal"\)\.length/);
  assert.doesNotMatch(page, /<span className="route-count">1 aktivní · 2 připravujeme<\/span>/);
});

test("portfolio contains nine district routes and three seasonal concepts", () => {
  const ids = [...routePortfolio.matchAll(/^\s{4}id: "([^"]+)",$/gm)].map((match) => match[1]);
  assert.equal(ids.length, 12);
  assert.equal(ids.filter((id) => id.startsWith("brno-medlanky-")).length, 3);
  assert.equal(ids.filter((id) => id.startsWith("brno-reckovice-") || id === "brno-mokra-hora-ponavka").length, 3);
  assert.equal(ids.filter((id) => id.startsWith("brno-cerna-pole-")).length, 3);
  assert.equal(ids.filter((id) => id.startsWith("brno-vanoce-")).length, 3);
  assert.match(routeContent, /\.\.\.northernAndSeasonalRoutes/);
});

test("CMS migration stores suitability and blocks unknown values from publication", () => {
  assert.match(migration, /add column stroller_status/);
  assert.match(migration, /add column preschool_status/);
  assert.match(migration, /add column duration_min_minutes/);
  assert.match(migration, /route\.stroller_status = 'unknown'/);
  assert.match(migration, /route\.preschool_status = 'unknown'/);
  assert.match(migration, /v_route\.stroller_status, v_route\.preschool_status/);
  assert.match(migration, /stroller_status = excluded\.stroller_status/);
  assert.match(migration, /preschool_status = excluded\.preschool_status/);
});
