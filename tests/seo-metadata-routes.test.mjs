import assert from "node:assert/strict";
import test from "node:test";
import robots from "../app/robots.ts";
import sitemap from "../app/sitemap.ts";
import { fallbackSiteUrl, resolveSiteUrl } from "../lib/site-url.js";

test("metadata URL odmítne nedůvěryhodné schéma a podporuje budoucí vlastní doménu", () => {
  assert.equal(resolveSiteUrl("javascript:alert(1)").href, `${fallbackSiteUrl}/`);
  assert.equal(resolveSiteUrl("https://sifrovana.cz").href, "https://sifrovana.cz/");
});

test("robots a sitemap publikují jednu kanonickou veřejnou adresu", () => {
  const robotsMetadata = robots();
  const sitemapMetadata = sitemap();
  assert.equal(robotsMetadata.sitemap, `${fallbackSiteUrl}/sitemap.xml`);
  assert.deepEqual(robotsMetadata.rules, { userAgent: "*", allow: "/" });
  assert.deepEqual(sitemapMetadata, [{
    url: `${fallbackSiteUrl}/`,
    changeFrequency: "weekly",
    priority: 1,
  }]);
});
