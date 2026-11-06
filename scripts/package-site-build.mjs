import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyProductionBuild } from "./verify-production-build.mjs";

const forbiddenNames = [/^\.env(?:\.|$)/i, /^\.git$/i, /\.(?:pem|key)$/i];

async function readJson(filename, label) {
  try {
    const parsed = JSON.parse(await readFile(filename, "utf8"));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} není platný JSON objekt: ${filename}`);
  }
}

async function assertRegularSafeTree(directory, root = directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    const relative = path.relative(root, filename);
    if (forbiddenNames.some((pattern) => pattern.test(entry.name))) {
      throw new Error(`Build obsahuje zakázaný konfigurační soubor: ${relative}`);
    }
    const metadata = await lstat(filename);
    if (metadata.isSymbolicLink()) throw new Error(`Build nesmí obsahovat symlink: ${relative}`);
    if (metadata.isDirectory()) await assertRegularSafeTree(filename, root);
    else if (!metadata.isFile()) throw new Error(`Build obsahuje nepodporovaný typ souboru: ${relative}`);
  }
}

async function assertNoConfiguredSecrets(directory, environment) {
  const secrets = Object.entries(environment).filter(([name, value]) => (
    !name.startsWith("NEXT_PUBLIC_")
    && /(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|DATABASE_URL|TOKEN)/i.test(name)
    && typeof value === "string"
    && value.length >= 8
  ));
  if (secrets.length === 0) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await assertNoConfiguredSecrets(filename, environment);
    else if (entry.isFile()) {
      const content = await readFile(filename);
      const exposed = secrets.find(([, value]) => content.includes(Buffer.from(value)));
      if (exposed) throw new Error(`Build obsahuje hodnotu neveřejné proměnné: ${exposed[0]}`);
    }
  }
}

export async function validateSiteBuildTree({ root = process.cwd(), environment = process.env } = {}) {
  const sourceManifestPath = path.join(root, ".openai", "hosting.json");
  const builtManifestPath = path.join(root, "dist", ".openai", "hosting.json");
  const [sourceManifest, builtManifest] = await Promise.all([
    readJson(sourceManifestPath, "Zdrojový Sites manifest"),
    readJson(builtManifestPath, "Výstupní Sites manifest"),
  ]);
  if (!sourceManifest.project_id || sourceManifest.project_id !== builtManifest.project_id) {
    throw new Error("Projektové ID ve výstupním Sites manifestu neodpovídá zdrojovému manifestu.");
  }
  if (!(await stat(path.join(root, "dist", "server", "index.js")).catch(() => null))?.isFile()) {
    throw new Error("Worker build nemá dist/server/index.js.");
  }
  await assertRegularSafeTree(path.join(root, "dist"));
  await assertNoConfiguredSecrets(path.join(root, "dist"), environment);
  return { projectId: sourceManifest.project_id, builtManifestPath };
}

export async function resolveArchivePath(root, requestedPath) {
  const outputRoot = path.resolve(root, "outputs");
  const outputMetadata = await lstat(outputRoot).catch(() => null);
  if (outputMetadata?.isSymbolicLink() || outputMetadata && !outputMetadata.isDirectory()) {
    throw new Error("outputs/ musí být běžná složka uvnitř projektu.");
  }
  const archivePath = path.resolve(root, requestedPath || path.join("outputs", "site-package.tar.gz"));
  const relative = path.relative(outputRoot, archivePath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Sites archiv musí být uložený uvnitř ignorované složky outputs/.");
  }
  if (!archivePath.endsWith(".tar.gz")) throw new Error("Sites archiv musí mít příponu .tar.gz.");
  return { archivePath, outputRoot };
}

export function archiveCommand({ root, archivePath, list = false, platform = process.platform }) {
  const executable = platform === "win32" ? "tar.exe" : "tar";
  return list
    ? { executable, args: ["-tzf", archivePath] }
    : { executable, args: ["-C", root, "-czf", archivePath, "dist"] };
}

function runCommand(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", () => reject(new Error(`Nelze spustit ${executable}.`)));
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${executable} skončil s kódem ${code}.`));
    });
  });
}

function validateArchiveEntries(listing) {
  const entries = listing.split(/\r?\n/).filter(Boolean).map((entry) => entry.replace(/\\/g, "/"));
  if (!entries.includes("dist/.openai/hosting.json")) {
    throw new Error("Archiv neobsahuje dist/.openai/hosting.json.");
  }
  const unsafe = entries.find((entry) => (
    !entry.startsWith("dist/")
    || entry.split("/").includes("..")
    || forbiddenNames.some((pattern) => entry.split("/").some((part) => pattern.test(part)))
  ));
  if (unsafe) throw new Error(`Archiv obsahuje nepovolenou cestu: ${unsafe}`);
  return entries.length;
}

export async function packageSiteBuild({
  root = process.cwd(),
  environment = process.env,
  output,
  execute = runCommand,
} = {}) {
  const [{ supabaseHost }, { projectId }, destination] = await Promise.all([
    verifyProductionBuild({ root, environment }),
    validateSiteBuildTree({ root, environment }),
    resolveArchivePath(root, output),
  ]);
  await mkdir(destination.outputRoot, { recursive: true });
  const temporaryPath = path.join(
    destination.outputRoot,
    `.${path.basename(destination.archivePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    const create = archiveCommand({ root, archivePath: temporaryPath });
    await execute(create.executable, create.args);
    if (!(await stat(temporaryPath).catch(() => null))?.isFile()) {
      throw new Error("Balení nevytvořilo Sites archiv.");
    }
    const list = archiveCommand({ root, archivePath: temporaryPath, list: true });
    const fileCount = validateArchiveEntries(await execute(list.executable, list.args));
    await rm(destination.archivePath, { force: true });
    await rename(temporaryPath, destination.archivePath);
    return { archivePath: destination.archivePath, fileCount, projectId, supabaseHost };
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [flag, output, ...extra] = process.argv.slice(2);
  if (extra.length > 0 || flag && flag !== "--output" || flag === "--output" && !output) {
    console.error("Použití: node scripts/package-site-build.mjs [--output outputs/nazev.tar.gz]");
    process.exitCode = 64;
  } else {
    try {
      const result = await packageSiteBuild({ output });
      console.log(`Sites archiv připraven: ${result.archivePath} (${result.fileCount} položek, ${result.projectId}).`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Sites archiv se nepodařilo vytvořit.");
      process.exitCode = 1;
    }
  }
}
