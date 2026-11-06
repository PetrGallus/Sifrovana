import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("mapový snapshot obsahuje všech 29 MČ a otevřenou licenci", async () => {
  const map = JSON.parse(await readFile(new URL("lib/brno-districts.json", root), "utf8"));
  assert.equal(map.type, "FeatureCollection");
  assert.equal(map.features.length, 29);
  assert.ok(map.features.every((feature) => feature.geometry.type === "Polygon"));
  assert.ok(map.features.some((feature) => feature.properties.nazev === "Brno-Královo Pole"));
  assert.equal(map.metadata.licenseName, "CC BY 4.0");
  assert.match(map.metadata.coordinateSystem, /WGS84/);
  assert.ok(/^20\d{2}-\d{2}-\d{2}$/.test(map.metadata.snapshotDate));
  assert.ok(/^20\d{2}-\d{2}-\d{2}$/.test(map.metadata.districtSnapshotDate));
  assert.ok(/^20\d{2}-\d{2}-\d{2}$/.test(map.metadata.waterSnapshotDate));
  assert.equal("generatedAt" in map.metadata, false);
  assert.ok(map.features.some((feature) => feature.properties.nazev === "Brno-Řečkovice a Mokrá Hora"));
  assert.match(map.metadata.source, /Statutární město Brno/);
  assert.match(map.metadata.districtSourceUrl, /data\.gov\.cz/);
  assert.match(map.metadata.waterSourceUrl, /data\.gov\.cz/);
  assert.notEqual(map.metadata.districtSourceUrl, map.metadata.waterSourceUrl);
});

test("mapový snapshot obsahuje skutečné hlavní vodní toky", async () => {
  const map = JSON.parse(await readFile(new URL("lib/brno-districts.json", root), "utf8"));
  const names = new Set(map.waterFeatures.map((feature) => String(feature.properties.naz_tok).trim()));
  assert.ok(names.has("Svratka"));
  assert.ok(names.has("Svitava"));
  assert.ok(names.has("Ponávka"));
});

test("veřejná mapa používá WGS84 projekci a neslibuje přesnou odemčenou trasu", async () => {
  const component = await readFile(new URL("app/brno-illustrated-map.tsx", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const marketplace = await readFile(new URL("app/product-sections.tsx", root), "utf8");
  assert.match(component, /LONGITUDE_SCALE/);
  assert.match(component, /přesná cesta se odhaluje ve hře/i);
  assert.match(component, /Hranice MČ/);
  assert.match(component, /vodní toky/);
  assert.match(page, /Geograficky věrná ilustrovaná mapa Brna/);
  assert.match(marketplace, /<BrnoIllustratedMap/);
  assert.doesNotMatch(marketplace, /className="map-river/);
  assert.doesNotMatch(marketplace, /className={`district-pin/);
});
