import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20261104173550_add_discount_coupons.sql", import.meta.url),
  "utf8",
);

test("supports percentage and fixed-CZK coupons with a bounded global limit", () => {
  assert.match(migration, /discount_type in \('percent', 'fixed_czk'\)/);
  assert.match(migration, /discount_type = 'percent' and discount_value between 1 and 99/);
  assert.match(migration, /usage_limit integer not null check \(usage_limit > 0\)/);
  assert.match(migration, /check \(reserved_count \+ redeemed_count <= usage_limit\)/);
  assert.match(migration, /for update;[\s\S]*reserved_count \+ v_code\.redeemed_count >= v_code\.usage_limit/);
});

test("creates checkout from the live catalogue and records a private trusted context", () => {
  assert.match(migration, /create table private\.store_order_context/);
  assert.match(migration, /revoke all on private\.store_order_context from public, anon, authenticated/);
  assert.match(migration, /create or replace function public\.create_route_checkout_order/);
  assert.match(migration, /from public\.routes r[\s\S]*r\.status = 'active'[\s\S]*r\.price_czk > 0/);
  assert.match(migration, /insert into public\.orders[\s\S]*v_route\.price_czk/);
  assert.match(migration, /insert into private\.store_order_context[\s\S]*v_route\.price_czk/);
  assert.match(migration, /perform 1 from public\.profiles profile where profile\.id = v_user_id for update/);
});

test("blocks direct browser order writes and only exposes narrow RPC mutations", () => {
  assert.match(migration, /drop policy if exists "orders_insert_own" on public\.orders/);
  assert.match(migration, /revoke all on public\.orders from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.orders to authenticated/);
  assert.match(migration, /grant execute on function public\.create_route_checkout_order\(text, text\) to authenticated/);
  assert.match(migration, /grant execute on function public\.finalize_order_paid\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.cancel_checkout_order\(uuid\) to authenticated/);
});

test("expires or releases reservations on all terminal cancellation paths", () => {
  assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '7 days'\)/);
  assert.match(migration, /v_context\.expires_at <= now\(\)/);
  assert.match(migration, /new\.status::text in \('cancelled', 'rejected'\)/);
  assert.match(migration, /perform private\.release_reserved_discount\(new\.id\)/);
  assert.match(migration, /previous_order[\s\S]*set status = 'cancelled'[\s\S]*previous_context\.product_id = v_route\.id/);
});

test("coupon administration and payment finalization require a superadmin and trusted totals", () => {
  assert.match(migration, /create or replace function public\.admin_upsert_discount_code/);
  assert.match(migration, /not private\.is_cms_superadmin\(\)[\s\S]*Kupóny může spravovat pouze superadmin/);
  assert.match(migration, /p_usage_limit < v_current_reserved \+ v_current_redeemed/);
  assert.match(migration, /create or replace function public\.finalize_order_paid/);
  assert.match(migration, /not private\.is_cms_superadmin\(\)[\s\S]*Platbu může potvrdit pouze superadmin/);
  assert.match(migration, /v_context\.user_id <> v_order\.user_id/);
  assert.match(migration, /v_context\.route_ids is distinct from v_order\.route_ids/);
  assert.match(migration, /v_context\.gross_amount_czk <> v_order\.amount_czk \+ v_order\.discount_amount_czk/);
});
