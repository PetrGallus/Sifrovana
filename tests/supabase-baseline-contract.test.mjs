import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationDir = join(root, "supabase", "migrations");
const contract = JSON.parse(
  readFileSync(join(root, "supabase", "baseline-contract.json"), "utf8"),
);
const migrationFiles = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationSql = migrationFiles
  .map((name) => readFileSync(join(migrationDir, name), "utf8"))
  .join("\n")
  .toLowerCase();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCreateTable(qualifiedName) {
  return new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${escapeRegex(qualifiedName)}\\b`,
    "i",
  ).test(migrationSql);
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("the migration chain declares its empty-project blocker", () => {
  assert.equal(contract.fresh_install_ready, false);
  assert.equal(migrationFiles[0], contract.first_tracked_migration);

  const firstMigration = readFileSync(
    join(migrationDir, contract.first_tracked_migration),
    "utf8",
  ).toLowerCase();

  assert.match(firstMigration, /alter\s+table\s+public\.profiles/);
  assert.match(firstMigration, /public\.user_role/);
  assert.match(firstMigration, /private\.handle_new_user/);
  assert.doesNotMatch(firstMigration, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.profiles/);
  assert.doesNotMatch(firstMigration, /create\s+type\s+public\.user_role/);
  assert.doesNotMatch(firstMigration, /create\s+schema\s+(?:if\s+not\s+exists\s+)?private/);
});

test("every inventoried baseline object is still absent from tracked DDL", () => {
  for (const schema of contract.missing_baseline.schemas) {
    assert.doesNotMatch(
      migrationSql,
      new RegExp(`create\\s+schema\\s+(?:if\\s+not\\s+exists\\s+)?${escapeRegex(schema)}\\b`, "i"),
      `schema ${schema} is now tracked; reconcile the baseline contract`,
    );
  }

  for (const type of contract.missing_baseline.enum_types) {
    assert.doesNotMatch(
      migrationSql,
      new RegExp(`create\\s+type\\s+${escapeRegex(type.name)}\\b`, "i"),
      `type ${type.name} is now tracked; reconcile the baseline contract`,
    );
  }

  for (const table of contract.missing_baseline.tables) {
    assert.equal(
      hasCreateTable(table),
      false,
      `table ${table} is now tracked; reconcile the baseline contract`,
    );
  }

  for (const signature of contract.missing_baseline.functions) {
    const functionName = signature.slice(0, signature.indexOf("("));
    assert.doesNotMatch(
      migrationSql,
      new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+${escapeRegex(functionName)}\\s*\\(`, "i"),
      `function ${signature} is now tracked; reconcile the baseline contract`,
    );
  }

  for (const trigger of contract.missing_baseline.triggers) {
    assert.doesNotMatch(
      migrationSql,
      new RegExp(`create\\s+trigger\\s+${escapeRegex(trigger.name)}\\b`, "i"),
      `trigger ${trigger.name} is now tracked; reconcile the baseline contract`,
    );
  }

  for (const index of contract.missing_baseline.non_constraint_indexes) {
    assert.doesNotMatch(
      migrationSql,
      new RegExp(`create(?:\\s+unique)?\\s+index(?:\\s+if\\s+not\\s+exists)?\\s+${escapeRegex(index)}\\b`, "i"),
      `index ${index} is now tracked; reconcile the baseline contract`,
    );
  }

  for (const policy of contract.missing_baseline.rls_policies) {
    assert.equal(
      migrationSql.includes(`create policy "${policy.toLowerCase()}"`),
      false,
      `policy ${policy} is now tracked; reconcile the baseline contract`,
    );
  }
});

test("literal Supabase table reads have a tracked, baseline, or deferred owner", () => {
  const references = new Set();
  const pattern = /supabase\s*\.\s*from\(\s*["']([^"']+)["']/g;

  for (const file of sourceFiles(join(root, "app"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) references.add(`public.${match[1]}`);
  }

  const baseline = new Set(contract.missing_baseline.tables);
  const deferred = new Set(contract.intentionally_deferred.tables);
  const unowned = [...references]
    .filter((name) => !baseline.has(name) && !deferred.has(name) && !hasCreateTable(name))
    .sort();

  assert.deepEqual(unowned, [], `unowned Supabase tables: ${unowned.join(", ")}`);
});

test("deferred referral schema remains outside the active migration chain", () => {
  assert.equal(
    migrationFiles.includes(contract.intentionally_deferred.migration.split("/").at(-1)),
    false,
  );
  for (const table of contract.intentionally_deferred.tables) {
    assert.equal(hasCreateTable(table), false, `${table} unexpectedly entered the active chain`);
  }
});
