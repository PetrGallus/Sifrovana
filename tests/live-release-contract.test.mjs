import assert from "node:assert/strict";
import test from "node:test";
import { discoverJavaScriptUrls, verifyLiveSite } from "../scripts/verify-live-site.mjs";

function fakeResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => body,
  };
}

test("post-deploy verifier projde stejno-originové klientské chunky do nalezení Supabase URL", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed.pathname);
    if (parsed.pathname === "/") return fakeResponse('<script src="/_next/static/index.js"></script>');
    if (parsed.pathname === "/_next/static/index.js") return fakeResponse('import("./page.js")');
    if (parsed.pathname === "/_next/static/page.js") {
      return fakeResponse('const url="https://release-test.supabase.co";');
    }
    return fakeResponse("", 404);
  };
  const result = await verifyLiveSite({
    siteUrl: "https://sifrovana.example/",
    supabaseUrl: "https://release-test.supabase.co",
    fetchImpl,
  });
  assert.equal(result.assetCount, 2);
  assert.deepEqual(requests, ["/", "/_next/static/index.js", "/_next/static/page.js"]);
});

test("post-deploy verifier fail-closed odmítne klienta bez očekávané konfigurace", async () => {
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    return parsed.pathname === "/"
      ? fakeResponse('<script src="/_next/static/index.js"></script>')
      : fakeResponse("console.log('fallback')");
  };
  await assert.rejects(
    verifyLiveSite({
      siteUrl: "https://sifrovana.example/",
      supabaseUrl: "https://release-test.supabase.co",
      fetchImpl,
    }),
    /neobsahuje očekávanou Supabase konfiguraci/,
  );
});

test("discovery ignoruje cizí origin a neklientské cesty", () => {
  const urls = discoverJavaScriptUrls(
    '<script src="https://evil.example/x.js"></script><script src="/admin.js"></script><script src="/_next/static/app.js"></script>',
    "https://sifrovana.example/",
    "https://sifrovana.example",
  );
  assert.deepEqual([...urls], ["https://sifrovana.example/_next/static/app.js"]);
});
