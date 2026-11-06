import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261106160221_sync_catalog_availability_window.sql",
    import.meta.url,
  ),
  "utf8",
);

test("public routes expose a typed seasonal availability pair", () => {
  assert.match(migration, /add column if not exists available_from date/);
  assert.match(migration, /add column if not exists available_to date/);
  assert.match(
    migration,
    /check \(\(available_from is null\) = \(available_to is null\)\)/,
  );
  assert.match(
    migration,
    /check \(available_to is null or available_to >= available_from\)/,
  );
  assert.match(
    migration,
    /status::text = 'seasonal'[\s\S]*available_from is null and available_to is null/,
  );
});

test("catalog dates are projected from the live immutable publication", () => {
  assert.match(
    migration,
    /join public\.cms_route_publications publication[\s\S]*publication\.revision = cms\.published_revision/,
  );
  assert.match(
    migration,
    /publication\.snapshot #>> '\{route,available_from\}'/,
  );
  assert.match(
    migration,
    /publication\.snapshot #>> '\{route,available_to\}'/,
  );
  assert.doesNotMatch(
    migration,
    /publication\.revision = cms\.content_revision/,
    "working-copy dates must not leak into the storefront",
  );
});

test("publish upserts and existing publications use the same fail-closed trigger", () => {
  assert.match(
    migration,
    /before insert or update of status, available_from, available_to on public\.routes/,
  );
  assert.match(
    migration,
    /if found and v_availability = 'seasonal'[\s\S]*else[\s\S]*new\.available_from := null;[\s\S]*new\.available_to := null/,
  );
  assert.match(
    migration,
    /update public\.routes catalogue[\s\S]*set available_from = catalogue\.available_from,[\s\S]*available_to = catalogue\.available_to/,
  );
});

test("the private projection trigger has no browser execute grant", () => {
  assert.match(
    migration,
    /security invoker[\s\S]*set search_path = ''/,
  );
  assert.match(
    migration,
    /revoke all on function private\.sync_route_catalog_availability_window\(\)[\s\S]*from public, anon, authenticated/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function private\.sync_route_catalog_availability_window/,
  );
});
