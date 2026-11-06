import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule() {
  const helperSource = await readFile(new URL("../lib/route-suitability.ts", import.meta.url), "utf8");
  const helperJavaScript = ts.transpileModule(helperSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const helperUrl = `data:text/javascript;base64,${Buffer.from(helperJavaScript).toString("base64")}`;

  const adapterSource = (await readFile(new URL("../lib/route-catalog.ts", import.meta.url), "utf8"))
    .replace('from "./route-suitability"', `from "${helperUrl}"`);
  const adapterJavaScript = ts.transpileModule(adapterSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(adapterJavaScript).toString("base64")}`);
}

const { mergePublicCatalogRoutes, PUBLIC_ROUTE_CATALOG_SELECT } = await importTypeScriptModule();

const fallback = {
  id: "brno-test",
  district: "Královo Pole",
  title: "Původní titul",
  tagline: "Původní perex",
  price: 449,
  distance: 4.1,
  duration: "90–120 min",
  durationMinMinutes: 90,
  durationMaxMinutes: 120,
  strollerStatus: "unknown",
  preschoolStatus: "with_adult",
  difficulty: "Střední",
  checkpoints: 5,
  status: "active",
  accent: "orange",
  available: "nyní",
  mapX: 47,
  mapY: 18,
};

test("valid catalogue values replace their static fallback", () => {
  const [route] = mergePublicCatalogRoutes([fallback], [{
    id: fallback.id,
    title: "Nový titul",
    price_czk: "399",
    distance_km: 5.25,
    duration_min_minutes: 60,
    duration_max_minutes: 75,
    stroller_status: "verified",
    preschool_status: "suitable",
    checkpoint_count: 7,
    status: "seasonal",
    accent: "teal",
    available_from: "2026-12-01",
    available_to: "2027-01-06",
    map_x: 0,
    map_y: 100,
  }]);

  assert.equal(route.title, "Nový titul");
  assert.equal(route.mapDistrict, fallback.district);
  assert.equal(route.price, 399);
  assert.equal(route.distance, 5.25);
  assert.equal(route.duration, "60–75 min");
  assert.equal(route.strollerStatus, "verified");
  assert.equal(route.preschoolStatus, "suitable");
  assert.equal(route.checkpoints, 7);
  assert.equal(route.status, "seasonal");
  assert.equal(route.accent, "teal");
  assert.equal(route.availableFrom, "2026-12-01");
  assert.equal(route.availableTo, "2027-01-06");
  assert.equal(route.mapX, 0);
  assert.equal(route.mapY, 100);
});

test("null, empty and invalid CMS fields fall back independently", () => {
  const [route] = mergePublicCatalogRoutes([fallback], [{
    id: fallback.id,
    district: null,
    title: "   ",
    tagline: false,
    price_czk: null,
    distance_km: "not-a-number",
    duration_min_minutes: 150,
    duration_max_minutes: 20,
    stroller_status: "yes",
    preschool_status: "maybe",
    difficulty: null,
    checkpoint_count: 3.5,
    status: "published",
    accent: "javascript:alert(1)",
    map_x: -1,
    map_y: 101,
    available_text: "",
  }]);

  assert.deepEqual(route, { ...fallback, mapDistrict: fallback.district, availableFrom: undefined, availableTo: undefined });
  assert.notEqual(route.title, "null");
  assert.notEqual(route.price, 0);
});

test("unknown records and malformed payloads never add or remove static routes", () => {
  const second = { ...fallback, id: "brno-two", title: "Druhá" };
  assert.deepEqual(mergePublicCatalogRoutes([fallback, second], null), [fallback, second]);
  assert.deepEqual(mergePublicCatalogRoutes([fallback, second], [null, [], { id: "unknown", title: "Cizí" }]), [fallback, second]);
});

test("legacy single duration remains supported without coercing empty values to zero", () => {
  const [legacy] = mergePublicCatalogRoutes([fallback], [{ id: fallback.id, duration_minutes: "80" }]);
  assert.equal(legacy.durationMinMinutes, 80);
  assert.equal(legacy.durationMaxMinutes, 80);
  assert.equal(legacy.duration, "80 min");

  const [empty] = mergePublicCatalogRoutes([fallback], [{ id: fallback.id, duration_minutes: "" }]);
  assert.equal(empty.duration, fallback.duration);
});

test("select contract contains every field consumed by the adapter", () => {
  for (const field of ["id", "price_czk", "duration_min_minutes", "duration_max_minutes", "stroller_status", "preschool_status", "available_text", "available_from", "available_to"]) {
    assert.ok(PUBLIC_ROUTE_CATALOG_SELECT.split(",").includes(field));
  }
});

test("neplatná nebo neexistující kalendářní data se do katalogu nepropíšou", () => {
  const [route] = mergePublicCatalogRoutes([fallback], [{ id: fallback.id, available_from: "2026-02-30", available_to: "javascript:alert(1)" }]);
  assert.equal(route.availableFrom, undefined);
  assert.equal(route.availableTo, undefined);
});
