import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261106155734_enforce_checkout_release_gate.sql",
    import.meta.url,
  ),
  "utf8",
);

test("checkout requires an explicit CMS release backed by an immutable publication", () => {
  assert.match(
    migration,
    /join public\.cms_routes cms on cms\.id = catalogue\.id[\s\S]*join public\.cms_route_publications publication[\s\S]*publication\.revision = cms\.published_revision/,
  );
  assert.match(migration, /cms\.lifecycle = 'active'/);
  assert.match(migration, /cms\.commercial_readiness = 'ready'/);
  assert.match(
    migration,
    /catalogue\.price_czk = \(publication\.snapshot #>> '\{route,price_czk\}'\)::integer/,
  );
  assert.doesNotMatch(
    migration,
    /published_revision\s*=\s*cms\.content_revision/,
    "an unpublished working-copy edit must not suspend the last released snapshot",
  );
});

test("seasonal checkout uses the immutable publication window and fails closed outside it", () => {
  assert.match(
    migration,
    /catalogue\.status::text = 'active'[\s\S]*snapshot #>> '\{route,availability\}'\) = 'active'/,
  );
  assert.match(
    migration,
    /catalogue\.status::text = 'seasonal'[\s\S]*snapshot #>> '\{route,availability\}'\) = 'seasonal'/,
  );
  assert.match(
    migration,
    /current_date between[\s\S]*\{route,available_from\}[\s\S]*\{route,available_to\}/,
  );
});

test("the pre-gate pilot backfill cannot promote a draft or an untrusted publisher", () => {
  assert.match(migration, /cms\.id = 'brno-kralovo-pole-stopy'/);
  assert.match(migration, /cms\.lifecycle = 'active'/);
  assert.match(migration, /cms\.commercial_readiness = 'blocked'/);
  assert.match(
    migration,
    /publication\.revision = cms\.published_revision/,
  );
  assert.match(migration, /publisher\.role::text = 'superadmin'/);
  assert.match(
    migration,
    /set_config\('request\.jwt\.claim\.sub', v_publisher_id::text, true\)/,
  );
  assert.match(
    migration,
    /update public\.cms_routes[\s\S]*set commercial_readiness = 'ready'[\s\S]*where id = 'brno-kralovo-pole-stopy'/,
  );
});

test("the privileged checkout function keeps a fixed search path and narrow execute grant", () => {
  assert.match(
    migration,
    /create or replace function public\.create_route_checkout_order[\s\S]*security definer[\s\S]*set search_path = ''/,
  );
  assert.match(
    migration,
    /revoke all on function public\.create_route_checkout_order\(text, text\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.create_route_checkout_order\(text, text\)[\s\S]*to authenticated/,
  );
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /if v_user_id is null then raise exception/);
});
