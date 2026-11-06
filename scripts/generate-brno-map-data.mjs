import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const districtSource = "https://services6.arcgis.com/fUWVlHWZNxUvTUh8/arcgis/rest/services/hranice_mc/FeatureServer/0";
const waterSource = "https://services6.arcgis.com/fUWVlHWZNxUvTUh8/arcgis/rest/services/vodni_toky_opendata/FeatureServer/0";
const districtCatalogUrl = "https://data.gov.cz/datov%C3%A1-sada?iri=https://data.gov.cz/zdroj/datov%C3%A9-sady/44992785/916e8f0d886385be2d8b08e4a5b86067";
const waterCatalogUrl = "https://data.gov.cz/datov%C3%A1-sada?iri=https://data.gov.cz/zdroj/datov%C3%A9-sady/44992785/017158621a74c39f2a2fb2eac5472502";

function queryUrl(source, outFields, maxAllowableOffset) {
  const url = new URL(`${source}/query`);
  url.search = new URLSearchParams({
    where: "1=1",
    outFields,
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
    maxAllowableOffset,
    geometryPrecision: "5",
  }).toString();
  return url;
}

const districtUrl = queryUrl(districtSource, "kod,nazev,datum_exportu", "0.00035");
const waterUrl = queryUrl(waterSource, "idvt,naz_tok,datum_exportu", "0.0003");
const [districtResponse, waterResponse] = await Promise.all([
  fetch(districtUrl, { headers: { Accept: "application/geo+json,application/json" } }),
  fetch(waterUrl, { headers: { Accept: "application/geo+json,application/json" } }),
]);

if (!districtResponse.ok) {
  throw new Error(`GIS Brno (hranice) odpovědělo ${districtResponse.status} ${districtResponse.statusText}.`);
}
if (!waterResponse.ok) {
  throw new Error(`GIS Brno (vodní toky) odpovědělo ${waterResponse.status} ${waterResponse.statusText}.`);
}

const [districts, water] = await Promise.all([districtResponse.json(), waterResponse.json()]);
if (districts?.type !== "FeatureCollection" || !Array.isArray(districts.features)) {
  throw new Error("GIS Brno nevrátilo očekávanou GeoJSON FeatureCollection hranic.");
}
if (water?.type !== "FeatureCollection" || !Array.isArray(water.features)) {
  throw new Error("GIS Brno nevrátilo očekávanou GeoJSON FeatureCollection vodních toků.");
}
if (districts.features.length !== 29) {
  throw new Error(`Očekáváno 29 městských částí, přijato ${districts.features.length}.`);
}

for (const feature of districts.features) {
  if (feature?.type !== "Feature" || feature?.geometry?.type !== "Polygon") {
    throw new Error("Vrstva hranic obsahuje jinou geometrii než Polygon.");
  }
  if (!feature.properties?.kod || !feature.properties?.nazev) {
    throw new Error("Ve vrstvě hranic chybí kód nebo název městské části.");
  }
  feature.properties.nazev_kratky = feature.properties.nazev.replace(/^Brno-/, "");
}

for (const feature of water.features) {
  if (feature?.type !== "Feature" || !["LineString", "MultiLineString"].includes(feature?.geometry?.type)) {
    throw new Error("Vrstva vodních toků obsahuje neočekávanou geometrii.");
  }
}

districts.features.sort((a, b) => a.properties.nazev.localeCompare(b.properties.nazev, "cs"));

const districtExportDate = districts.features[0]?.properties?.datum_exportu ?? null;
const waterExportDate = water.features[0]?.properties?.datum_exportu ?? null;
const artifact = {
  ...districts,
  waterFeatures: water.features,
  metadata: {
    title: "Městské části a vodní toky statutárního města Brna",
    source: "Statutární město Brno – otevřená data",
    sourceUrl: districtCatalogUrl,
    districtSourceUrl: districtCatalogUrl,
    waterSourceUrl: waterCatalogUrl,
    districtServiceUrl: districtSource,
    waterServiceUrl: waterSource,
    licenseName: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    cadastralSource: `ČÚZK, ${districtExportDate?.slice(0, 4) ?? "2026"}`,
    cadastralTermsUrl: "https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-prostorovych-dat-CUZK.aspx",
    coordinateSystem: "WGS84 (EPSG:4326)",
    snapshotDate: districtExportDate,
    districtSnapshotDate: districtExportDate,
    waterSnapshotDate: waterExportDate,
    note: "Geometrie byla pro rychlou webovou mapu zjednodušena; nejde o navigační podklad.",
  },
};

const outputPath = fileURLToPath(new URL("../lib/brno-districts.json", import.meta.url));
await writeFile(outputPath, `${JSON.stringify(artifact)}\n`, "utf8");
console.log(`Uloženo ${districts.features.length} městských částí a ${water.features.length} vodních toků do ${outputPath}.`);
