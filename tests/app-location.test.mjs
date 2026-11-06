import assert from "node:assert/strict";
import test from "node:test";
import { buildAppSearch, parseAppLocation } from "../lib/app-location.ts";

const routeIds = ["brno-kralovo-pole-stopy", "brno-medlanky-pecet-parku"];
const fallback = routeIds[0];

test("přímý odkaz otevře platný detail konkrétní trasy", () => {
  assert.deepEqual(parseAppLocation("?view=detail&route=brno-medlanky-pecet-parku", routeIds, fallback), {
    view: "detail",
    routeId: "brno-medlanky-pecet-parku",
  });
});

test("neznámá obrazovka a trasa bezpečně spadnou na katalog a pilot", () => {
  assert.deepEqual(parseAppLocation("?view=javascript%3Aalert(1)&route=unknown", routeIds, fallback), {
    view: "discover",
    routeId: fallback,
  });
});

test("navigace zachová analytické parametry, ale odstraní jednorázový auth stav", () => {
  assert.equal(buildAppSearch("detail", routeIds[1], "?utm_source=test&auth=reset"), "?utm_source=test&view=detail&route=brno-medlanky-pecet-parku");
  assert.equal(buildAppSearch("discover", fallback, "?view=profile&route=x"), "");
});

test("herní a dokončovací URL nesou identitu trasy pro bezpečné obnovení", () => {
  assert.equal(buildAppSearch("game", routeIds[1]), "?view=game&route=brno-medlanky-pecet-parku");
  assert.equal(buildAppSearch("finish", fallback), "?view=finish&route=brno-kralovo-pole-stopy");
  assert.equal(buildAppSearch("library", fallback, "?view=game&route=x"), "?view=library");
});
