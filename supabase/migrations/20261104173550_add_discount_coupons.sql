-- Discount coupons are deliberately independent from referrals and credits.
-- A code is reserved in one locking transaction against a server-owned order;
-- concurrent checkouts therefore cannot exceed the activation limit.

create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null check (btrim(code) ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$'),
  normalized_code text generated always as (upper(btrim(code))) stored,
  title text not null default '',
  discount_type text not null check (discount_type in ('percent', 'fixed_czk')),
  discount_value integer not null check (
    (discount_type = 'percent' and discount_value between 1 and 99)
    or (discount_type = 'fixed_czk' and discount_value > 0)
  ),
  usage_limit integer not null check (usage_limit > 0),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  redeemed_count integer not null default 0 check (redeemed_count >= 0),
  applies_to_all_routes boolean not null default false,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_code),
  check (valid_until is null or valid_until > valid_from),
  check (reserved_count + redeemed_count <= usage_limit)
);

create table public.discount_code_routes (
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  route_id text not null references public.routes(id) on delete cascade,
  primary key (discount_code_id, route_id)
);

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  gross_amount_czk integer not null check (gross_amount_czk >= 0),
  discount_amount_czk integer not null check (discount_amount_czk > 0),
  status text not null default 'reserved' check (status in ('reserved', 'redeemed', 'released')),
  reserved_at timestamptz not null default now(),
  redeemed_at timestamptz,
  released_at timestamptz
);

-- The checkout context is kept outside the Data API. It proves that prices and
-- route IDs came from the catalogue instead of a client-side orders insert.
create table private.store_order_context (
  order_id uuid primary key references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  product_type text not null check (product_type in ('route', 'bundle')),
  product_id text not null,
  route_ids text[] not null check (cardinality(route_ids) > 0),
  gross_amount_czk integer not null check (gross_amount_czk > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  check (expires_at > created_at)
);

revoke all on private.store_order_context from public, anon, authenticated;

create index discount_redemptions_code_status_idx
  on public.discount_redemptions (discount_code_id, status);
create index discount_redemptions_user_created_idx
  on public.discount_redemptions (user_id, reserved_at desc);

alter table public.orders
  add column if not exists discount_code_id uuid references public.discount_codes(id) on delete restrict,
  add column if not exists discount_amount_czk integer not null default 0 check (discount_amount_czk >= 0);

-- Keep the coupon ledger independent, but preserve the order accounting
-- invariant when an installation already has optional store credits enabled.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'gross_amount_czk'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'credit_applied_czk'
  ) then
    execute 'alter table public.orders drop constraint if exists orders_credit_amounts_valid';
    execute $constraint$
      alter table public.orders add constraint orders_credit_amounts_valid check (
        gross_amount_czk > 0
        and credit_applied_czk >= 0
        and discount_amount_czk >= 0
        and amount_czk > 0
        and gross_amount_czk = amount_czk + credit_applied_czk + discount_amount_czk
      )
    $constraint$;
  end if;
end;
$$;

create or replace function private.touch_discount_code_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.code := upper(btrim(new.code));
  return new;
end;
$$;

revoke all on function private.touch_discount_code_updated_at() from public, anon, authenticated;

create trigger discount_codes_touch_updated_at
before insert or update on public.discount_codes
for each row execute function private.touch_discount_code_updated_at();

create or replace function private.discount_amount(
  p_discount_type text,
  p_discount_value integer,
  p_gross_amount_czk integer
)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select least(
    greatest(p_gross_amount_czk - 1, 0),
    case
      when p_discount_type = 'percent'
        then floor(greatest(p_gross_amount_czk, 0)::numeric * p_discount_value / 100)::integer
      else p_discount_value
    end
  );
$$;

revoke all on function private.discount_amount(text, integer, integer) from public, anon, authenticated;

