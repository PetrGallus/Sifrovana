import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const requiredPublicVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];

function requirePublicConfiguration(environment) {
  const values = Object.fromEntries(
    requiredPublicVariables.map((name) => [name, environment[name]?.trim() ?? ""]),
  );
  const missing = requiredPublicVariables.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(
      `Chybí build-time proměnné: ${missing.join(", ")}. Produkční klient bez nich nesmí být publikován.`,
    );
  }

  let supabaseUrl;
  try {
    supabaseUrl = new URL(values.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL není platná URL.");
  }
  if (
    supabaseUrl.protocol !== "https:"
    || !supabaseUrl.hostname.endsWith(".supabase.co")
    || supabaseUrl.username
    || supabaseUrl.password
  ) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL musí být důvěryhodná HTTPS adresa projektu Supabase.");
  }

  return values;
}

async function collectClientFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectClientFiles(filename));
    else if (entry.isFile() && /\.(?:html|js|mjs|json)$/i.test(entry.name)) files.push(filename);
  }
  return files;
}

async function findEmbeddedValues(clientDirectory, values) {
  const remaining = new Map(Object.entries(values));
  for (const filename of await collectClientFiles(clientDirectory)) {
    const content = await readFile(filename, "utf8");
    for (const [name, value] of remaining) {
      if (content.includes(value)) remaining.delete(name);
    }
    if (remaining.size === 0) break;
  }
  return [...remaining.keys()];
}

export async function verifyProductionBuild({
  root = process.cwd(),
  environment = process.env,
} = {}) {
  const values = requirePublicConfiguration(environment);
  const clientDirectory = path.join(root, "dist", "client");
  if (!(await stat(clientDirectory).catch(() => null))?.isDirectory()) {
    throw new Error("Chybí dist/client. Nejdřív spusť produkční build.");
  }

  const missingFromClient = await findEmbeddedValues(clientDirectory, values);
  if (missingFromClient.length > 0) {
    throw new Error(
      `Klientský build neobsahuje: ${missingFromClient.join(", ")}. Build vznikl bez aktuální Sites konfigurace.`,
    );
  }

  return {
    clientDirectory,
    supabaseHost: new URL(values.NEXT_PUBLIC_SUPABASE_URL).hostname,
    verifiedVariables: requiredPublicVariables,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyProductionBuild();
    console.log(
      `Produkční klient je připraven: ${result.supabaseHost}; ověřeno ${result.verifiedVariables.length} veřejných proměnných.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Produkční build nelze ověřit.");
    process.exitCode = 1;
  }
}
