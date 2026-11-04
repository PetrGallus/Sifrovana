-- Structured route CMS for Šifrovaná.
-- Published game payloads are snapshotted so editing a draft cannot silently
-- change a route that is already being played.

create table if not exists public.cms_routes (
  id text primary key,
  city_id text not null,
  city_name text not null default 'Brno',
  district text not null,
  title text not null,
  tagline text not null default '',
  description text not null default '',
  price_czk integer not null default 449 check (price_czk >= 0),
  distance_km numeric(6,2) not null default 0 check (distance_km >= 0),
  duration_min integer not null default 60 check (duration_min > 0),
  duration_max integer not null default 90 check (duration_max >= duration_min),
  difficulty text not null default 'Střední',
  availability text not null default 'coming'
    check (availability in ('active', 'coming', 'seasonal')),
  lifecycle text not null default 'draft'
    check (lifecycle in ('draft', 'review', 'testing', 'active', 'maintenance', 'retired')),
  version text not null default '0.1.0',
  team_min integer not null default 1 check (team_min > 0),
  team_max integer not null default 5 check (team_max >= team_min),
  audiences text[] not null default array['adults']::text[],
  language text not null default 'cs',
  seasonality text not null default 'year-round'
    check (seasonality in ('year-round', 'seasonal')),
  available_from date,
  available_to date,
  accessibility_note text not null default '',
  safety_note text not null default '',
  field_notes text not null default '',
  last_field_check date,
  equipment text[] not null default array[]::text[],
  hero_image_url text,
  hero_image_alt text,
  accent text not null default 'orange',
  map_x numeric(5,2) not null default 50 check (map_x between 0 and 100),
  map_y numeric(5,2) not null default 50 check (map_y between 0 and 100),
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  content_revision integer not null default 1 check (content_revision > 0),
  published_revision integer,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_to is null or available_from is null or available_to >= available_from)
);

create table if not exists public.cms_checkpoints (
  id text primary key,
  route_id text not null references public.cms_routes(id) on delete cascade,
  position integer not null check (position > 0),
  title text not null,
  short_title text not null default '',
  latitude numeric(9,6) not null check (latitude between -90 and 90),
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  checkpoint_type text not null default 'online'
    check (checkpoint_type in ('online', 'physical', 'hybrid')),
  distance_from_previous_km numeric(6,2) check (distance_from_previous_km >= 0),
  story text not null default '',
  puzzle_prompt text not null default '',
  accepted_answers text[] not null default array[]::text[],
  hint_1 text not null default '',
  hint_2 text not null default '',
  fallback_prompt text not null default '',
  fallback_answers text[] not null default array[]::text[],
  fact text not null default '',
  next_clue text not null default '',
  map_x numeric(5,2) not null default 50 check (map_x between 0 and 100),
  map_y numeric(5,2) not null default 50 check (map_y between 0 and 100),
  internal_notes text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cms_checkpoints_id_route_key unique (id, route_id),
  constraint cms_checkpoints_route_position_key
    unique (route_id, position) deferrable initially immediate
);

create table if not exists public.cms_sources (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.cms_routes(id) on delete cascade,
  checkpoint_id text,
  title text not null,
  url text not null check (url ~ '^https?://'),
  verified_at date,
  internal_note text not null default '',
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cms_sources_checkpoint_route_fk
    foreign key (checkpoint_id, route_id)
    references public.cms_checkpoints(id, route_id) on delete cascade
);

create unique index if not exists cms_sources_scope_url_unique
  on public.cms_sources (route_id, coalesce(checkpoint_id, ''), url);

create table if not exists public.cms_media (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.cms_routes(id) on delete cascade,
  checkpoint_id text,
  storage_path text not null unique,
  public_url text not null,
  media_role text not null default 'public'
    check (media_role in ('cover', 'public', 'field')),
  alt_text text not null default '',
  author_credit text not null default '',
  license text not null default '',
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cms_media_checkpoint_route_fk
    foreign key (checkpoint_id, route_id)
    references public.cms_checkpoints(id, route_id) on delete cascade
);

