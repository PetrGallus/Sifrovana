import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canPurchasePublishedRoute, canStartPublishedGame } from "../lib/route-playability.ts";

test("do herního režimu pustí jen aktivní publikovaný pilot", () => {
  const publishedRouteId = "brno-kralovo-pole-stopy";
  const releasedRouteIds = [publishedRouteId];
  assert.equal(canStartPublishedGame({ id: publishedRouteId, status: "active" }, releasedRouteIds), true);
  assert.equal(canStartPublishedGame({ id: publishedRouteId, status: "coming" }, releasedRouteIds), false);
  assert.equal(canStartPublishedGame({ id: "brno-medlanky-pecet-parku", status: "active" }, releasedRouteIds), false);
  assert.equal(canStartPublishedGame(undefined, releasedRouteIds), false);
});

test("checkout používá stejnou explicitní release bránu jako hra", () => {
  const publishedRouteId = "brno-kralovo-pole-stopy";
  const releasedRouteIds = [publishedRouteId];
  assert.equal(canPurchasePublishedRoute({ id: publishedRouteId, status: "active" }, releasedRouteIds), true);
  assert.equal(canPurchasePublishedRoute({ id: "brno-stred-pod-povrchem", status: "active" }, releasedRouteIds), false);
  assert.equal(canPurchasePublishedRoute({ id: publishedRouteId, status: "coming" }, releasedRouteIds), false);
  assert.equal(canPurchasePublishedRoute({ id: "brno-stred-pod-povrchem", status: "active" }, [...releasedRouteIds, "brno-stred-pod-povrchem"]), true);
});

test("sezónní release je dostupný jen uvnitř publikovaného okna", () => {
  const route = { id: "vanoce", status: "seasonal", availableFrom: "2026-12-01", availableTo: "2027-01-06" };
  assert.equal(canPurchasePublishedRoute(route, [route.id], "2026-11-30"), false);
  assert.equal(canPurchasePublishedRoute(route, [route.id], "2026-12-24"), true);
  assert.equal(canStartPublishedGame(route, [route.id], "2027-01-07"), false);
  assert.equal(canPurchasePublishedRoute({ id: route.id, status: "seasonal" }, [route.id], "2026-12-24"), false);
});

test("karty, mapa, detail a checkout sdílejí konkrétní selectedRouteId", async () => {
  const [page, marketplace] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-sections.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const \[selectedRouteId, setSelectedRouteId\]/);
  assert.match(page, /onDetail=\{\(\) => onDetail\(route\)\}/);
  assert.match(page, /<CityRouteMap[\s\S]{0,180}onDetail=\{onDetail\}/);
  assert.match(page, /startGame\(selectedRoute\.id\)/);
  assert.match(page, /const ownsRequestedRoute = [^;]+ownedRouteIds\.includes\(requestedRoute\.id\)/);
  assert.match(page, /if \(!ownsRequestedRoute\)/);
  assert.match(page, /Čeká na terénní ověření/);
  assert.match(page, /canPurchasePublishedRoute/);
  assert.match(page, /commerciallyReleasedRouteIds/);
  assert.match(page, /commerciallyReleasedBundleIds\.includes\(bundle\.id\)/);
  assert.match(page, /ownedPlayableRoutes/);
  assert.doesNotMatch(page, /<RouteDetail route=\{pilotRouteSummary\}/);
  assert.match(marketplace, /onDetail: \(route: RouteSummary\) => void/);
  assert.match(marketplace, /onDetail\(selected\)/);
  assert.match(marketplace, /canPurchasePublishedRoute\(selected, releasedRouteIds\)/);
  assert.doesNotMatch(marketplace, /selected\.status === "active"/);
});
