import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveCurrentRouteOwnership } from "../lib/route-ownership.ts";

const root = new URL("../", import.meta.url);

test("vlastnictví se zveřejní jen pro shodného uživatele a ověřený stav", () => {
  const verified = resolveCurrentRouteOwnership(
    { userId: "user-a", status: "verified", routeIds: ["route-a"] },
    "user-a",
    false,
  );
  assert.deepEqual(verified, { status: "verified", routeIds: ["route-a"], checkRequired: true });

  const stale = resolveCurrentRouteOwnership(
    { userId: "user-a", status: "verified", routeIds: ["route-a"] },
    "user-b",
    false,
  );
  assert.deepEqual(stale, { status: "loading", routeIds: [], checkRequired: true });

  const failed = resolveCurrentRouteOwnership(
    { userId: "user-b", status: "unavailable", routeIds: ["route-a"] },
    "user-b",
    false,
  );
  assert.deepEqual(failed, { status: "unavailable", routeIds: [], checkRequired: true });
});

test("superadmin zůstává nezávislý na výsledku běžného ownership dotazu", () => {
  assert.deepEqual(
    resolveCurrentRouteOwnership(
      { userId: "admin", status: "unavailable", routeIds: [] },
      "admin",
      true,
    ),
    { status: "verified", routeIds: [], checkRequired: false },
  );
});

test("načtení vlastnictví je tagované userId, fail-closed a odolné vůči opožděné odpovědi", async () => {
  const source = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(source, /useState<RouteOwnershipState>\(\{\s*userId: null,\s*status: "unavailable",\s*routeIds: \[\]/);
  assert.match(source, /const requestId = \+\+ownershipRequest\.current/);
  assert.match(source, /setRouteOwnership\(\{ userId, status: "loading", routeIds: \[\] \}\)/);
  assert.match(source, /if \(requestId !== ownershipRequest\.current\) return;\s*if \(error\) throw error;/);
  assert.match(source, /setRouteOwnership\(\{ userId, status: "verified", routeIds \}\)/);
  assert.match(source, /requestId === ownershipRequest\.current[\s\S]{0,120}status: "unavailable"/);
});

test("neověřený stav nenabízí nákup ani falešně prázdnou knihovnu a má explicitní retry", async () => {
  const source = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.ok((source.match(/currentOwnership\.checkRequired && currentOwnership\.status !== "verified"/g) ?? []).length >= 2);
  assert.match(source, /ownershipLoading \?[\s\S]{0,500}Ověřujeme tvoje trasy[\s\S]{0,500}: ownershipUnavailable \?[\s\S]{0,500}Tvoje trasy teď neumíme ověřit[\s\S]{0,500}: ownedRoutes\.length === 0 \?/);
  assert.match(source, /ownershipUnavailable[\s\S]{0,500}Znovu ověřit nákupy/);
  assert.match(source, /Zkontrolovat nové nákupy/);
  assert.match(source, /Zkusit ověření znovu/);
  assert.match(source, /const bundleReady = catalogStatus === "verified"\s*&& !ownershipBlocked/);
  assert.match(source, /!resumeCheckout[\s\S]{0,220}currentOwnership\.checkRequired && currentOwnership\.status !== "verified"/);
  assert.doesNotMatch(source, /setModal\(resumeCheckout \? "checkout"/);
});