create table if not exists public.cms_route_publications (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.cms_routes(id) on delete restrict,
  version text not null,
  revision integer not null,
  snapshot jsonb not null,
  published_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default now(),
  unique (route_id, version),
  unique (route_id, revision)
);

create index if not exists cms_routes_lifecycle_idx on public.cms_routes (lifecycle, availability);
create index if not exists cms_routes_assigned_to_idx on public.cms_routes (assigned_to);
create index if not exists cms_checkpoints_route_position_idx on public.cms_checkpoints (route_id, position);
create index if not exists cms_sources_route_idx on public.cms_sources (route_id, checkpoint_id);
create index if not exists cms_media_route_idx on public.cms_media (route_id, checkpoint_id) where archived_at is null;

create or replace function private.touch_cms_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_cms_updated_at() from public, anon, authenticated;

drop trigger if exists cms_routes_touch_updated_at on public.cms_routes;
create trigger cms_routes_touch_updated_at
before update on public.cms_routes
for each row execute function private.touch_cms_updated_at();

drop trigger if exists cms_checkpoints_touch_updated_at on public.cms_checkpoints;
create trigger cms_checkpoints_touch_updated_at
before update on public.cms_checkpoints
for each row execute function private.touch_cms_updated_at();

drop trigger if exists cms_sources_touch_updated_at on public.cms_sources;
create trigger cms_sources_touch_updated_at
before update on public.cms_sources
for each row execute function private.touch_cms_updated_at();

drop trigger if exists cms_media_touch_updated_at on public.cms_media;
create trigger cms_media_touch_updated_at
before update on public.cms_media
for each row execute function private.touch_cms_updated_at();

create or replace function private.bump_cms_route_revision_from_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route_id text := case when tg_op = 'DELETE' then old.route_id else new.route_id end;
begin
  update public.cms_routes route
  set content_revision = route.content_revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where route.id = v_route_id;

  if tg_op = 'UPDATE' and old.route_id is distinct from new.route_id then
    update public.cms_routes route
    set content_revision = route.content_revision + 1,
        updated_at = now(),
        updated_by = auth.uid()
    where route.id = old.route_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.bump_cms_route_revision_from_child() from public, anon, authenticated;

create trigger cms_checkpoints_bump_route_revision
after insert or update or delete on public.cms_checkpoints
for each row execute function private.bump_cms_route_revision_from_child();
create trigger cms_sources_bump_route_revision
after insert or update or delete on public.cms_sources
for each row execute function private.bump_cms_route_revision_from_child();
create trigger cms_media_bump_route_revision
after insert or update or delete on public.cms_media
for each row execute function private.bump_cms_route_revision_from_child();

create or replace function private.is_cms_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'superadmin'
  );
$$;

create or replace function private.can_manage_cms_route(p_route_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.cms_routes r
    join public.profiles p on p.id = auth.uid()
    where r.id = p_route_id
      and (p.role::text = 'superadmin' or (p.role::text = 'route_manager' and r.assigned_to = p.id))
  );
$$;

revoke all on function private.is_cms_superadmin() from public;
revoke all on function private.can_manage_cms_route(text) from public;
grant execute on function private.is_cms_superadmin() to authenticated;
grant execute on function private.can_manage_cms_route(text) to authenticated;

