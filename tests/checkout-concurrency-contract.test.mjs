import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261106180429_harden_checkout_concurrency.sql",
    import.meta.url,
  ),
  "utf8",
);

function occursBefore(source, first, second, message) {
  const firstIndex = source.search(first);
  const secondIndex = source.search(second);
  assert.notEqual(firstIndex, -1, `missing first step: ${message}`);
  assert.notEqual(secondIndex, -1, `missing second step: ${message}`);
  assert.ok(firstIndex < secondIndex, message);
}

test("checkout keeps old callers compatible and supports a displayed-price precondition", () => {
  assert.match(
    migration,
    /drop function if exists public\.create_route_checkout_order\(text, text\)/,
  );
  assert.match(
    migration,
    /create function public\.create_route_checkout_order\([\s\S]*p_route_id text,[\s\S]*p_discount_code text default null,[\s\S]*p_expected_price_czk integer default null/,
  );
  assert.match(
    migration,
    /p_expected_price_czk is not null[\s\S]*p_expected_price_czk <> v_route\.price_czk[\s\S]*Cena trasy se změnila/,
  );
  occursBefore(
    migration,
    /select catalogue\.\* into v_route/,
    /if p_expected_price_czk is not null/,
    "the expected price must be compared with the locked live catalogue row",
  );
  occursBefore(
    migration,
    /if p_expected_price_czk is not null/,
    /insert into public\.orders/,
    "a stale displayed price must fail before an order is inserted",
  );
});

test("checkout locks the profile before reading access or mutating its orders", () => {
  occursBefore(
    migration,
    /from public\.profiles profile[\s\S]*where profile\.id = v_user_id[\s\S]*for update/,
    /update public\.orders expired_order/,
    "checkout must lock profile before expired-order cleanup",
  );
  occursBefore(
    migration,
    /from public\.profiles profile[\s\S]*where profile\.id = v_user_id[\s\S]*for update/,
    /from public\.user_route_access access/,
    "checkout must lock profile before checking access",
  );
  assert.match(
    migration,
    /update public\.orders expired_order[\s\S]*context\.user_id = v_user_id[\s\S]*expired_order\.user_id = v_user_id/,
  );
  assert.match(
    migration,
    /update public\.orders previous_order[\s\S]*previous_context\.user_id = v_user_id[\s\S]*previous_order\.user_id = v_user_id/,
  );
});

test("finalization uses the same profile-to-order lock order", () => {
  const finalizer = migration.slice(
    migration.indexOf("create or replace function public.finalize_order_paid"),
  );

  occursBefore(
    finalizer,
    /select order_row\.user_id into v_order_user_id/,
    /from public\.profiles profile[\s\S]*where profile\.id = v_order_user_id[\s\S]*for update/,
    "finalization may read the immutable owner before taking locks",
  );
  occursBefore(
    finalizer,
    /from public\.profiles profile[\s\S]*where profile\.id = v_order_user_id[\s\S]*for update/,
    /select \* into v_order[\s\S]*where order_row\.id = p_order_id[\s\S]*for update/,
    "finalization must lock profile before order",
  );
  occursBefore(
    finalizer,
    /select \* into v_order[\s\S]*where order_row\.id = p_order_id[\s\S]*for update/,
    /insert into public\.user_route_access/,
    "access must be granted only after the order is locked and re-read",
  );
  assert.match(
    finalizer,
    /v_order\.user_id is distinct from v_order_user_id[\s\S]*Vlastník objednávky se během finalizace změnil/,
  );
});

test("an access grant cancels other trusted pending orders for the same route", () => {
  assert.match(
    migration,
    /insert into public\.user_route_access[\s\S]*update public\.orders duplicate_order[\s\S]*set status = 'cancelled'/,
  );
  assert.match(
    migration,
    /duplicate_context\.user_id = v_order\.user_id[\s\S]*duplicate_context\.product_type = 'route'[\s\S]*duplicate_context\.product_id = any\(v_order\.route_ids\)/,
  );
  assert.match(
    migration,
    /duplicate_order\.id <> v_order\.id[\s\S]*duplicate_order\.status::text = 'pending'/,
  );
  assert.match(
    migration,
    /get diagnostics v_cancelled_duplicate_orders = row_count[\s\S]*'cancelled_duplicate_orders', v_cancelled_duplicate_orders/,
  );
});

test("finalization never overwrites access provenance from another order", () => {
  const precondition =
    /from public\.user_route_access existing_access[\s\S]*existing_access\.user_id = v_order\.user_id[\s\S]*existing_access\.route_id = any\(v_order\.route_ids\)[\s\S]*existing_access\.order_id is distinct from v_order\.id/;
  const firstCheck = migration.search(precondition);
  const accessInsert = migration.search(/insert into public\.user_route_access/);
  const secondCheck = migration.slice(accessInsert + 1).search(precondition);

  assert.notEqual(firstCheck, -1, "missing access provenance precondition");
  assert.notEqual(accessInsert, -1, "missing access insert");
  assert.ok(firstCheck < accessInsert, "provenance must be checked immediately before access insert");
  assert.notEqual(secondCheck, -1, "missing post-conflict provenance revalidation");
  assert.match(
    migration,
    /insert into public\.user_route_access[\s\S]*on conflict \(user_id, route_id\) do nothing/,
  );
  assert.doesNotMatch(
    migration,
    /on conflict \(user_id, route_id\) do update set order_id = excluded\.order_id/,
  );
  assert.match(
    migration,
    /Přístup k trase už pochází z jiné objednávky[\s\S]*ruční kontrolu[\s\S]*vrácení platby/,
  );
});

test("both privileged RPCs keep fixed search paths and explicit grants", () => {
  assert.match(
    migration,
    /create function public\.create_route_checkout_order[\s\S]*security definer[\s\S]*set search_path = ''/,
  );
  assert.match(
    migration,
    /revoke all on function public\.create_route_checkout_order\(text, text, integer\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute on function public\.create_route_checkout_order\(text, text, integer\)[\s\S]*to authenticated/,
  );
  assert.match(
    migration,
    /create or replace function public\.finalize_order_paid[\s\S]*security definer[\s\S]*set search_path = ''/,
  );
  assert.match(
    migration,
    /revoke all on function public\.finalize_order_paid\(uuid\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute on function public\.finalize_order_paid\(uuid\)[\s\S]*to authenticated/,
  );
});