create or replace function private.discount_routes_match(
  p_discount_code_id uuid,
  p_applies_to_all_routes boolean,
  p_route_ids text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(array_length(p_route_ids, 1), 0) > 0
    and (
      p_applies_to_all_routes
      or not exists (
        select 1
        from unnest(p_route_ids) as requested(route_id)
        where not exists (
          select 1 from public.discount_code_routes scope
          where scope.discount_code_id = p_discount_code_id
            and scope.route_id = requested.route_id
        )
      )
    );
$$;

revoke all on function private.discount_routes_match(uuid, boolean, text[]) from public, anon, authenticated;

create or replace function public.quote_discount_code(
  p_code text,
  p_route_ids text[],
  p_gross_amount_czk integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code public.discount_codes;
  v_discount integer;
begin
  if auth.uid() is null then
    raise exception 'Pro použití kupónu se přihlas.';
  end if;
  if p_gross_amount_czk <= 0 then
    raise exception 'Cena objednávky není platná.';
  end if;

  select * into v_code
  from public.discount_codes d
  where d.normalized_code = upper(btrim(p_code));

  if not found
    or not v_code.active
    or v_code.valid_from > now()
    or (v_code.valid_until is not null and v_code.valid_until <= now())
    or v_code.reserved_count + v_code.redeemed_count >= v_code.usage_limit
    or not private.discount_routes_match(v_code.id, v_code.applies_to_all_routes, p_route_ids)
  then
    raise exception 'Kupón není platný pro tento nákup.';
  end if;

  v_discount := private.discount_amount(v_code.discount_type, v_code.discount_value, p_gross_amount_czk);
  if v_discount <= 0 then raise exception 'Kupón pro tento nákup nevytváří slevu.'; end if;

  return jsonb_build_object(
    'discount_code_id', v_code.id,
    'code', v_code.code,
    'discount_type', v_code.discount_type,
    'discount_value', v_code.discount_value,
    'discount_amount_czk', v_discount,
    'payable_amount_czk', p_gross_amount_czk - v_discount
  );
end;
$$;

revoke all on function public.quote_discount_code(text, text[], integer) from public, anon;
grant execute on function public.quote_discount_code(text, text[], integer) to authenticated;

create or replace function private.reserve_discount_code(
  p_code text,
  p_user_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.discount_codes;
  v_order public.orders;
  v_context private.store_order_context;
  v_existing public.discount_redemptions;
  v_existing_code text;
  v_discount integer;
begin
  select * into v_order
  from public.orders o
  where o.id = p_order_id and o.user_id = p_user_id
  for update;
  if not found then raise exception 'Objednávka pro kupón nebyla nalezena.'; end if;

  select * into v_context
  from private.store_order_context c
  where c.order_id = p_order_id and c.user_id = p_user_id;
  if not found or v_context.route_ids is distinct from v_order.route_ids then
    raise exception 'Objednávka nevznikla ověřeným serverovým checkoutem.';
  end if;
  if v_context.expires_at <= now() then
    raise exception 'Objednávka pro kupón už vypršela.';
  end if;

  select * into v_existing
  from public.discount_redemptions r
  where r.order_id = p_order_id;
  if found then
    if v_existing.status = 'released' then
      raise exception 'Kupón této objednávky už byl uvolněn.';
    end if;
    select d.code into v_existing_code
    from public.discount_codes d
    where d.id = v_existing.discount_code_id;
    return jsonb_build_object(
      'discount_code_id', v_existing.discount_code_id,
      'code', v_existing_code,
      'discount_amount_czk', v_existing.discount_amount_czk,
      'payable_amount_czk', v_existing.gross_amount_czk - v_existing.discount_amount_czk
    );
  end if;
  if v_order.status::text <> 'pending' then
    raise exception 'Kupón lze použít jen na čekající objednávku.';
  end if;
  if v_order.discount_code_id is not null then
    raise exception 'Objednávka už má jiný kupón.';
  end if;
  if v_order.amount_czk <> v_context.gross_amount_czk then
    raise exception 'Cena objednávky neodpovídá serverovému checkoutu.';
  end if;

  select * into v_code
  from public.discount_codes d
  where d.normalized_code = upper(btrim(p_code))
  for update;

  if not found
    or not v_code.active
    or v_code.valid_from > now()
    or (v_code.valid_until is not null and v_code.valid_until <= now())
    or v_code.reserved_count + v_code.redeemed_count >= v_code.usage_limit
    or not private.discount_routes_match(v_code.id, v_code.applies_to_all_routes, v_order.route_ids)
  then
    raise exception 'Kupón není platný pro tento nákup.';
  end if;

  v_discount := private.discount_amount(v_code.discount_type, v_code.discount_value, v_order.amount_czk);
  if v_discount <= 0 then raise exception 'Kupón pro tento nákup nevytváří slevu.'; end if;

  update public.discount_codes
  set reserved_count = reserved_count + 1
  where id = v_code.id;

  insert into public.discount_redemptions (
    discount_code_id, user_id, order_id, gross_amount_czk, discount_amount_czk
  ) values (
    v_code.id, p_user_id, p_order_id, v_order.amount_czk, v_discount
  );

  update public.orders
  set discount_code_id = v_code.id,
      discount_amount_czk = v_discount,
      amount_czk = v_order.amount_czk - v_discount
  where id = p_order_id and user_id = p_user_id
    and status::text = 'pending' and discount_code_id is null;

  if not found then raise exception 'Objednávka pro kupón nebyla nalezena.'; end if;

  return jsonb_build_object(
    'discount_code_id', v_code.id,
    'code', v_code.code,
    'discount_amount_czk', v_discount,
    'payable_amount_czk', v_order.amount_czk - v_discount
  );
end;
$$;

revoke all on function private.reserve_discount_code(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.apply_discount_code_to_order(
  p_order_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Pro použití kupónu se přihlas.'; end if;
  return private.reserve_discount_code(p_code, auth.uid(), p_order_id);
end;
$$;

revoke all on function public.apply_discount_code_to_order(uuid, text) from public, anon;
grant execute on function public.apply_discount_code_to_order(uuid, text) to authenticated;

create or replace function private.redeem_reserved_discount(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redemption public.discount_redemptions;
begin
  select * into v_redemption
  from public.discount_redemptions r
  where r.order_id = p_order_id
  for update;
  if not found or v_redemption.status <> 'reserved' then return; end if;

  update public.discount_codes
  set reserved_count = reserved_count - 1,
      redeemed_count = redeemed_count + 1
  where id = v_redemption.discount_code_id and reserved_count > 0;
  if not found then raise exception 'Rezervace kupónu není konzistentní.'; end if;

  update public.discount_redemptions
  set status = 'redeemed', redeemed_at = now()
  where id = v_redemption.id;
end;
$$;

revoke all on function private.redeem_reserved_discount(uuid) from public, anon, authenticated;

create or replace function private.release_reserved_discount(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redemption public.discount_redemptions;
begin
  select * into v_redemption
  from public.discount_redemptions r
  where r.order_id = p_order_id
  for update;
  if not found or v_redemption.status <> 'reserved' then return; end if;

  update public.discount_codes
  set reserved_count = reserved_count - 1
  where id = v_redemption.discount_code_id and reserved_count > 0;
  if not found then raise exception 'Rezervace kupónu není konzistentní.'; end if;

  update public.discount_redemptions
  set status = 'released', released_at = now()
  where id = v_redemption.id;
end;
$$;

revoke all on function private.release_reserved_discount(uuid) from public, anon, authenticated;

create or replace function private.sync_discount_redemption_with_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text = 'paid' and old.status::text <> 'paid' then
    perform private.redeem_reserved_discount(new.id);
  elsif new.status::text in ('cancelled', 'rejected')
    and old.status::text not in ('cancelled', 'rejected') then
    perform private.release_reserved_discount(new.id);
  end if;
  return new;
end;
$$;

revoke all on function private.sync_discount_redemption_with_order() from public, anon, authenticated;

create trigger orders_sync_discount_redemption
after update of status on public.orders
for each row execute function private.sync_discount_redemption_with_order();

-- Orders may only be created and mutated by the narrow server RPCs below.
-- The original browser INSERT policy trusted route IDs and amounts supplied by
-- the client, which could otherwise turn an admin approval into a cheap unlock.
drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "orders_admin_update" on public.orders;
revoke all on public.orders from public, anon, authenticated;
grant select on public.orders to authenticated;
revoke all on public.routes from public, anon, authenticated;
grant select on public.routes to anon, authenticated;
revoke all on public.user_route_access from public, anon, authenticated;
grant select on public.user_route_access to authenticated;

create or replace function public.admin_upsert_discount_code(
  p_discount_code_id uuid,
  p_code text,
  p_title text,
  p_discount_type text,
  p_discount_value integer,
  p_usage_limit integer,
  p_applies_to_all_routes boolean,
  p_route_ids text[],
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_discount_code_id uuid;
  v_current_reserved integer;
  v_current_redeemed integer;
begin
  if auth.uid() is null or not private.is_cms_superadmin() then
    raise exception 'Kupóny může spravovat pouze superadmin.';
  end if;
  if btrim(coalesce(p_code, '')) !~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$' then
    raise exception 'Kód musí mít 3 až 32 znaků: písmena, čísla, pomlčku nebo podtržítko.';
  end if;
  if p_discount_type not in ('percent', 'fixed_czk')
    or (p_discount_type = 'percent' and p_discount_value not between 1 and 99)
    or (p_discount_type = 'fixed_czk' and p_discount_value <= 0)
  then
    raise exception 'Hodnota slevy není platná.';
  end if;
  if p_usage_limit <= 0 then raise exception 'Počet použití musí být kladný.'; end if;
  if p_valid_from is null or (p_valid_until is not null and p_valid_until <= p_valid_from) then
    raise exception 'Platnost kupónu není nastavena správně.';
  end if;
  if not p_applies_to_all_routes and coalesce(cardinality(p_route_ids), 0) = 0 then
    raise exception 'Vyber alespoň jednu trasu nebo povol všechny trasy.';
  end if;

  if p_discount_code_id is null then
    insert into public.discount_codes (
      code, title, discount_type, discount_value, usage_limit,
      applies_to_all_routes, active, valid_from, valid_until, created_by
    ) values (
      upper(btrim(p_code)), btrim(coalesce(p_title, '')), p_discount_type,
      p_discount_value, p_usage_limit, p_applies_to_all_routes, p_active,
      p_valid_from, p_valid_until, auth.uid()
    ) returning id into v_discount_code_id;
  else
    select reserved_count, redeemed_count
      into v_current_reserved, v_current_redeemed
    from public.discount_codes
    where id = p_discount_code_id
    for update;
    if not found then raise exception 'Kupón nebyl nalezen.'; end if;
    if p_usage_limit < v_current_reserved + v_current_redeemed then
      raise exception 'Limit nelze snížit pod počet rezervovaných a použitých kupónů.';
    end if;

    update public.discount_codes
    set code = upper(btrim(p_code)),
        title = btrim(coalesce(p_title, '')),
        discount_type = p_discount_type,
        discount_value = p_discount_value,
        usage_limit = p_usage_limit,
        applies_to_all_routes = p_applies_to_all_routes,
        active = p_active,
        valid_from = p_valid_from,
        valid_until = p_valid_until
    where id = p_discount_code_id;
    v_discount_code_id := p_discount_code_id;
  end if;

  delete from public.discount_code_routes
  where discount_code_id = v_discount_code_id;
  if not p_applies_to_all_routes then
    insert into public.discount_code_routes (discount_code_id, route_id)
    select v_discount_code_id, requested.route_id
    from (
      select distinct unnest(p_route_ids) as route_id
    ) requested;
  end if;

  return v_discount_code_id;
end;
$$;

revoke all on function public.admin_upsert_discount_code(
  uuid, text, text, text, integer, integer, boolean, text[], timestamptz, timestamptz, boolean
) from public, anon;
grant execute on function public.admin_upsert_discount_code(
  uuid, text, text, text, integer, integer, boolean, text[], timestamptz, timestamptz, boolean
) to authenticated;

alter table public.discount_codes enable row level security;
alter table public.discount_code_routes enable row level security;
alter table public.discount_redemptions enable row level security;

create policy "superadmin manages discount codes"
on public.discount_codes for all to authenticated
using (private.is_cms_superadmin())
with check (private.is_cms_superadmin());

create policy "superadmin manages discount route scope"
on public.discount_code_routes for all to authenticated
using (private.is_cms_superadmin())
with check (private.is_cms_superadmin());

create policy "superadmin reads discount redemptions"
on public.discount_redemptions for select to authenticated
using (private.is_cms_superadmin());

revoke all on public.discount_codes, public.discount_code_routes, public.discount_redemptions from public, anon, authenticated;
grant select, insert, update, delete on public.discount_codes, public.discount_code_routes to authenticated;
grant select on public.discount_redemptions to authenticated;

-- The browser never supplies a trusted amount. Checkout reads the live route
-- price, creates the pending order and reserves an optional coupon in one
-- transaction. This deliberately supports the currently sellable single-route
-- product; bundles will get their own server-owned catalogue in a later release.
create or replace function private.generate_order_variable_symbol()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_symbol text;
  v_attempt integer;
begin
  for v_attempt in 1..20 loop
    v_symbol := lpad((extract(epoch from clock_timestamp())::bigint % 100000000)::text, 8, '0')
      || lpad(floor(random() * 100)::integer::text, 2, '0');
    if not exists (select 1 from public.orders o where o.variable_symbol = v_symbol) then
      return v_symbol;
    end if;
  end loop;
  raise exception 'Variabilní symbol se nepodařilo vytvořit.';
end;
$$;

revoke all on function private.generate_order_variable_symbol() from public, anon, authenticated;

create or replace function public.create_route_checkout_order(
  p_route_id text,
  p_discount_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  select * into v_route
  from public.routes r
  where r.id = p_route_id and r.status = 'active' and r.price_czk > 0;
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

  select o.amount_czk into v_amount from public.orders o where o.id = v_order_id;
  return jsonb_build_object(
    'order_id', v_order_id,
    'variable_symbol', v_symbol,
    'gross_amount_czk', v_route.price_czk,
    'discount_amount_czk', v_discount,
    'amount_czk', v_amount
  );
end;
$$;

revoke all on function public.create_route_checkout_order(text, text) from public, anon;
grant execute on function public.create_route_checkout_order(text, text) to authenticated;

create or replace function public.finalize_order_paid(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders;
  v_context private.store_order_context;
begin
  if v_admin_id is null or not private.is_cms_superadmin() then
    raise exception 'Platbu může potvrdit pouze superadmin.';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Objednávka nebyla nalezena.'; end if;
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

  insert into public.user_route_access (user_id, route_id, order_id)
  select v_order.user_id, route_id, v_order.id
  from unnest(v_order.route_ids) as route_id
  on conflict (user_id, route_id) do update set order_id = excluded.order_id;

  update public.orders
  set status = 'paid', approved_by = v_admin_id, approved_at = now()
  where id = v_order.id;

  return jsonb_build_object(
    'paid', true,
    'already_finalized', false,
    'discount_czk', v_order.discount_amount_czk
  );
end;
$$;

revoke all on function public.finalize_order_paid(uuid) from public, anon;
grant execute on function public.finalize_order_paid(uuid) to authenticated;

create or replace function public.cancel_checkout_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if auth.uid() is null then raise exception 'Pro zrušení objednávky se přihlas.'; end if;
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'Objednávka nebyla nalezena.'; end if;
  if v_order.user_id <> auth.uid() and not private.is_cms_superadmin() then
    raise exception 'K objednávce nemáš oprávnění.';
  end if;
  if v_order.status::text <> 'pending' then
    raise exception 'Objednávku už nelze zrušit.';
  end if;
  update public.orders set status = 'cancelled' where id = v_order.id;
end;
$$;

revoke all on function public.cancel_checkout_order(uuid) from public, anon;
grant execute on function public.cancel_checkout_order(uuid) to authenticated;

comment on table public.discount_codes is 'Admin-managed percent or fixed-CZK coupons with a global activation limit.';
comment on table public.discount_redemptions is 'Atomic coupon reservations linked to orders; only paid orders become redeemed.';
comment on function public.quote_discount_code(text, text[], integer) is 'Informational checkout preview only; apply_discount_code_to_order is the authoritative server calculation.';
comment on function private.reserve_discount_code(text, uuid, uuid) is 'Atomically validates and reserves a coupon using server-owned order totals and route IDs.';
comment on function public.apply_discount_code_to_order(uuid, text) is 'Applies a coupon to the signed-in user pending order; client-provided prices are never trusted.';
comment on function public.admin_upsert_discount_code(uuid, text, text, text, integer, integer, boolean, text[], timestamptz, timestamptz, boolean) is 'Atomically creates or updates a coupon and its route scope; superadmin only.';
comment on function public.create_route_checkout_order(text, text) is 'Creates a single-route order from the live server price and atomically reserves an optional coupon.';
