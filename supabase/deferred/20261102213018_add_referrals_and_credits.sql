-- DEFERRED: do not move this file into migrations until the referral release is approved.
-- Referral programme v1: one attribution per new player, a delayed reward for
-- the inviter, append-only credit accounting and atomic order finalisation.

create table public.referral_programs (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  reward_czk integer not null check (reward_czk > 0),
  min_paid_czk integer not null default 199 check (min_paid_czk > 0),
  reward_hold_days smallint not null default 14 check (reward_hold_days >= 0),
  max_apply_czk integer not null default 200 check (max_apply_czk > 0),
  max_apply_bps integer not null default 5000 check (max_apply_bps between 1 and 10000),
  minimum_cash_czk integer not null default 199 check (minimum_cash_czk > 0),
  active boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  terms_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create unique index referral_programs_one_active_idx
  on public.referral_programs (active) where active;

create table public.referral_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  code text not null unique check (code ~ '^SIF-[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text
);

create unique index referral_codes_one_active_per_user_idx
  on public.referral_codes (owner_user_id) where revoked_at is null;

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.referral_programs(id) on delete restrict,
  code_id uuid not null references public.referral_codes(id) on delete restrict,
  referrer_user_id uuid not null references public.profiles(id) on delete restrict,
  referred_user_id uuid not null unique references public.profiles(id) on delete restrict,
  status text not null default 'attributed'
    check (status in ('attributed', 'qualified', 'reversed', 'rejected')),
  attributed_at timestamptz not null default now(),
  qualified_order_id uuid unique references public.orders(id) on delete restrict,
  qualified_at timestamptz,
  reward_available_at timestamptz,
  reversed_at timestamptz,
  reason text,
  check (referrer_user_id <> referred_user_id)
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  entry_type text not null check (entry_type in (
    'referral_reward', 'order_spend', 'order_credit_refund',
    'referral_reversal', 'manual_credit', 'manual_debit'
  )),
  amount_czk integer not null check (amount_czk <> 0),
  currency char(3) not null default 'CZK' check (currency = 'CZK'),
  available_at timestamptz not null default now(),
  order_id uuid references public.orders(id) on delete restrict,
  referral_id uuid references public.referrals(id) on delete restrict,
  related_entry_id uuid references public.credit_ledger(id) on delete restrict,
  idempotency_key text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  check (
    (entry_type in ('referral_reward', 'order_credit_refund', 'manual_credit') and amount_czk > 0)
    or (entry_type in ('order_spend', 'referral_reversal', 'manual_debit') and amount_czk < 0)
  ),
  check (entry_type not in ('referral_reward', 'referral_reversal') or referral_id is not null),
  check (entry_type not in ('order_spend', 'order_credit_refund') or order_id is not null)
);

create unique index credit_ledger_one_referral_reward_idx
  on public.credit_ledger (referral_id) where entry_type = 'referral_reward';
create unique index credit_ledger_one_order_spend_idx
  on public.credit_ledger (order_id) where entry_type = 'order_spend';
create index credit_ledger_user_available_idx on public.credit_ledger (user_id, available_at);

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  amount_czk integer not null check (amount_czk > 0),
  status text not null default 'active'
    check (status in ('active', 'captured', 'released', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  captured_entry_id uuid unique references public.credit_ledger(id) on delete restrict,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'captured') = (captured_entry_id is not null))
);

create index credit_reservations_active_user_idx
  on public.credit_reservations (user_id, expires_at) where status = 'active';

