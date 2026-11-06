-- Keep checkout aligned with the CMS publication lifecycle. The public
-- catalogue is a projection used by the storefront; it is not, by itself, an
-- authority that a route is commercially released.

-- The pilot was published before commercial_readiness existed. Preserve that
-- deliberate release only when its immutable publication, live catalogue row
-- and original superadmin publisher are all still present. No draft route is
-- promoted by this compatibility backfill.
do $pilot_release$
declare
  v_publisher_id uuid;
  v_previous_subject text := current_setting('request.jwt.claim.sub', true);
begin
  select publication.published_by into v_publisher_id
  from public.cms_routes cms
  join public.routes catalogue on catalogue.id = cms.id
  join public.cms_route_publications publication
    on publication.route_id = cms.id
   and publication.revision = cms.published_revision
  join public.profiles publisher on publisher.id = publication.published_by
  where cms.id = 'brno-kralovo-pole-stopy'
    and cms.lifecycle = 'active'
    and cms.commercial_readiness = 'blocked'
    and catalogue.status::text = 'active'
    and (publication.snapshot #>> '{route,availability}') = 'active'
    and publisher.role::text = 'superadmin'
  order by publication.published_at desc
  limit 1;

  if v_publisher_id is not null then
    perform set_config('request.jwt.claim.sub', v_publisher_id::text, true);
    update public.cms_routes
    set commercial_readiness = 'ready'
    where id = 'brno-kralovo-pole-stopy'
      and commercial_readiness = 'blocked';
    perform set_config('request.jwt.claim.sub', coalesce(v_previous_subject, ''), true);
  end if;
end;
$pilot_release$;

create or replace function public.create_route_checkout_order(
  p_route_id text,
  p_discount_code text default null
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

  -- Serialize checkouts for one account so two concurrent requests cannot hold
  -- two coupon reservations for the same route.
  perform 1 from public.profiles profile where profile.id = v_user_id for update;
  if not found then raise exception 'Profil hráče nebyl nalezen.'; end if;

  -- Expired QR orders no longer hold scarce coupon activations. The order
  -- status trigger releases the reservation in the same transaction.
  update public.orders expired_order
  set status = 'cancelled'
  from private.store_order_context context
  where context.order_id = expired_order.id
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

revoke all on function public.create_route_checkout_order(text, text)
  from public, anon, authenticated;
grant execute on function public.create_route_checkout_order(text, text)
  to authenticated;

comment on function public.create_route_checkout_order(text, text) is
  'Creates an order only for a commercially approved active CMS route backed by its immutable published revision and server-owned catalogue price.';
