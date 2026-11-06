import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyProductionBuild } from "../scripts/verify-production-build.mjs";

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: "https://release-test.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_release_test_value",
};

async function withFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sifrovana-release-"));
  try {
    await mkdir(path.join(root, "dist", "client", "assets"), { recursive: true });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("produkční preflight odmítne chybějící Supabase konfiguraci", async () => {
  await withFixture(async (root) => {
    await assert.rejects(
      verifyProductionBuild({ root, environment: {} }),
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });
});

test("produkční preflight odmítne konfiguraci, která se nepropsala do klienta", async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, "dist", "client", "assets", "app.js"), "console.log('fallback');\n");
    await assert.rejects(
      verifyProductionBuild({ root, environment: validEnvironment }),
      /Klientský build neobsahuje/,
    );
  });
});

test("produkční preflight potvrdí přesné veřejné hodnoty v klientském buildu", async () => {
  await withFixture(async (root) => {
    await writeFile(
      path.join(root, "dist", "client", "assets", "app.js"),
      `export const config=${JSON.stringify(validEnvironment)};\n`,
    );
    const result = await verifyProductionBuild({ root, environment: validEnvironment });
    assert.equal(result.supabaseHost, "release-test.supabase.co");
    assert.deepEqual(result.verifiedVariables, [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  });
});

test("produkční preflight odmítne adresu mimo HTTPS Supabase projekt", async () => {
  await withFixture(async (root) => {
    await assert.rejects(
      verifyProductionBuild({
        root,
        environment: {
          ...validEnvironment,
          NEXT_PUBLIC_SUPABASE_URL: "http://example.test",
        },
      }),
      /důvěryhodná HTTPS adresa projektu Supabase/,
    );
  });
});