create table public.commerce_packages (
  id text primary key,
  package_type text not null check (package_type in ('trio', 'full_city')),
  title text not null,
  price_czk integer not null check (price_czk > 0),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commerce_package_routes (
  package_id text not null references public.commerce_packages(id) on delete cascade,
  route_id text not null references public.routes(id) on delete restrict,
  sort_order integer not null default 0,
  primary key (package_id, route_id)
);

alter table public.orders add column gross_amount_czk integer;
alter table public.orders add column credit_applied_czk integer not null default 0;
alter table public.orders add column paid_amount_czk integer;
alter table public.orders add column expires_at timestamptz;

update public.orders
set gross_amount_czk = amount_czk,
    expires_at = created_at + interval '7 days'
where gross_amount_czk is null;

alter table public.orders alter column gross_amount_czk set not null;
alter table public.orders alter column expires_at set default (now() + interval '7 days');

alter table public.orders add constraint orders_credit_amounts_valid check (
  gross_amount_czk > 0
  and credit_applied_czk >= 0
  and amount_czk > 0
  and gross_amount_czk = amount_czk + credit_applied_czk
);

create or replace function private.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
    and auth.uid() is not null
    and not private.is_superadmin() then
    raise exception 'Roli účtu může změnit pouze superadmin.';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_profile_role() from public, anon, authenticated;
create trigger profiles_protect_role
before update on public.profiles
for each row execute function private.protect_profile_role();

create or replace function private.prevent_credit_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Kreditní deník je neměnný; oprava musí být nový protizápis.';
end;
$$;

revoke all on function private.prevent_credit_ledger_mutation() from public, anon, authenticated;
create trigger credit_ledger_immutable
before update or delete on public.credit_ledger
for each row execute function private.prevent_credit_ledger_mutation();

create or replace function private.referral_random_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_code text := 'SIF-';
  i integer;
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return v_code;
end;
$$;

revoke all on function private.referral_random_code() from public, anon, authenticated;

create or replace function private.referral_credit_balance_for(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    coalesce((
      select sum(l.amount_czk)::integer
      from public.credit_ledger l
      where l.user_id = p_user_id and l.available_at <= now()
    ), 0)
    - coalesce((
      select sum(r.amount_czk)::integer
      from public.credit_reservations r
      where r.user_id = p_user_id and r.status = 'active'
    ), 0)
  );
$$;

revoke all on function private.referral_credit_balance_for(uuid) from public, anon, authenticated;

create or replace function public.get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  i integer;
begin
  if v_user_id is null then raise exception 'Pro referral odkaz se přihlas.'; end if;
  perform 1 from public.profiles where id = v_user_id for update;
  select code into v_code from public.referral_codes
  where owner_user_id = v_user_id and revoked_at is null;
  if v_code is not null then return v_code; end if;

  for i in 1..8 loop
    v_code := private.referral_random_code();
    begin
      insert into public.referral_codes (owner_user_id, code) values (v_user_id, v_code);
      return v_code;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  raise exception 'Referral kód se nepodařilo vytvořit. Zkus to znovu.';
end;
$$;

revoke all on function public.get_or_create_referral_code() from public, anon;
grant execute on function public.get_or_create_referral_code() to authenticated;

create or replace function public.claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code public.referral_codes;
  v_program public.referral_programs;
  v_referral_id uuid;
begin
  if v_user_id is null then raise exception 'Pro přijetí pozvánky se přihlas.'; end if;
  select * into v_code from public.referral_codes
  where code = upper(btrim(p_code)) and revoked_at is null;
  if not found then raise exception 'Pozvánka není platná.'; end if;
  if v_code.owner_user_id = v_user_id then raise exception 'Vlastní pozvánku nelze použít.'; end if;
  if exists (select 1 from public.referrals where referred_user_id = v_user_id) then
    return jsonb_build_object('claimed', false, 'reason', 'already_attributed');
  end if;
  if exists (select 1 from public.orders where user_id = v_user_id) then
    raise exception 'Pozvánku lze přijmout jen před první objednávkou.';
  end if;
  select * into v_program from public.referral_programs
  where active and starts_at <= now() and (ends_at is null or ends_at > now());
  if not found then raise exception 'Referral program právě není aktivní.'; end if;

  insert into public.referrals (program_id, code_id, referrer_user_id, referred_user_id)
  values (v_program.id, v_code.id, v_code.owner_user_id, v_user_id)
  returning id into v_referral_id;
  return jsonb_build_object('claimed', true, 'referral_id', v_referral_id);
end;
$$;

revoke all on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

create or replace function public.referral_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_program public.referral_programs;
begin
  if v_user_id is null then raise exception 'Pro přehled se přihlas.'; end if;
  v_code := public.get_or_create_referral_code();
  select * into v_program from public.referral_programs
  where active and starts_at <= now() and (ends_at is null or ends_at > now());
  return jsonb_build_object(
    'code', v_code,
    'available_credit_czk', private.referral_credit_balance_for(v_user_id),
    'pending_credit_czk', coalesce((
      select sum(l.amount_czk)::integer from public.credit_ledger l
      where l.user_id = v_user_id and l.entry_type = 'referral_reward' and l.available_at > now()
    ), 0),
    'invited_count', (select count(*) from public.referrals r where r.referrer_user_id = v_user_id),
    'rewarded_count', (select count(*) from public.referrals r where r.referrer_user_id = v_user_id and r.status = 'qualified'),
    'reward_czk', coalesce(v_program.reward_czk, 0),
    'hold_days', coalesce(v_program.reward_hold_days, 0),
    'max_apply_czk', coalesce(v_program.max_apply_czk, 0),
    'max_apply_bps', coalesce(v_program.max_apply_bps, 0),
    'minimum_cash_czk', coalesce(v_program.minimum_cash_czk, 0)
  );
end;
$$;

revoke all on function public.referral_dashboard() from public, anon;
grant execute on function public.referral_dashboard() to authenticated;

create or replace function private.generate_variable_symbol()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_symbol text;
  i integer;
begin
  for i in 1..20 loop
    v_symbol := lpad((extract(epoch from clock_timestamp())::bigint % 100000000)::text, 8, '0')
      || lpad(floor(random() * 100)::integer::text, 2, '0');
    if not exists (select 1 from public.orders where variable_symbol = v_symbol) then return v_symbol; end if;
  end loop;
  raise exception 'Variabilní symbol se nepodařilo vytvořit.';
end;
$$;

revoke all on function private.generate_variable_symbol() from public, anon, authenticated;

create or replace function public.create_checkout_order(
  p_product_type text,
  p_product_id text,
  p_use_credit boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_route_ids text[];
  v_package_type text;
  v_gross integer;
  v_credit integer := 0;
  v_available integer := 0;
  v_program public.referral_programs;
  v_order_id uuid;
  v_symbol text;
begin
  if v_user_id is null then raise exception 'Pro nákup se přihlas.'; end if;

  if p_product_type = 'route' then
    select array[r.id], 'single', r.price_czk
      into v_route_ids, v_package_type, v_gross
    from public.routes r
    where r.id = p_product_id and r.status = 'active';
  elsif p_product_type = 'bundle' then
    select array_agg(pr.route_id order by pr.sort_order), p.package_type, p.price_czk
      into v_route_ids, v_package_type, v_gross
    from public.commerce_packages p
    join public.commerce_package_routes pr on pr.package_id = p.id
    where p.id = p_product_id and p.active
      and not exists (
        select 1 from public.commerce_package_routes check_pr
        join public.routes check_route on check_route.id = check_pr.route_id
        where check_pr.package_id = p.id and check_route.status <> 'active'
      )
    group by p.id;
  else
    raise exception 'Neznámý typ produktu.';
  end if;
  if v_gross is null or cardinality(v_route_ids) = 0 then
    raise exception 'Produkt není dostupný k nákupu.';
  end if;

  perform 1 from public.profiles where id = v_user_id for update;
  update public.credit_reservations
  set status = 'expired', release_reason = 'QR objednávka vypršela', updated_at = now()
  where user_id = v_user_id and status = 'active' and expires_at <= now();
  update public.orders o
  set status = 'cancelled'
  where o.user_id = v_user_id and o.status::text = 'pending' and o.expires_at <= now();
  if p_use_credit then
    select * into v_program from public.referral_programs
    where active and starts_at <= now() and (ends_at is null or ends_at > now());
    if found then
      v_available := private.referral_credit_balance_for(v_user_id);
      v_credit := least(
        v_available,
        v_program.max_apply_czk,
        floor(v_gross * v_program.max_apply_bps / 10000.0)::integer,
        greatest(0, v_gross - v_program.minimum_cash_czk)
      );
    end if;
  end if;

  v_symbol := private.generate_variable_symbol();
  insert into public.orders (
    user_id, package_type, route_ids, amount_czk, gross_amount_czk,
    credit_applied_czk, variable_symbol, status, expires_at
  ) values (
    v_user_id, v_package_type, v_route_ids, v_gross - v_credit, v_gross,
    v_credit, v_symbol, 'pending', now() + interval '7 days'
  ) returning id into v_order_id;

  if v_credit > 0 then
    insert into public.credit_reservations (user_id, order_id, amount_czk, expires_at)
    values (v_user_id, v_order_id, v_credit, now() + interval '7 days');
  end if;

  return jsonb_build_object(
    'order_id', v_order_id,
    'variable_symbol', v_symbol,
    'gross_amount_czk', v_gross,
    'credit_applied_czk', v_credit,
    'amount_czk', v_gross - v_credit,
    'expires_at', now() + interval '7 days'
  );
end;
$$;

revoke all on function public.create_checkout_order(text, text, boolean) from public, anon;
grant execute on function public.create_checkout_order(text, text, boolean) to authenticated;

create or replace function private.reward_referral_after_paid_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referral public.referrals;
  v_program public.referral_programs;
  v_available_at timestamptz;
begin
  if new.status::text <> 'paid' or old.status::text = 'paid' then return new; end if;
  select * into v_referral from public.referrals
  where referred_user_id = new.user_id and status = 'attributed'
  for update;
  if not found then return new; end if;
  if exists (
    select 1 from public.orders o
    where o.user_id = new.user_id and o.id <> new.id and o.status::text = 'paid'
  ) then return new; end if;
  select * into v_program from public.referral_programs where id = v_referral.program_id;
  if new.amount_czk < v_program.min_paid_czk then return new; end if;

  v_available_at := now() + make_interval(days => v_program.reward_hold_days);
  insert into public.credit_ledger (
    user_id, entry_type, amount_czk, available_at, order_id, referral_id,
    idempotency_key, reason
  ) values (
    v_referral.referrer_user_id, 'referral_reward', v_program.reward_czk,
    v_available_at, new.id, v_referral.id,
    'referral-reward:' || v_referral.id::text,
    'Odměna za první zaplacenou objednávku pozvaného hráče'
  ) on conflict (idempotency_key) do nothing;

  update public.referrals
  set status = 'qualified', qualified_order_id = new.id, qualified_at = now(),
      reward_available_at = v_available_at
  where id = v_referral.id;
  return new;
end;
$$;

revoke all on function private.reward_referral_after_paid_order() from public, anon, authenticated;
create trigger orders_reward_referral_after_paid
after update of status on public.orders
for each row execute function private.reward_referral_after_paid_order();

create or replace function public.finalize_order_paid(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_order public.orders;
  v_reservation public.credit_reservations;
  v_ledger_id uuid;
begin
  if not private.is_superadmin() then raise exception 'Platbu může potvrdit pouze superadmin.'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Objednávka nebyla nalezena.'; end if;
  if v_order.status::text = 'paid' then
    return jsonb_build_object('paid', true, 'already_finalized', true);
  end if;
  if v_order.status::text <> 'pending' then
    raise exception 'Objednávka není ve stavu čekající na platbu.';
  end if;

  perform 1 from public.profiles
  where id in (v_order.user_id, v_admin_id)
  order by id for update;

  select * into v_reservation from public.credit_reservations
  where order_id = p_order_id and status = 'active' for update;
  if found then
    insert into public.credit_ledger (
      user_id, entry_type, amount_czk, order_id,
      idempotency_key, created_by, reason
    ) values (
      v_order.user_id, 'order_spend', -v_reservation.amount_czk, v_order.id,
      'order-spend:' || v_order.id::text, v_admin_id, 'Kredit použitý na objednávku'
    ) returning id into v_ledger_id;

    update public.credit_reservations
    set status = 'captured', captured_entry_id = v_ledger_id, updated_at = now()
    where id = v_reservation.id;
  end if;

  insert into public.user_route_access (user_id, route_id, order_id)
  select v_order.user_id, route_id, v_order.id
  from unnest(v_order.route_ids) as route_id
  on conflict (user_id, route_id) do update set order_id = excluded.order_id;

  update public.orders
  set status = 'paid', paid_amount_czk = amount_czk,
      approved_by = v_admin_id, approved_at = now()
  where id = v_order.id;

  return jsonb_build_object('paid', true, 'already_finalized', false,
    'credit_czk', coalesce(v_reservation.amount_czk, 0));
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
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Objednávka nebyla nalezena.'; end if;
  if v_order.user_id <> auth.uid() and not private.is_superadmin() then
    raise exception 'K objednávce nemáš oprávnění.';
  end if;
  if v_order.status::text <> 'pending' then raise exception 'Objednávku už nelze zrušit.'; end if;
  update public.credit_reservations
  set status = 'released', release_reason = 'Objednávka zrušena', updated_at = now()
  where order_id = p_order_id and status = 'active';
  update public.orders set status = 'cancelled' where id = p_order_id;
end;
$$;

revoke all on function public.cancel_checkout_order(uuid) from public, anon;
grant execute on function public.cancel_checkout_order(uuid) to authenticated;

create or replace function public.replace_referral_program(
  p_reward_czk integer,
  p_min_paid_czk integer,
  p_reward_hold_days smallint,
  p_max_apply_czk integer,
  p_max_apply_bps integer,
  p_minimum_cash_czk integer,
  p_terms_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.referral_programs;
begin
  if not private.is_superadmin() then
    raise exception 'Referral program může změnit pouze superadmin.';
  end if;
  update public.referral_programs
  set active = false, ends_at = coalesce(ends_at, now()), updated_at = now()
  where active;
  insert into public.referral_programs (
    version, reward_czk, min_paid_czk, reward_hold_days, max_apply_czk,
    max_apply_bps, minimum_cash_czk, active, starts_at, terms_version
  ) values (
    'program-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'),
    p_reward_czk, p_min_paid_czk, p_reward_hold_days, p_max_apply_czk,
    p_max_apply_bps, p_minimum_cash_czk, true, now(), p_terms_version
  ) returning * into v_program;
  return to_jsonb(v_program);
end;
$$;

revoke all on function public.replace_referral_program(integer, integer, smallint, integer, integer, integer, text) from public, anon;
grant execute on function public.replace_referral_program(integer, integer, smallint, integer, integer, integer, text) to authenticated;

alter table public.referral_programs enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.commerce_packages enable row level security;
alter table public.commerce_package_routes enable row level security;

create policy "authenticated reads active referral program"
on public.referral_programs for select to authenticated
using (active or private.is_superadmin());

create policy "superadmin manages referral program"
on public.referral_programs for all to authenticated
using (private.is_superadmin()) with check (private.is_superadmin());

create policy "users read own referral code"
on public.referral_codes for select to authenticated
using (owner_user_id = auth.uid() or private.is_superadmin());

create policy "participants read own referrals"
on public.referrals for select to authenticated
using (referrer_user_id = auth.uid() or referred_user_id = auth.uid() or private.is_superadmin());

create policy "users read own credit ledger"
on public.credit_ledger for select to authenticated
using (user_id = auth.uid() or private.is_superadmin());

create policy "users read own credit reservations"
on public.credit_reservations for select to authenticated
using (user_id = auth.uid() or private.is_superadmin());

create policy "anonymous reads active commerce packages"
on public.commerce_packages for select to anon
using (active);

create policy "authenticated reads commerce packages"
on public.commerce_packages for select to authenticated
using (active or private.is_superadmin());

create policy "anonymous reads routes of active commerce packages"
on public.commerce_package_routes for select to anon
using (
  exists (
    select 1 from public.commerce_packages p
    where p.id = package_id and p.active
  )
);

create policy "authenticated reads commerce package routes"
on public.commerce_package_routes for select to authenticated
using (
  exists (
    select 1 from public.commerce_packages p
    where p.id = package_id and (p.active or private.is_superadmin())
  )
);

create policy "superadmin manages commerce packages"
on public.commerce_packages for all to authenticated
using (private.is_superadmin()) with check (private.is_superadmin());

create policy "superadmin manages commerce package routes"
on public.commerce_package_routes for all to authenticated
using (private.is_superadmin()) with check (private.is_superadmin());

grant select, insert, update on public.referral_programs to authenticated;
grant select on public.referral_codes, public.referrals, public.credit_ledger, public.credit_reservations to authenticated;
grant select on public.commerce_packages, public.commerce_package_routes to anon, authenticated;
grant insert, update, delete on public.commerce_packages, public.commerce_package_routes to authenticated;

-- Replace prototype-wide grants with the smallest browser permissions needed.
drop policy if exists orders_insert_own on public.orders;
revoke all on public.orders from anon;
revoke all on public.orders from authenticated;
grant select on public.orders to authenticated;

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_url, home_city, bio) on public.profiles to authenticated;

revoke all on public.routes from anon, authenticated;
grant select on public.routes to anon, authenticated;

revoke all on public.route_managers from anon, authenticated;
grant select, insert, update, delete on public.route_managers to authenticated;

revoke all on public.user_route_access from anon, authenticated;
grant select on public.user_route_access to authenticated;

insert into public.referral_programs (
  version, reward_czk, min_paid_czk, reward_hold_days,
  max_apply_czk, max_apply_bps, minimum_cash_czk, active, terms_version
)
values ('brno-pilot-v1', 100, 199, 14, 200, 5000, 199, true, '2026-11');

insert into public.commerce_packages (id, package_type, title, price_czk, active)
values ('brno-trio', 'trio', 'Brněnská trilogie', 999, false);

insert into public.commerce_package_routes (package_id, route_id, sort_order)
values
  ('brno-trio', 'brno-kralovo-pole-stopy', 1),
  ('brno-trio', 'brno-stred-pod-povrchem', 2),
  ('brno-trio', 'brno-zabovresky-vily', 3);

comment on table public.credit_ledger is 'Append-only source of truth for non-cash route credits.';
comment on column public.referral_programs.max_apply_bps is 'Maximum credit share of an order; 5000 means 50 percent.';
comment on table public.credit_reservations is 'Temporary credit holds for unpaid QR orders.';
