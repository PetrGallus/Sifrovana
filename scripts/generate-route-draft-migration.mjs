import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentFiles = [
  "content/route-checkpoint-drafts/medlanky.json",
  "content/route-checkpoint-drafts/reckovice.json",
  "content/route-checkpoint-drafts/cerna-pole-a-vanoce.json",
];
const defaultOutput = "supabase/migrations/20261106131056_seed_northern_route_checkpoint_drafts.sql";
const outputFile = resolve(repositoryRoot, process.argv[2] ?? defaultOutput);
const requiredCheckpointFields = [
  "slug", "title", "short_title", "latitude", "longitude", "checkpoint_type",
  "story", "puzzle_prompt", "candidate_answers", "hint_1", "hint_2",
  "fallback_prompt", "fact", "next_clue", "internal_notes",
];
const expectedRouteIds = new Set([
  "brno-medlanky-pecet-parku",
  "brno-medlanky-zabi-posta",
  "brno-medlanky-kridla-stepi",
  "brno-cerna-pole-moderni",
  "brno-cerna-pole-zelena-veda",
  "brno-cerna-pole-99-schodu",
  "brno-reckovice-pecet-vavrince",
  "brno-reckovice-nove-mesto",
  "brno-mokra-hora-ponavka",
  "brno-vanoce-betlem-z-lip",
]);
const conceptRouteIds = [
  ...expectedRouteIds,
  "brno-vanoce-kosmicka-hvezda",
  "brno-vanoce-zoo-advent",
];

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const routeIds = new Set();
const checkpointIds = new Set();
const drafts = [];

