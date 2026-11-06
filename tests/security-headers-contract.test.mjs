import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { securityHeaders, withSecurityHeaders } from "../lib/security-response.ts";

const root = new URL("../", import.meta.url);

test("worker přidává bezpečnostní hlavičky na stránky i optimalizované obrázky", async () => {
  const worker = await readFile(new URL("worker/index.ts", root), "utf8");

  for (const [header, value] of Object.entries(securityHeaders)) {
    assert.equal(typeof value, "string");
    assert.ok(value.length > 0, `${header} must have a value`);
  }

  assert.equal(securityHeaders["Content-Security-Policy"].includes("frame-ancestors 'self'"), true);
  assert.equal(securityHeaders["Cross-Origin-Opener-Policy"], "same-origin-allow-popups");
  assert.match(worker, /withSecurityHeaders\(response\)/);
  assert.match(worker, /withSecurityHeaders\(await handler\.fetch/);
});

test("bezpečnostní obálka zachová odpověď, stream a původní hlavičky", async () => {
  const original = new Response("průchozí stream", {
    status: 202,
    statusText: "Accepted",
    headers: { "x-origin": "preserved" },
  });
  const secured = withSecurityHeaders(original);

  assert.equal(secured.status, 202);
  assert.equal(secured.statusText, "Accepted");
  assert.equal(secured.headers.get("x-origin"), "preserved");
  assert.equal(secured.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await secured.text(), "průchozí stream");
});

test("worker nepřebaluje WebSocket handshake bez runtime metadat", () => {
  const handshake = { status: 101, webSocket: {} };
  assert.equal(withSecurityHeaders(handshake), handshake);
});