create or replace function public.reorder_cms_checkpoint(
  p_route_id text,
  p_checkpoint_id text,
  p_new_position integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_position integer;
  v_other_id text;
begin
  if not private.can_manage_cms_route(p_route_id) then
    raise exception 'K této trase nemáš oprávnění.';
  end if;
  select position into v_current_position
  from public.cms_checkpoints
  where id = p_checkpoint_id and route_id = p_route_id
  for update;
  if not found then raise exception 'Checkpoint nebyl nalezen.'; end if;
  select id into v_other_id
  from public.cms_checkpoints
  where route_id = p_route_id and position = p_new_position
  for update;
  if not found then return; end if;

  set constraints cms_checkpoints_route_position_key deferred;
  update public.cms_checkpoints
  set position = case
    when id = p_checkpoint_id then p_new_position
    when id = v_other_id then v_current_position
  end
  where id in (p_checkpoint_id, v_other_id);
end;
$$;

revoke all on function public.reorder_cms_checkpoint(text, text, integer) from public, anon;
grant execute on function public.reorder_cms_checkpoint(text, text, integer) to authenticated;

create or replace function private.protect_cms_commerce_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role::text into v_role from public.profiles p where p.id = auth.uid();
  if v_role = 'route_manager' then
    if new.price_czk is distinct from old.price_czk
      or new.availability is distinct from old.availability
      or new.assigned_to is distinct from old.assigned_to
      or new.published_revision is distinct from old.published_revision
      or new.published_at is distinct from old.published_at then
      raise exception 'Správce trasy nemůže měnit prodejní nebo publikační údaje.';
    end if;
    if new.lifecycle is distinct from old.lifecycle and new.lifecycle <> 'review' then
      raise exception 'Správce trasy může koncept pouze předat ke kontrole.';
    end if;
  end if;
  if to_jsonb(new) - 'updated_at' - 'updated_by' - 'lifecycle' - 'published_revision' - 'published_at'
    is distinct from
    to_jsonb(old) - 'updated_at' - 'updated_by' - 'lifecycle' - 'published_revision' - 'published_at' then
    new.content_revision = old.content_revision + 1;
  end if;
  return new;
end;
$$;

revoke all on function private.protect_cms_commerce_fields() from public, anon, authenticated;

drop trigger if exists cms_routes_protect_commerce_fields on public.cms_routes;
create trigger cms_routes_protect_commerce_fields
before update on public.cms_routes
for each row execute function private.protect_cms_commerce_fields();

alter table public.cms_routes enable row level security;
alter table public.cms_checkpoints enable row level security;
alter table public.cms_sources enable row level security;
alter table public.cms_media enable row level security;
alter table public.cms_route_publications enable row level security;

drop policy if exists "cms routes are visible to assigned managers" on public.cms_routes;
create policy "cms routes are visible to assigned managers"
on public.cms_routes for select to authenticated
using (private.can_manage_cms_route(id));

drop policy if exists "superadmin creates cms routes" on public.cms_routes;
create policy "superadmin creates cms routes"
on public.cms_routes for insert to authenticated
with check (private.is_cms_superadmin());

drop policy if exists "assigned managers update cms routes" on public.cms_routes;
create policy "assigned managers update cms routes"
on public.cms_routes for update to authenticated
using (private.can_manage_cms_route(id))
with check (private.can_manage_cms_route(id));

drop policy if exists "cms managers read checkpoints" on public.cms_checkpoints;
create policy "cms managers read checkpoints"
on public.cms_checkpoints for select to authenticated
using (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers create checkpoints" on public.cms_checkpoints;
create policy "cms managers create checkpoints"
on public.cms_checkpoints for insert to authenticated
with check (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers update checkpoints" on public.cms_checkpoints;
create policy "cms managers update checkpoints"
on public.cms_checkpoints for update to authenticated
using (private.can_manage_cms_route(route_id))
with check (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers delete draft checkpoints" on public.cms_checkpoints;
create policy "cms managers delete draft checkpoints"
on public.cms_checkpoints for delete to authenticated
using (
  private.can_manage_cms_route(route_id)
  and exists (select 1 from public.cms_routes r where r.id = route_id and r.lifecycle in ('draft', 'review'))
);

drop policy if exists "cms managers read sources" on public.cms_sources;
create policy "cms managers read sources"
on public.cms_sources for select to authenticated
using (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers create sources" on public.cms_sources;
create policy "cms managers create sources"
on public.cms_sources for insert to authenticated
with check (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers update sources" on public.cms_sources;
create policy "cms managers update sources"
on public.cms_sources for update to authenticated
using (private.can_manage_cms_route(route_id))
with check (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers delete sources" on public.cms_sources;
create policy "cms managers delete sources"
on public.cms_sources for delete to authenticated
using (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers read media" on public.cms_media;
create policy "cms managers read media"
on public.cms_media for select to authenticated
using (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers create media" on public.cms_media;
create policy "cms managers create media"
on public.cms_media for insert to authenticated
with check (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers update media" on public.cms_media;
create policy "cms managers update media"
on public.cms_media for update to authenticated
using (private.can_manage_cms_route(route_id))
with check (private.can_manage_cms_route(route_id));

drop policy if exists "cms managers read publications" on public.cms_route_publications;
create policy "cms managers read publications"
on public.cms_route_publications for select to authenticated
using (private.can_manage_cms_route(route_id));

revoke all on public.cms_routes, public.cms_checkpoints, public.cms_sources,
  public.cms_media, public.cms_route_publications from public, anon, authenticated;
grant select, insert, update on public.cms_routes to authenticated;
grant select, insert, update, delete on public.cms_checkpoints to authenticated;
grant select, insert, update, delete on public.cms_sources to authenticated;
grant select, insert, update on public.cms_media to authenticated;
grant select on public.cms_route_publications to authenticated;

create or replace function public.publish_cms_route(p_route_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route public.cms_routes;
  v_snapshot jsonb;
  v_publication_id uuid;
  v_publish_version text;
begin
  if not private.is_cms_superadmin() then
    raise exception 'Publikovat trasu může pouze superadmin.';
  end if;

  select * into v_route from public.cms_routes where id = p_route_id for update;
  if not found then raise exception 'Trasa nebyla nalezena.'; end if;

  -- Publishing is idempotent for one content revision. This also makes a
  -- double tap in the CMS harmless and lets bootstrap migrations be retried.
  select publication.id, publication.version
    into v_publication_id, v_publish_version
  from public.cms_route_publications publication
  where publication.route_id = p_route_id
    and publication.revision = v_route.content_revision
  limit 1;
  if v_publication_id is not null then
    update public.cms_routes
    set lifecycle = 'active',
        availability = case when availability = 'seasonal' then 'seasonal' else 'active' end,
        published_revision = v_route.content_revision,
        published_at = coalesce(published_at, now()),
        updated_by = auth.uid()
    where id = p_route_id;
    return jsonb_build_object(
      'publication_id', v_publication_id,
      'route_id', p_route_id,
      'version', v_publish_version,
      'revision', v_route.content_revision,
      'already_published', true
    );
  end if;

  if v_route.title = '' or v_route.district = '' or v_route.tagline = '' then
    raise exception 'Trasa nemá vyplněné povinné základní údaje.';
  end if;
  if not exists (select 1 from public.cms_checkpoints c where c.route_id = p_route_id and c.is_active) then
    raise exception 'Trasa nemá žádný aktivní checkpoint.';
  end if;
  if not coalesce((
    select min(c.position) = 1
      and max(c.position) = count(*)
      and count(distinct c.position) = count(*)
    from public.cms_checkpoints c
    where c.route_id = p_route_id and c.is_active
  ), false) then
    raise exception 'Aktivní checkpointy musí mít souvislé pořadí 1 až N bez mezer.';
  end if;
  if exists (
    select 1 from public.cms_checkpoints c
    where c.route_id = p_route_id and c.is_active
      and (c.puzzle_prompt = '' or cardinality(c.accepted_answers) = 0 or c.hint_1 = '' or c.hint_2 = ''
        or c.fallback_prompt = '' or cardinality(c.fallback_answers) = 0 or c.fact = '')
  ) then
    raise exception 'Nejméně jeden checkpoint není připravený k publikaci.';
  end if;
  if not exists (select 1 from public.cms_sources s where s.route_id = p_route_id) then
    raise exception 'Před publikací doplň alespoň jeden ověřitelný zdroj.';
  end if;
  if exists (
    select 1 from public.cms_media m
    where m.route_id = p_route_id and m.archived_at is null and m.media_role <> 'field' and btrim(m.alt_text) = ''
  ) then
    raise exception 'Veřejné fotografie musí mít alternativní text.';
  end if;
  if v_route.availability = 'seasonal'
    and (v_route.available_from is null or v_route.available_to is null) then
    raise exception 'Sezónní trasa musí mít začátek i konec dostupnosti.';
  end if;

  update public.cms_routes
  set lifecycle = 'active',
      availability = case when availability = 'seasonal' then 'seasonal' else 'active' end,
      published_at = now(), updated_by = auth.uid()
  where id = p_route_id;
  select * into v_route from public.cms_routes where id = p_route_id;

  v_publish_version := v_route.version;
  if exists (
    select 1 from public.cms_route_publications publication
    where publication.route_id = p_route_id and publication.version = v_publish_version
  ) then
    v_publish_version := regexp_replace(v_route.version, '-r[0-9]+$', '')
      || '-r' || v_route.content_revision::text;
  end if;

  select jsonb_build_object(
    'route', (to_jsonb(r) - 'field_notes') || jsonb_build_object('version', v_publish_version),
    'checkpoints', coalesce((
      select jsonb_agg(to_jsonb(c) - 'internal_notes' order by c.position)
      from public.cms_checkpoints c where c.route_id = r.id and c.is_active
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(to_jsonb(s) - 'internal_note' order by s.sort_order, s.title)
      from public.cms_sources s where s.route_id = r.id
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.sort_order, m.created_at)
      from public.cms_media m where m.route_id = r.id and m.archived_at is null and m.media_role <> 'field'
    ), '[]'::jsonb)
  ) into v_snapshot
  from public.cms_routes r where r.id = p_route_id;

  insert into public.cms_route_publications (route_id, version, revision, snapshot, published_by)
  values (p_route_id, v_publish_version, v_route.content_revision, v_snapshot, auth.uid())
  returning id into v_publication_id;

  update public.cms_routes set published_revision = v_route.content_revision where id = p_route_id;

  insert into public.routes (
    id, city, district, title, tagline, price_czk, distance_km,
    duration_minutes, difficulty, checkpoint_count, xp_reward,
    status, accent, map_x, map_y, available_text
  ) values (
    v_route.id, v_route.city_name, v_route.district, v_route.title, v_route.tagline,
    v_route.price_czk, v_route.distance_km,
    round((v_route.duration_min + v_route.duration_max) / 2.0)::integer,
    v_route.difficulty,
    (select count(*)::integer from public.cms_checkpoints c where c.route_id = v_route.id and c.is_active),
    100, v_route.availability, v_route.accent,
    round(v_route.map_x)::integer, round(v_route.map_y)::integer,
    case when v_route.availability = 'coming' then 'v přípravě' else null end
  )
  on conflict (id) do update set
    city = excluded.city,
    district = excluded.district,
    title = excluded.title,
    tagline = excluded.tagline,
    price_czk = excluded.price_czk,
    distance_km = excluded.distance_km,
    duration_minutes = excluded.duration_minutes,
    difficulty = excluded.difficulty,
    checkpoint_count = excluded.checkpoint_count,
    status = excluded.status,
    accent = excluded.accent,
    map_x = excluded.map_x,
    map_y = excluded.map_y,
    available_text = excluded.available_text;

  return jsonb_build_object('publication_id', v_publication_id, 'route_id', p_route_id,
    'version', v_publish_version, 'revision', v_route.content_revision);
end;
$$;

revoke all on function public.publish_cms_route(text) from public, anon;
grant execute on function public.publish_cms_route(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'route-media', 'route-media', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cms route media uploads" on storage.objects;
create policy "cms route media uploads"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'route-media'
  and private.can_manage_cms_route((storage.foldername(name))[1])
);

drop policy if exists "cms route media reads" on storage.objects;
create policy "cms route media reads"
on storage.objects for select to authenticated
using (
  bucket_id = 'route-media'
  and private.can_manage_cms_route((storage.foldername(name))[1])
);

drop policy if exists "cms route media updates" on storage.objects;
create policy "cms route media updates"
on storage.objects for update to authenticated
using (
  bucket_id = 'route-media'
  and private.can_manage_cms_route((storage.foldername(name))[1])
)
with check (
  bucket_id = 'route-media'
  and private.can_manage_cms_route((storage.foldername(name))[1])
);

-- Seed the current product catalogue. Existing CMS edits are never overwritten.
insert into public.cms_routes (
  id, city_id, city_name, district, title, tagline, description, price_czk,
  distance_km, duration_min, duration_max, difficulty, availability, lifecycle,
  version, team_min, team_max, audiences, language, seasonality,
  accessibility_note, safety_note, equipment, accent, map_x, map_y
)
values
  (
    'brno-kralovo-pole-stopy', 'brno', 'Brno', 'Královo Pole', 'Stopy proměny',
    'Od koňky po tovární komíny. Poskládej ztracenou kroniku čtvrti.',
    'Poskládej pět ztracených listů kroniky a odhal proměnu Králova Pole.',
    449, 4.10, 90, 120, 'Střední', 'active', 'testing', '1.0.0', 1, 5,
    array['adults', 'couples', 'friends'], 'cs', 'year-round',
    'Městská pěší trasa; bezbariérovost musí potvrdit terénní kontrola.',
    'Před ostrým prodejem ověřit přechody, chodníky a přístup ke všem stopám.',
    array['Nabitý telefon', 'Pohodlné boty', 'Tužka'], 'orange', 47, 18
  ),
  (
    'brno-stred-pod-povrchem', 'brno', 'Brno', 'Brno-střed', 'Pod povrchem',
    'Legendy, průchody a příběhy, které centrum schovává pod dlažbou.', '',
    449, 3.60, 80, 100, 'Lehká', 'coming', 'draft', '0.1.0', 1, 5,
    array['adults', 'couples', 'friends'], 'cs', 'year-round',
    'Bude doplněno po terénním průzkumu.', 'Bude doplněno po terénním průzkumu.',
    array['Nabitý telefon', 'Pohodlné boty'], 'teal', 51, 50
  ),
  (
    'brno-zabovresky-vily', 'brno', 'Brno', 'Žabovřesky', 'Vily vyprávějí',
    'Architektura, zahrady a osudy lidí za zdmi známé čtvrti.', '',
    449, 4.80, 100, 130, 'Střední', 'coming', 'draft', '0.1.0', 1, 5,
    array['adults', 'couples', 'friends'], 'cs', 'year-round',
    'Bude doplněno po terénním průzkumu.', 'Bude doplněno po terénním průzkumu.',
    array['Nabitý telefon', 'Pohodlné boty'], 'blue', 35, 39
  )
on conflict (id) do nothing;

-- Preserve the prices already approved in the live catalogue. A later CMS
-- publication may change a price only after an editor explicitly saves it.
update public.cms_routes cms
set price_czk = catalogue.price_czk
from public.routes catalogue
where catalogue.id = cms.id
  and cms.published_at is null
  and cms.content_revision = 1;

comment on table public.cms_routes is 'Working route records editable by the Šifrovaná CMS. Playable content is imported privately and never committed with accepted answers.';
comment on table public.cms_route_publications is 'Immutable snapshots used as the future source of live games.';
comment on column public.cms_media.media_role is 'cover/public are player-facing; field is an internal terrain reference.';