for (const relativeFile of contentFiles) {
  const source = JSON.parse(await readFile(resolve(repositoryRoot, relativeFile), "utf8"));
  assert(source.schemaVersion === 1, `${relativeFile}: unsupported schemaVersion`);
  assert(Array.isArray(source.routes) && source.routes.length > 0, `${relativeFile}: routes are missing`);
  for (const route of source.routes) {
    assert(typeof route.route_id === "string" && route.route_id.length > 0, `${relativeFile}: route_id is missing`);
    assert(!routeIds.has(route.route_id), `${relativeFile}: duplicate route ${route.route_id}`);
    routeIds.add(route.route_id);
    assert(/^https:\/\//.test(route.source_url), `${route.route_id}: source_url must use HTTPS`);
    assert(typeof route.source_title === "string" && route.source_title.length > 0, `${route.route_id}: source_title is missing`);
    assert(Array.isArray(route.checkpoints) && route.checkpoints.length >= 5, `${route.route_id}: too few checkpoints`);
    route.checkpoints.forEach((checkpoint, index) => {
      const label = `${route.route_id} checkpoint ${index + 1}`;
      assert(checkpoint.position === index + 1, `${label}: positions must be contiguous from 1`);
      requiredCheckpointFields.forEach((field) => assert(checkpoint[field] !== undefined && checkpoint[field] !== "", `${label}: ${field} is missing`));
      assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(checkpoint.slug), `${label}: slug must contain lowercase ASCII letters, digits and hyphens only`);
      assert(["online", "physical", "hybrid"].includes(checkpoint.checkpoint_type), `${label}: invalid checkpoint_type`);
      assert(Number.isFinite(checkpoint.latitude) && checkpoint.latitude >= -90 && checkpoint.latitude <= 90, `${label}: invalid latitude`);
      assert(Number.isFinite(checkpoint.longitude) && checkpoint.longitude >= -180 && checkpoint.longitude <= 180, `${label}: invalid longitude`);
      assert(Array.isArray(checkpoint.candidate_answers) && checkpoint.candidate_answers.length > 0, `${label}: candidate_answers are missing`);
      assert(checkpoint.internal_notes.startsWith("ORIENTAČNÍ SOUŘADNICE — TERÉNNĚ OVĚŘIT."), `${label}: mandatory field warning is missing`);
      const id = `${route.route_id}-${checkpoint.slug}`;
      assert(!checkpointIds.has(id), `${label}: duplicate id ${id}`);
      checkpointIds.add(id);
      const sourceUrl = checkpoint.source_url ?? route.source_url;
      assert(Boolean(checkpoint.source_url) === Boolean(checkpoint.source_title), `${label}: source override requires both source_url and source_title`);
      assert(/^https:\/\//.test(sourceUrl), `${label}: source_url must use HTTPS`);
      drafts.push({
        id,
        route_id: route.route_id,
        checkpoint_count: route.checkpoints.length,
        position: checkpoint.position,
        title: checkpoint.title,
        short_title: checkpoint.short_title,
        latitude: checkpoint.latitude,
        longitude: checkpoint.longitude,
        checkpoint_type: checkpoint.checkpoint_type,
        story: checkpoint.story,
        puzzle_prompt: checkpoint.puzzle_prompt,
        candidate_answers: checkpoint.candidate_answers,
        hint_1: checkpoint.hint_1,
        hint_2: checkpoint.hint_2,
        fallback_prompt: checkpoint.fallback_prompt,
        fact: checkpoint.fact,
        next_clue: checkpoint.next_clue,
        meta_token: checkpoint.meta_token ?? null,
        internal_notes: checkpoint.internal_notes,
        source_title: checkpoint.source_title ?? route.source_title,
        source_url: sourceUrl,
      });
    });
  }
}

assert(routeIds.size === 10, `Expected 10 authored routes, received ${routeIds.size}`);
assert([...routeIds].every((routeId) => expectedRouteIds.has(routeId)), "Draft content contains an unexpected route id");
assert([...expectedRouteIds].every((routeId) => routeIds.has(routeId)), "Draft content is missing an expected route id");
assert(drafts.length >= 65, `Expected at least 65 checkpoint drafts, received ${drafts.length}`);

const json = JSON.stringify(drafts, null, 2);
assert(!json.includes("$route_checkpoint_drafts$"), "SQL dollar-quote delimiter occurs in content");
const conceptRouteSql = conceptRouteIds.map(sqlString).join(",\n    ");

const sql = `-- Generated by scripts/generate-route-draft-migration.mjs.
-- Editorial checkpoint briefs only: every point starts excluded from publication,
-- carries approximate coordinates and has no accepted production answers.

alter table public.cms_routes
  add column if not exists commercial_readiness text not null default 'blocked';

do $commercial_readiness_constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.cms_routes'::regclass
      and constraint_definition.conname = 'cms_routes_commercial_readiness_check'
  ) then
    alter table public.cms_routes
      add constraint cms_routes_commercial_readiness_check
      check (commercial_readiness in ('blocked', 'ready'));
  end if;
end;
$commercial_readiness_constraint$;

do $seasonality_constraint$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_definition
    where constraint_definition.conrelid = 'public.cms_routes'::regclass
      and constraint_definition.conname = 'cms_routes_availability_seasonality_check'
  ) then
    alter table public.cms_routes
      add constraint cms_routes_availability_seasonality_check
      check ((availability = 'seasonal') = (seasonality = 'seasonal'));
  end if;
end;
$seasonality_constraint$;

comment on column public.cms_routes.commercial_readiness is
  'Explicit superadmin gate. Only ready routes may create a publication snapshot; new and concept routes default to blocked.';

alter table public.cms_checkpoints
  add column if not exists meta_token text;

comment on column public.cms_checkpoints.meta_token is
  'Optional fragment, letter or symbol awarded after solving the checkpoint and usable by a route meta-puzzle.';

create temporary table route_checkpoint_draft_seed on commit drop as
select *
from jsonb_to_recordset(
$route_checkpoint_drafts$
${json}
$route_checkpoint_drafts$::jsonb
) as draft(
  id text,
  route_id text,
  checkpoint_count integer,
  position integer,
  title text,
  short_title text,
  latitude numeric,
  longitude numeric,
  checkpoint_type text,
  story text,
  puzzle_prompt text,
  candidate_answers jsonb,
  hint_1 text,
  hint_2 text,
  fallback_prompt text,
  fact text,
  next_clue text,
  meta_token text,
  internal_notes text,
  source_title text,
  source_url text
);

do $validation$
begin
  if exists (
    select 1 from route_checkpoint_draft_seed seed
    left join public.cms_routes route on route.id = seed.route_id
    where route.id is null
  ) then
    raise exception 'Checkpoint draft references a missing CMS route.';
  end if;
  if exists (
    select 1 from route_checkpoint_draft_seed
    group by route_id
    having min(position) <> 1
      or max(position) <> count(*)
      or count(distinct position) <> count(*)
  ) then
    raise exception 'Checkpoint positions must be contiguous within every route.';
  end if;
end;
$validation$;

insert into public.cms_checkpoints (
  id, route_id, position, title, short_title, latitude, longitude,
  checkpoint_type, distance_from_previous_km, story, puzzle_prompt,
  accepted_answers, hint_1, hint_2, fallback_prompt, fallback_answers,
  fact, next_clue, meta_token, map_x, map_y, internal_notes, is_active
)
select
  seed.id,
  seed.route_id,
  seed.position,
  seed.title,
  seed.short_title,
  seed.latitude,
  seed.longitude,
  seed.checkpoint_type,
  case when seed.position = 1 then 0 else null end,
  seed.story,
  seed.puzzle_prompt,
  array[]::text[],
  seed.hint_1,
  seed.hint_2,
  seed.fallback_prompt,
  array[]::text[],
  seed.fact,
  seed.next_clue,
  seed.meta_token,
  round((10 + (seed.position - 1) * 80.0 / greatest(seed.checkpoint_count - 1, 1))::numeric, 2),
  case seed.position % 4 when 1 then 34 when 2 then 55 when 3 then 68 else 46 end,
  seed.internal_notes || E'\\nKandidátní odpovědi (neaktivní, ověřit v terénu): '
    || (select string_agg(value #>> '{}', ', ') from jsonb_array_elements(seed.candidate_answers)),
  false
from route_checkpoint_draft_seed seed
join public.cms_routes route on route.id = seed.route_id
on conflict (id) do nothing;

insert into public.cms_sources (
  route_id, checkpoint_id, title, url, verified_at, internal_note, sort_order
)
select
  seed.route_id,
  seed.id,
  seed.source_title,
  seed.source_url,
  null,
  'Pracovní zdroj checkpointu. Před publikací ověřit konkrétní tvrzení a zapsat datum kontroly.',
  100 + seed.position
from route_checkpoint_draft_seed seed
on conflict (route_id, coalesce(checkpoint_id, ''), url) do nothing;

-- The portfolio-shell migration created these editorial sources with
-- current_date. That timestamp was automated, not a human verification, so
-- reset it once and leave an auditable marker. Checkpoint sources above are
-- born unverified as well.
update public.cms_sources
set verified_at = null,
    internal_note = concat_ws(E'\\n', nullif(internal_note, ''),
      'AUTOMATICKY VYGENEROVANÉ OVĚŘENÍ BYLO ZRUŠENO: zdroj musí před publikací ručně zkontrolovat editor.'),
    updated_at = now()
where route_id in (
    ${conceptRouteSql}
  )
  and checkpoint_id is null
  and created_by is null
  and verified_at is not null
  and internal_note not like '%AUTOMATICKY VYGENEROVANÉ OVĚŘENÍ BYLO ZRUŠENO%';

update public.cms_routes
set field_notes = concat_ws(E'\\n', nullif(field_notes, ''),
  'PRODUKTOVÁ BRÁNA: Trasa se výrazně překrývá s Tři zahrady, tři rodiny. Neprodávat samostatně, dokud nebude mít alespoň čtyři kvalitní unikátní checkpointy; zvážit variantu nebo upgrade.'),
    updated_at = now()
where id = 'brno-cerna-pole-99-schodu'
  and field_notes not like '%PRODUKTOVÁ BRÁNA:%';

update public.cms_routes
set field_notes = concat_ws(E'\\n', nullif(field_notes, ''),
  'CENOVÁ BRÁNA: Vánoční koncept sdílí oblast s vilovou trasou. Před prodejem rozhodnout mezi sezonním upgradem, kreditem pro stávající zákazníky a výrazně odlišnou sadou úloh.'),
    updated_at = now()
where id = 'brno-vanoce-betlem-z-lip'
  and field_notes not like '%CENOVÁ BRÁNA:%';

create or replace function private.enforce_cms_availability_window_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $availability_role$
declare
  current_role text;
begin
  select profile.role::text into current_role
  from public.profiles profile
  where profile.id = auth.uid();
  if (
      new.available_from is distinct from old.available_from
      or new.available_to is distinct from old.available_to
      or new.seasonality is distinct from old.seasonality
    ) and current_role = 'route_manager' then
    raise exception 'Období prodejní dostupnosti může měnit pouze superadmin.';
  end if;
  return new;
end;
$availability_role$;

revoke all on function private.enforce_cms_availability_window_role()
  from public, anon, authenticated;

drop trigger if exists cms_routes_enforce_availability_window_role on public.cms_routes;
create trigger cms_routes_enforce_availability_window_role
before update of available_from, available_to, seasonality on public.cms_routes
for each row execute function private.enforce_cms_availability_window_role();

comment on function private.enforce_cms_availability_window_role() is
  'Keeps seasonal sales windows and their canonical seasonality under superadmin control.';

create or replace function private.enforce_cms_commercial_readiness_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $readiness_role$
begin
  if new.commercial_readiness is distinct from old.commercial_readiness
    and not private.is_cms_superadmin() then
    raise exception 'Obchodní připravenost může měnit pouze superadmin.';
  end if;
  return new;
end;
$readiness_role$;

revoke all on function private.enforce_cms_commercial_readiness_role()
  from public, anon, authenticated;

drop trigger if exists cms_routes_enforce_commercial_readiness_role on public.cms_routes;
create trigger cms_routes_enforce_commercial_readiness_role
before update of commercial_readiness on public.cms_routes
for each row execute function private.enforce_cms_commercial_readiness_role();

comment on function private.enforce_cms_commercial_readiness_role() is
  'Keeps the explicit commercial approval gate under superadmin control.';

create or replace function private.enforce_cms_route_publication_invariant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $route_gate$
begin
  if new.lifecycle <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.lifecycle = 'active' then
      return new;
    end if;
  end if;
  if new.commercial_readiness <> 'ready' then
    raise exception 'Aktivní trasa musí být v CMS výslovně schválena k prodeji.';
  end if;
  if new.last_field_check is null or new.last_field_check > current_date then
    raise exception 'Aktivní trasa musí mít platné datum kompletního terénního průchodu.';
  end if;
  if new.stroller_status = 'unknown' or new.preschool_status = 'unknown' then
    raise exception 'Aktivní trasa musí mít terénně rozhodnutou vhodnost pro kočárek a předškolní děti.';
  end if;
  if not exists (
    select 1
    from public.cms_route_publications publication
    where publication.route_id = new.id
      and publication.revision = new.content_revision
  ) then
    raise exception 'Aktivní trasa musí mít neměnný publikační snapshot aktuální revize.';
  end if;
  return new;
end;
$route_gate$;

revoke all on function private.enforce_cms_route_publication_invariant()
  from public, anon, authenticated;

drop trigger if exists enforce_cms_route_field_gate on public.cms_routes;
drop trigger if exists cms_routes_enforce_publication_invariant on public.cms_routes;
create constraint trigger cms_routes_enforce_publication_invariant
after insert or update on public.cms_routes
deferrable initially deferred
for each row execute function private.enforce_cms_route_publication_invariant();

comment on function private.enforce_cms_route_publication_invariant() is
  'On a transition to active, requires commercial approval, field decisions and an immutable snapshot for the current revision. Existing active pilot rows are not demoted.';

create or replace function private.enforce_cms_publication_source_gate()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $source_gate$
declare
  route_record public.cms_routes;
  verification_window_start date;
begin
  select * into route_record
  from public.cms_routes route
  where route.id = new.route_id;

  if not found then
    raise exception 'Publikovaná trasa nebyla v CMS nalezena.';
  end if;
  if new.revision <> route_record.content_revision then
    raise exception 'Publikace musí odpovídat aktuální redakční revizi trasy.';
  end if;
  if route_record.commercial_readiness <> 'ready' then
    raise exception 'Trasa není v CMS schválena k prodeji.';
  end if;
  if route_record.last_field_check is null or route_record.last_field_check > current_date then
    raise exception 'Před publikací proveď a datuj kompletní terénní průchod.';
  end if;
  if route_record.stroller_status = 'unknown' or route_record.preschool_status = 'unknown' then
    raise exception 'Před publikací rozhodni vhodnost pro kočárek a předškolní děti.';
  end if;
  if not exists (
    select 1 from public.cms_checkpoints checkpoint
    where checkpoint.route_id = new.route_id and checkpoint.is_active
  ) then
    raise exception 'Publikovaná trasa musí mít alespoň jeden aktivní checkpoint.';
  end if;
  if not coalesce((
    select min(checkpoint.position) = 1
      and max(checkpoint.position) = count(*)
      and count(distinct checkpoint.position) = count(*)
    from public.cms_checkpoints checkpoint
    where checkpoint.route_id = new.route_id and checkpoint.is_active
  ), false) then
    raise exception 'Aktivní checkpointy musí mít souvislé pořadí 1 až N bez mezer.';
  end if;
  if exists (
    select 1
    from public.cms_checkpoints checkpoint
    where checkpoint.route_id = new.route_id
      and checkpoint.is_active
      and (
        (checkpoint.position = 1 and coalesce(checkpoint.distance_from_previous_km, -1) <> 0)
        or (checkpoint.position > 1 and coalesce(checkpoint.distance_from_previous_km, 0) <= 0)
      )
  ) then
    raise exception 'Aktivní checkpointy musí mít změřené kladné vzdálenosti; první bod má 0 km.';
  end if;

  if (route_record.availability = 'seasonal') <> (route_record.seasonality = 'seasonal') then
    raise exception 'Dostupnost a sezónnost trasy si odporují.';
  end if;
  if route_record.availability = 'seasonal' then
    if route_record.available_from is null or route_record.available_to is null then
      raise exception 'Sezónní trasa musí mít začátek i konec dostupnosti.';
    end if;
    if route_record.available_from > route_record.available_to then
      raise exception 'Začátek sezónní dostupnosti musí být před jejím koncem.';
    end if;
    verification_window_start := route_record.available_from - 14;
    if current_date < verification_window_start or current_date > route_record.available_to then
      raise exception 'Sezónní trasu lze publikovat nejdříve 14 dní před začátkem a nejpozději v poslední den dostupnosti.';
    end if;
    if route_record.last_field_check < verification_window_start then
      raise exception 'Sezónní trasa vyžaduje nový terénní průchod nejdříve 14 dní před aktuální sezónou.';
    end if;
  end if;

  if not exists (
    select 1 from public.cms_sources source
    where source.route_id = new.route_id
      and source.checkpoint_id is null
      and btrim(source.title) <> ''
      and source.url ~ '^https://[^/[:space:]]+([/?#]|$)'
      and source.verified_at is not null
      and source.verified_at <= current_date
      and (route_record.availability <> 'seasonal' or source.verified_at >= verification_window_start)
  ) then
    raise exception 'Publikovaná trasa musí mít alespoň jeden aktuálně redakčně ověřený zdroj celé trasy.';
  end if;
  if exists (
    select 1 from public.cms_checkpoints checkpoint
    where checkpoint.route_id = new.route_id
      and checkpoint.is_active
      and not exists (
        select 1 from public.cms_sources source
        where source.route_id = checkpoint.route_id
          and source.checkpoint_id = checkpoint.id
          and btrim(source.title) <> ''
          and source.url ~ '^https://[^/[:space:]]+([/?#]|$)'
          and source.verified_at is not null
          and source.verified_at <= current_date
          and (route_record.availability <> 'seasonal' or source.verified_at >= verification_window_start)
      )
  ) then
    raise exception 'Každý aktivní checkpoint musí mít alespoň jeden aktuálně redakčně ověřený zdroj.';
  end if;
  return new;
end;
$source_gate$;

revoke all on function private.enforce_cms_publication_source_gate()
  from public, anon, authenticated;

drop trigger if exists enforce_cms_publication_source_gate on public.cms_route_publications;
create trigger enforce_cms_publication_source_gate
before insert on public.cms_route_publications
for each row execute function private.enforce_cms_publication_source_gate();

comment on function private.enforce_cms_publication_source_gate() is
  'Blocks a new publication until commercial, field, suitability and current source-verification gates pass; seasonal verification is renewed each availability window.';

-- Rebuild the immutable snapshot from publication-eligible records only.
-- Working sources and media belonging to inactive checkpoints stay in the CMS
-- and cannot leak into, or block, the currently sold game version.
create or replace function public.publish_cms_route(p_route_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $publish$
declare
  v_route public.cms_routes;
  v_snapshot jsonb;
  v_publication_id uuid;
  v_publish_version text;
  v_existing_revision integer;
  v_verification_window_start date;
begin
  if not private.is_cms_superadmin() then
    raise exception 'Publikovat trasu může pouze superadmin.';
  end if;

  select * into v_route from public.cms_routes where id = p_route_id for update;
  if not found then raise exception 'Trasa nebyla nalezena.'; end if;
  if v_route.commercial_readiness <> 'ready' then
    raise exception 'Trasa není výslovně schválena k prodeji.';
  end if;
  if v_route.last_field_check is null or v_route.last_field_check > current_date then
    raise exception 'Před publikací proveď a datuj kompletní terénní průchod.';
  end if;
  if v_route.stroller_status = 'unknown' or v_route.preschool_status = 'unknown' then
    raise exception 'Před publikací terénně rozhodni vhodnost pro kočárek a předškolní děti.';
  end if;
  if (v_route.availability = 'seasonal') <> (v_route.seasonality = 'seasonal') then
    raise exception 'Dostupnost a sezónnost trasy si odporují.';
  end if;
  if v_route.availability = 'seasonal' then
    if v_route.available_from is null or v_route.available_to is null then
      raise exception 'Sezónní trasa musí mít začátek i konec dostupnosti.';
    end if;
    if v_route.available_from > v_route.available_to then
      raise exception 'Začátek sezónní dostupnosti musí být před jejím koncem.';
    end if;
    v_verification_window_start := v_route.available_from - 14;
    if current_date < v_verification_window_start or current_date > v_route.available_to then
      raise exception 'Sezónní trasu lze publikovat nejdříve 14 dní před začátkem a nejpozději v poslední den dostupnosti.';
    end if;
    if v_route.last_field_check < v_verification_window_start then
      raise exception 'Sezónní trasa vyžaduje nový terénní průchod pro aktuální období.';
    end if;
  end if;

  select publication.id, publication.version
    into v_publication_id, v_publish_version
  from public.cms_route_publications publication
  where publication.route_id = p_route_id
    and publication.revision = v_route.content_revision
  limit 1;
  if v_publication_id is not null then
    v_existing_revision := v_route.content_revision;
    update public.cms_routes
    set lifecycle = 'active',
        availability = case when availability = 'seasonal' then 'seasonal' else 'active' end,
        seasonality = case when availability = 'seasonal' then 'seasonal' else 'year-round' end,
        published_revision = v_route.content_revision,
        published_at = coalesce(published_at, now()),
        updated_by = auth.uid()
    where id = p_route_id
    returning * into v_route;
    if v_route.content_revision = v_existing_revision then
      return jsonb_build_object(
        'publication_id', v_publication_id,
        'route_id', p_route_id,
        'version', v_publish_version,
        'revision', v_route.content_revision,
        'already_published', true
      );
    end if;
    v_publication_id := null;
    v_publish_version := null;
  end if;

  if btrim(v_route.title) = '' or btrim(v_route.district) = '' or btrim(v_route.tagline) = ''
    or btrim(v_route.description) = '' or btrim(v_route.accessibility_note) = ''
    or btrim(v_route.safety_note) = '' then
    raise exception 'Trasa nemá vyplněné povinné základní údaje.';
  end if;
  if v_route.distance_km <= 0 then
    raise exception 'Trasa musí mít kladnou ověřenou délku.';
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
      and (
        (c.position = 1 and coalesce(c.distance_from_previous_km, -1) <> 0)
        or (c.position > 1 and coalesce(c.distance_from_previous_km, 0) <= 0)
      )
  ) then
    raise exception 'Aktivní checkpointy musí mít změřené kladné vzdálenosti; první bod má 0 km.';
  end if;
  if exists (
    select 1 from public.cms_checkpoints c
    where c.route_id = p_route_id and c.is_active
      and (btrim(c.title) = '' or btrim(c.story) = '' or btrim(c.puzzle_prompt) = ''
        or cardinality(c.accepted_answers) = 0 or btrim(c.hint_1) = '' or btrim(c.hint_2) = ''
        or btrim(c.fallback_prompt) = '' or cardinality(c.fallback_answers) = 0 or btrim(c.fact) = ''
        or (c.position < (
          select max(active_checkpoint.position)
          from public.cms_checkpoints active_checkpoint
          where active_checkpoint.route_id = p_route_id and active_checkpoint.is_active
        ) and btrim(c.next_clue) = ''))
  ) then
    raise exception 'Nejméně jeden checkpoint není připravený k publikaci.';
  end if;
  if exists (
    select 1 from public.cms_media m
    where m.route_id = p_route_id
      and m.archived_at is null
      and m.media_role <> 'field'
      and (m.checkpoint_id is null or exists (
        select 1 from public.cms_checkpoints c
        where c.route_id = m.route_id and c.id = m.checkpoint_id and c.is_active
      ))
      and btrim(m.alt_text) = ''
  ) then
    raise exception 'Veřejné fotografie aktivní hry musí mít alternativní text.';
  end if;

  update public.cms_routes
  set lifecycle = 'active',
      availability = case when availability = 'seasonal' then 'seasonal' else 'active' end,
      seasonality = case when availability = 'seasonal' then 'seasonal' else 'year-round' end,
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
      from public.cms_sources s
      where s.route_id = r.id
        and btrim(s.title) <> ''
        and s.url ~ '^https://[^/[:space:]]+([/?#]|$)'
        and s.verified_at is not null
        and s.verified_at <= current_date
        and (v_route.availability <> 'seasonal' or s.verified_at >= v_verification_window_start)
        and (s.checkpoint_id is null or exists (
          select 1 from public.cms_checkpoints c
          where c.route_id = s.route_id and c.id = s.checkpoint_id and c.is_active
        ))
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.sort_order, m.created_at)
      from public.cms_media m
      where m.route_id = r.id
        and m.archived_at is null
        and m.media_role <> 'field'
        and (m.checkpoint_id is null or exists (
          select 1 from public.cms_checkpoints c
          where c.route_id = m.route_id and c.id = m.checkpoint_id and c.is_active
        ))
    ), '[]'::jsonb)
  ) into v_snapshot
  from public.cms_routes r where r.id = p_route_id;

  insert into public.cms_route_publications (route_id, version, revision, snapshot, published_by)
  values (p_route_id, v_publish_version, v_route.content_revision, v_snapshot, auth.uid())
  returning id into v_publication_id;

  update public.cms_routes set published_revision = v_route.content_revision where id = p_route_id;

  insert into public.routes (
    id, city, district, title, tagline, price_czk, distance_km,
    duration_minutes, duration_min_minutes, duration_max_minutes, difficulty, checkpoint_count, xp_reward,
    status, accent, map_x, map_y, available_text, stroller_status, preschool_status
  ) values (
    v_route.id, v_route.city_name, v_route.district, v_route.title, v_route.tagline,
    v_route.price_czk, v_route.distance_km,
    round((v_route.duration_min + v_route.duration_max) / 2.0)::integer,
    v_route.duration_min, v_route.duration_max, v_route.difficulty,
    (select count(*)::integer from public.cms_checkpoints c where c.route_id = v_route.id and c.is_active),
    100, v_route.availability, v_route.accent,
    round(v_route.map_x)::integer, round(v_route.map_y)::integer,
    case
      when v_route.availability = 'seasonal' then
        to_char(v_route.available_from, 'DD.MM.YYYY') || '–' || to_char(v_route.available_to, 'DD.MM.YYYY')
      else null
    end,
    v_route.stroller_status, v_route.preschool_status
  )
  on conflict (id) do update set
    city = excluded.city,
    district = excluded.district,
    title = excluded.title,
    tagline = excluded.tagline,
    price_czk = excluded.price_czk,
    distance_km = excluded.distance_km,
    duration_minutes = excluded.duration_minutes,
    duration_min_minutes = excluded.duration_min_minutes,
    duration_max_minutes = excluded.duration_max_minutes,
    difficulty = excluded.difficulty,
    checkpoint_count = excluded.checkpoint_count,
    status = excluded.status,
    accent = excluded.accent,
    map_x = excluded.map_x,
    map_y = excluded.map_y,
    available_text = excluded.available_text,
    stroller_status = excluded.stroller_status,
    preschool_status = excluded.preschool_status;

  return jsonb_build_object('publication_id', v_publication_id, 'route_id', p_route_id,
    'version', v_publish_version, 'revision', v_route.content_revision);
end;
$publish$;

revoke all on function public.publish_cms_route(text) from public, anon;
grant execute on function public.publish_cms_route(text) to authenticated;

-- Keep meta-puzzle rewards secret until the checkpoint is solved. Existing
-- New publication snapshots include the nullable column through to_jsonb(c).
-- Older snapshots remain valid without it; this payload function controls when
-- a player may see the fragment where it exists.
create or replace function private.route_game_session_payload(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $game_payload$
declare
  v_session public.route_game_sessions;
  v_publication public.cms_route_publications;
  v_checkpoint_count integer;
  v_visible_checkpoints jsonb;
begin
  select * into v_session
  from public.route_game_sessions session
  where session.id = p_session_id and session.user_id = p_user_id;

  if not found then
    raise exception 'Rozehraná výprava nebyla nalezena.';
  end if;
  if not private.game_user_can_access(v_session.route_id) then
    raise exception 'Tuto trasu už nemáš odemčenou.';
  end if;

  select * into v_publication
  from public.cms_route_publications publication
  where publication.id = v_session.publication_id;

  if not found then
    raise exception 'Publikovaná verze trasy nebyla nalezena.';
  end if;
  if v_publication.route_id <> v_session.route_id then
    raise exception 'Publikovaná verze nepatří k rozehrané trase.';
  end if;

  v_checkpoint_count := jsonb_array_length(coalesce(v_publication.snapshot -> 'checkpoints', '[]'::jsonb));

  select coalesce(jsonb_agg(
    (
      case
        when (checkpoint ->> 'position')::integer < v_session.current_position
          then checkpoint
        else checkpoint - 'fact' - 'next_clue' - 'meta_token'
      end
        - 'accepted_answers'
        - 'fallback_answers'
        - 'hint_1'
        - 'hint_2'
        - 'internal_notes'
        - 'created_by'
        - 'updated_by'
        - 'created_at'
        - 'updated_at'
    ) || jsonb_build_object(
      'revealed_hints', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'level', hint.hint_level,
            'hint', case hint.hint_level
              when 1 then checkpoint ->> 'hint_1'
              else checkpoint ->> 'hint_2'
            end
          )
          order by hint.hint_level
        )
        from public.route_game_hints hint
        where hint.session_id = v_session.id
          and hint.checkpoint_id = checkpoint ->> 'id'
      ), '[]'::jsonb)
    )
    order by (checkpoint ->> 'position')::integer
  ), '[]'::jsonb)
  into v_visible_checkpoints
  from jsonb_array_elements(coalesce(v_publication.snapshot -> 'checkpoints', '[]'::jsonb)) checkpoint
  where (checkpoint ->> 'position')::integer <= least(v_session.current_position, v_checkpoint_count);

  return jsonb_build_object(
    'session_id', v_session.id,
    'route_id', v_session.route_id,
    'publication_id', v_publication.id,
    'version', v_publication.version,
    'route', (v_publication.snapshot -> 'route')
      - 'field_notes'
      - 'assigned_to'
      - 'created_by'
      - 'updated_by'
      - 'content_revision'
      - 'published_revision'
      - 'commercial_readiness',
    'progress', jsonb_build_object(
      'current_position', v_session.current_position,
      'checkpoint_count', v_checkpoint_count,
      'solved_checkpoint_ids', to_jsonb(v_session.solved_checkpoint_ids),
      'hints_used', v_session.hints_used,
      'started_at', v_session.started_at,
      'updated_at', v_session.updated_at,
      'completed_at', v_session.completed_at
    ),
    'checkpoints', v_visible_checkpoints
  );
end;
$game_payload$;

revoke all on function private.route_game_session_payload(uuid, uuid) from public, anon, authenticated;

create or replace function public.submit_route_game_answer(
  p_session_id uuid,
  p_checkpoint_id text,
  p_answer text,
  p_use_fallback boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $submit_answer$
declare
  v_user_id uuid := auth.uid();
  v_session public.route_game_sessions;
  v_publication public.cms_route_publications;
  v_checkpoint jsonb;
  v_answers jsonb;
  v_is_correct boolean;
  v_checkpoint_count integer;
  v_completed boolean;
begin
  if v_user_id is null then
    raise exception 'Pro odeslání odpovědi se přihlas.';
  end if;
  if length(coalesce(p_answer, '')) > 200 then
    raise exception 'Odpověď je příliš dlouhá.';
  end if;
  if btrim(coalesce(p_checkpoint_id, '')) = '' then
    raise exception 'Chybí identifikátor checkpointu.';
  end if;
  if private.normalize_game_answer(p_answer) = '' then
    raise exception 'Nejdřív napiš odpověď.';
  end if;

  select * into v_session
  from public.route_game_sessions session
  where session.id = p_session_id and session.user_id = v_user_id
  for update;

  if not found then raise exception 'Rozehraná výprava nebyla nalezena.'; end if;
  if not private.game_user_can_access(v_session.route_id) then
    raise exception 'Tuto trasu už nemáš odemčenou.';
  end if;
  if v_session.completed_at is not null then raise exception 'Výprava už je dokončena.'; end if;

  if exists (
    select 1
    from public.route_game_attempts attempt
    where attempt.session_id = v_session.id
      and attempt.attempted_at > now() - interval '750 milliseconds'
  ) then
    raise exception 'Počkej chvilku před dalším pokusem.';
  end if;
  if (
    select count(*)
    from public.route_game_attempts attempt
    where attempt.session_id = v_session.id
      and attempt.attempted_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Příliš mnoho pokusů. Zkus to znovu za chvíli.';
  end if;

  select * into v_publication
  from public.cms_route_publications publication
  where publication.id = v_session.publication_id;

  if not found or v_publication.route_id <> v_session.route_id then
    raise exception 'Publikovaná verze nepatří k rozehrané trase.';
  end if;

  select checkpoint into v_checkpoint
  from jsonb_array_elements(coalesce(v_publication.snapshot -> 'checkpoints', '[]'::jsonb)) checkpoint
  where (checkpoint ->> 'position')::integer = v_session.current_position
  limit 1;

  if v_checkpoint is null or v_checkpoint ->> 'id' <> p_checkpoint_id then
    raise exception 'Tento checkpoint zatím není odemčený.';
  end if;

  v_answers := case when coalesce(p_use_fallback, false)
    then coalesce(v_checkpoint -> 'fallback_answers', '[]'::jsonb)
    else coalesce(v_checkpoint -> 'accepted_answers', '[]'::jsonb)
  end;

  select exists (
    select 1
    from jsonb_array_elements_text(v_answers) accepted(answer)
    where private.normalize_game_answer(accepted.answer) = private.normalize_game_answer(p_answer)
  ) into v_is_correct;

  insert into public.route_game_attempts (session_id, checkpoint_id, used_fallback, is_correct)
  values (v_session.id, p_checkpoint_id, coalesce(p_use_fallback, false), v_is_correct);

  if not v_is_correct then
    return jsonb_build_object('correct', false, 'completed', false);
  end if;

  v_checkpoint_count := jsonb_array_length(coalesce(v_publication.snapshot -> 'checkpoints', '[]'::jsonb));
  v_completed := v_session.current_position >= v_checkpoint_count;

  update public.route_game_sessions
  set solved_checkpoint_ids = case
        when p_checkpoint_id = any(solved_checkpoint_ids) then solved_checkpoint_ids
        else array_append(solved_checkpoint_ids, p_checkpoint_id)
      end,
      current_position = least(current_position + 1, v_checkpoint_count + 1),
      completed_at = case when v_completed then now() else completed_at end,
      updated_at = now()
  where id = v_session.id;

  return jsonb_build_object(
    'correct', true,
    'completed', v_completed,
    'fact', v_checkpoint ->> 'fact',
    'next_clue', v_checkpoint ->> 'next_clue',
    'meta_token', v_checkpoint ->> 'meta_token',
    'session', private.route_game_session_payload(v_session.id, v_user_id)
  );
end;
$submit_answer$;

revoke all on function public.submit_route_game_answer(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_route_game_answer(uuid, text, text, boolean) to authenticated;

drop table route_checkpoint_draft_seed;
`;

await writeFile(outputFile, sql, "utf8");
process.stdout.write(`Generated ${drafts.length} inactive checkpoint drafts for ${routeIds.size} routes in ${outputFile}\n`);
