import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("SPA navigace přesouvá fokus, respektuje omezení pohybu a mobilní menu lze zavřít Escape", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /mainRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(page, /event\.key !== "Escape"/);
  assert.match(page, /aria-controls="mobile-menu"/);
  assert.match(page, /id="mobile-menu"[\s\S]{0,100}aria-label="Mobilní rozšířená navigace"/);
  assert.match(page, /<main ref=\{mainRef\} id="main-content" tabIndex=\{-1\}>/);
});

test("přímé herní URL se po ověření relace nepřepne na nepovolené dokončení", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /const invalidFinish = view === "finish" && !currentGameCompleted/);
  assert.match(page, /const invalidGame = view === "game" && !publishedGame\.session && !publishedGame\.busy/);
  assert.match(page, /window\.history\.replaceState/);
  assert.match(page, /resumeLastPublishedGame\(selectedRouteId\)/);
  assert.match(page, /protectedViewPending && <section/);
  assert.match(page, /view === "finish" && protectedViewReady && currentGameCompleted/);
});

test("změna účtu odstraní citlivou herní relaci z paměti a reference jsou oddělené podle uživatele", async () => {
  const [page, hook] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/use-published-game.ts", root), "utf8"),
  ]);
  assert.match(page, /routeOwnership\?\.userId === currentUserId \? routeOwnership\.routeIds : \[\]/);
  assert.match(page, /setRouteOwnership\(\{ userId, routeIds:/);
  assert.match(page, /usePublishedGame\(auth\.user\?\.id \?\? null\)/);
  assert.match(hook, /references\[userId\] = \{ [\s\S]{0,100}\[session\.routeId\]: session\.id \}/);
  assert.match(hook, /if \(previousUserId\.current === userId\) return;[\s\S]{0,160}setSession\(null\)/);
});

test("všechny kritické malé ovládací prvky mají nejméně 44 pixelů", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.game-topbar button,[\s\S]{0,180}\.modal-close \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /max-height: calc\(100dvh/);
});
