import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { archiveCommand, resolveArchivePath, validateSiteBuildTree } from "../scripts/package-site-build.mjs";

async function withBuildFixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sifrovana-package-"));
  try {
    await mkdir(path.join(root, ".openai"), { recursive: true });
    await mkdir(path.join(root, "dist", ".openai"), { recursive: true });
    await mkdir(path.join(root, "dist", "server"), { recursive: true });
    const manifest = JSON.stringify({ project_id: "appgprj_release_test", d1: null, r2: null });
    await writeFile(path.join(root, ".openai", "hosting.json"), manifest);
    await writeFile(path.join(root, "dist", ".openai", "hosting.json"), manifest);
    await writeFile(path.join(root, "dist", "server", "index.js"), "export default {};\n");
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Sites balení přijme jen odpovídající source a dist manifest", async () => {
  await withBuildFixture(async (root) => {
    const result = await validateSiteBuildTree({ root });
    assert.equal(result.projectId, "appgprj_release_test");
    await writeFile(
      path.join(root, "dist", ".openai", "hosting.json"),
      JSON.stringify({ project_id: "appgprj_other" }),
    );
    await assert.rejects(validateSiteBuildTree({ root }), /Projektové ID/);
  });
});

test("Sites archiv smí vzniknout pouze v outputs a s příponou tar.gz", async () => {
  await withBuildFixture(async (root) => {
    const destination = await resolveArchivePath(root);
    assert.equal(destination.archivePath, path.join(root, "outputs", "site-package.tar.gz"));
    await assert.rejects(resolveArchivePath(root, "site-package.tar.gz"), /uvnitř ignorované složky outputs/);
    await assert.rejects(resolveArchivePath(root, "outputs/site.zip"), /příponu \.tar\.gz/);
  });
});

test("příkaz balí výhradně adresář dist bez shellu a je přenositelný", () => {
  const root = path.resolve("fixture");
  const archivePath = path.join(root, "outputs", "site.tar.gz");
  assert.deepEqual(archiveCommand({ root, archivePath, platform: "win32" }), {
    executable: "tar.exe",
    args: ["-C", root, "-czf", archivePath, "dist"],
  });
  assert.deepEqual(archiveCommand({ root, archivePath, list: true, platform: "linux" }), {
    executable: "tar",
    args: ["-tzf", archivePath],
  });
});

test("Sites balení odmítne konfigurační soubor připomínající tajemství", async () => {
  await withBuildFixture(async (root) => {
    await writeFile(path.join(root, "dist", ".env.production"), "SECRET=value\n");
    await assert.rejects(validateSiteBuildTree({ root }), /zakázaný konfigurační soubor/);
  });
});

test("Sites balení odmítne zabudovanou hodnotu neveřejné proměnné", async () => {
  await withBuildFixture(async (root) => {
    await writeFile(path.join(root, "dist", "server", "index.js"), "service-role-secret-value\n");
    await assert.rejects(
      validateSiteBuildTree({
        root,
        environment: { SUPABASE_SERVICE_ROLE_KEY: "service-role-secret-value" },
      }),
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });
});
