-- Serialize checkout and payment finalization for one account on the same
-- profile row. The shared lock order is profile -> order, which prevents the
-- checkout/finalization deadlock and closes the access-vs-new-order race.

-- Changing the argument list creates a PostgreSQL overload, so remove the
-- previous two-argument function first. The replacement keeps both trailing
-- arguments optional: existing clients remain compatible, while clients that
-- send p_expected_price_czk get an explicit displayed-price precondition.
drop function if exists public.create_route_checkout_order(text, text);

create function public.create_route_checkout_order(
  p_route_id text,
  p_discount_code text default null,
  p_expected_price_czk integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $checkout$
declare
  v_user_id uuid := auth.uid();
  v_route public.routes;
  v_order_id uuid;
  v_symbol text;
  v_coupon jsonb;
  v_amount integer;
  v_discount integer := 0;
begin
  if v_user_id is null then raise exception 'Pro nákup se přihlas.'; end if;

  -- This is the first transactional row lock for every checkout. Payment
  -- finalization below takes the same profile lock before touching its order.
  perform 1
  from public.profiles profile
  where profile.id = v_user_id
  for update;
  if not found then raise exception 'Profil hráče nebyl nalezen.'; end if;

  -- Only clean this account's expired orders. A global cleanup while holding
  -- one profile lock would violate the per-account lock discipline.
  update public.orders expired_order
  set status = 'cancelled'
  from private.store_order_context context
  where context.order_id = expired_order.id
    and context.user_id = v_user_id
    and expired_order.user_id = v_user_id
    and expired_order.status::text = 'pending'
    and context.expires_at <= now();

  -- A storefront row is sellable only while the CMS keeps the route active
  -- and commercially approved, and while it points to a real immutable
  -- publication. Working-copy edits may advance content_revision; checkout
  -- intentionally keeps selling published_revision until the next publish.
  select catalogue.* into v_route
  from public.routes catalogue
  join public.cms_routes cms on cms.id = catalogue.id
  join public.cms_route_publications publication
    on publication.route_id = cms.id
   and publication.revision = cms.published_revision
  where catalogue.id = p_route_id
    and cms.lifecycle = 'active'
    and cms.commercial_readiness = 'ready'
    and catalogue.price_czk > 0
    and catalogue.price_czk = (publication.snapshot #>> '{route,price_czk}')::integer
    and (
      (
        catalogue.status::text = 'active'
        and (publication.snapshot #>> '{route,availability}') = 'active'
      )
      or (
        catalogue.status::text = 'seasonal'
        and (publication.snapshot #>> '{route,availability}') = 'seasonal'
        and current_date between
          (publication.snapshot #>> '{route,available_from}')::date
          and (publication.snapshot #>> '{route,available_to}')::date
      )
    )
  for share of catalogue, cms, publication;
  if not found then raise exception 'Trasa není dostupná k nákupu.'; end if;

  if p_expected_price_czk is not null
    and p_expected_price_czk <> v_route.price_czk
  then
    raise exception using
      errcode = '22023',
      message = 'Cena trasy se změnila. Obnov nabídku a nákup potvrď znovu.';
  end if;

  -- The profile lock serializes this check with access grants performed by
  -- finalize_order_paid. No checkout can pass after that grant commits.
  if exists (
    select 1 from public.user_route_access access
    where access.user_id = v_user_id and access.route_id = p_route_id
  ) then
    raise exception 'Tuto trasu už máš odemčenou.';
  end if;

  -- One user can hold at most one live QR order for the same route. Reopening
  -- checkout invalidates the older QR and releases its coupon reservation.
  update public.orders previous_order
  set status = 'cancelled'
  from private.store_order_context previous_context
  where previous_context.order_id = previous_order.id
    and previous_context.user_id = v_user_id
    and previous_order.user_id = v_user_id
    and previous_context.product_type = 'route'
    and previous_context.product_id = v_route.id
    and previous_order.status::text = 'pending';

  v_symbol := private.generate_order_variable_symbol();
  insert into public.orders (
    user_id, package_type, route_ids, amount_czk, variable_symbol, status
  ) values (
    v_user_id, 'single', array[v_route.id], v_route.price_czk, v_symbol, 'pending'
  ) returning id into v_order_id;

  insert into private.store_order_context (
    order_id, user_id, product_type, product_id, route_ids, gross_amount_czk
  ) values (
    v_order_id, v_user_id, 'route', v_route.id, array[v_route.id], v_route.price_czk
  );

  if btrim(coalesce(p_discount_code, '')) <> '' then
    v_coupon := private.reserve_discount_code(p_discount_code, v_user_id, v_order_id);
    v_discount := (v_coupon ->> 'discount_amount_czk')::integer;
  end if;

  select order_row.amount_czk into v_amount
  from public.orders order_row
  where order_row.id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'variable_symbol', v_symbol,
    'gross_amount_czk', v_route.price_czk,
    'discount_amount_czk', v_discount,
    'amount_czk', v_amount
  );
end;
$checkout$;

revoke all on function public.create_route_checkout_order(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.create_route_checkout_order(text, text, integer)
  to authenticated;

comment on function public.create_route_checkout_order(text, text, integer) is
  'Creates one trusted route order under an account lock. Optional p_expected_price_czk rejects a checkout when the displayed price is stale.';

create or replace function public.finalize_order_paid(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $finalize$
declare
  v_admin_id uuid := auth.uid();
  v_order_user_id uuid;
  v_order public.orders;
  v_context private.store_order_context;
  v_cancelled_duplicate_orders integer := 0;
begin
  if v_admin_id is null or not private.is_cms_superadmin() then
    raise exception 'Platbu může potvrdit pouze superadmin.';
  end if;

  -- Read only the immutable owner first; do not lock the order yet. Checkout
  -- always locks this profile before it updates an order, so finalization must
  -- use the same profile -> order sequence.
  select order_row.user_id into v_order_user_id
  from public.orders order_row
  where order_row.id = p_order_id;
  if not found then raise exception 'Objednávka nebyla nalezena.'; end if;

  perform 1
  from public.profiles profile
  where profile.id = v_order_user_id
  for update;
  if not found then raise exception 'Profil hráče nebyl nalezen.'; end if;

  select * into v_order
  from public.orders order_row
  where order_row.id = p_order_id
  for update;
  if not found then raise exception 'Objednávka nebyla nalezena.'; end if;
  if v_order.user_id is distinct from v_order_user_id then
    raise exception 'Vlastník objednávky se během finalizace změnil.';
  end if;
  if v_order.status::text = 'paid' then
    return jsonb_build_object('paid', true, 'already_finalized', true);
  end if;
  if v_order.status::text <> 'pending' then
    raise exception 'Objednávka není ve stavu čekající na platbu.';
  end if;

  select * into v_context
  from private.store_order_context context
  where context.order_id = v_order.id
  for update;
  if not found
    or v_context.user_id <> v_order.user_id
    or v_context.route_ids is distinct from v_order.route_ids
    or v_context.gross_amount_czk <> v_order.amount_czk + v_order.discount_amount_czk
  then
    raise exception 'Objednávka nevznikla ověřeným serverovým checkoutem.';
  end if;
  if v_context.expires_at <= now() then
    update public.orders set status = 'cancelled' where id = v_order.id;
    return jsonb_build_object('paid', false, 'expired', true);
  end if;

  -- Never transfer access provenance from an older/manual grant to the order
  -- currently being finalized. That situation needs reconciliation and, when
  -- applicable, a refund rather than an automatic overwrite.
  if exists (
    select 1
    from public.user_route_access existing_access
    where existing_access.user_id = v_order.user_id
      and existing_access.route_id = any(v_order.route_ids)
      and existing_access.order_id is distinct from v_order.id
  ) then
    raise exception 'Přístup k trase už pochází z jiné objednávky. Proveď ruční kontrolu a případné vrácení platby.';
  end if;

  insert into public.user_route_access (user_id, route_id, order_id)
  select v_order.user_id, route_id, v_order.id
  from unnest(v_order.route_ids) as route_id
  on conflict (user_id, route_id) do nothing;

  -- A privileged writer that ignores the profile lock could race the first
  -- check. Revalidate after the conflict-safe insert and roll back on mismatch.
  if exists (
    select 1
    from public.user_route_access existing_access
    where existing_access.user_id = v_order.user_id
      and existing_access.route_id = any(v_order.route_ids)
      and existing_access.order_id is distinct from v_order.id
  ) then
    raise exception 'Přístup k trase během finalizace získal jiný původ. Proveď ruční kontrolu a případné vrácení platby.';
  end if;

  update public.orders
  set status = 'paid', approved_by = v_admin_id, approved_at = now()
  where id = v_order.id;

  -- If checkout won the profile lock just before this finalization, it could
  -- legitimately create another pending order before access existed. Access
  -- now exists, so cancel every other trusted single-route checkout that
  -- overlaps the newly granted routes. The status trigger releases coupons.
  update public.orders duplicate_order
  set status = 'cancelled'
  from private.store_order_context duplicate_context
  where duplicate_context.order_id = duplicate_order.id
    and duplicate_context.user_id = v_order.user_id
    and duplicate_context.product_type = 'route'
    and duplicate_context.product_id = any(v_order.route_ids)
    and duplicate_order.user_id = v_order.user_id
    and duplicate_order.id <> v_order.id
    and duplicate_order.status::text = 'pending';
  get diagnostics v_cancelled_duplicate_orders = row_count;

  return jsonb_build_object(
    'paid', true,
    'already_finalized', false,
    'discount_czk', v_order.discount_amount_czk,
    'cancelled_duplicate_orders', v_cancelled_duplicate_orders
  );
end;
$finalize$;

revoke all on function public.finalize_order_paid(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_order_paid(uuid)
  to authenticated;

comment on function public.finalize_order_paid(uuid) is
  'Finalizes a trusted order under the same profile-to-order lock order as checkout, grants access and cancels redundant pending route orders.';
