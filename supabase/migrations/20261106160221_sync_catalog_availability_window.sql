-- Public storefront projection of the immutable publication window. Clients
-- may use these dates to disable seasonal checkout early; the checkout RPC
-- remains the authoritative enforcement point.

alter table public.routes
  add column if not exists available_from date,
  add column if not exists available_to date;

create or replace function private.sync_route_catalog_availability_window()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $sync_window$
declare
  v_availability text;
  v_available_from date;
  v_available_to date;
begin
  -- published_revision deliberately identifies the live immutable snapshot.
  -- A newer working content_revision must not leak draft dates to shoppers.
  select
    publication.snapshot #>> '{route,availability}',
    (publication.snapshot #>> '{route,available_from}')::date,
    (publication.snapshot #>> '{route,available_to}')::date
  into v_availability, v_available_from, v_available_to
  from public.cms_routes cms
  join public.cms_route_publications publication
    on publication.route_id = cms.id
   and publication.revision = cms.published_revision
  where cms.id = new.id;

  if found and v_availability = 'seasonal' then
    new.available_from := v_available_from;
    new.available_to := v_available_to;
  else
    -- Unpublished shells and year-round routes never get a client-authored
    -- window. Missing or malformed publication data therefore fails closed.
    new.available_from := null;
    new.available_to := null;
  end if;

  return new;
end;
$sync_window$;

revoke all on function private.sync_route_catalog_availability_window()
  from public, anon, authenticated;

create trigger routes_sync_publication_window
before insert or update of status, available_from, available_to on public.routes
for each row execute function private.sync_route_catalog_availability_window();

-- Backfill already published routes. Mentioning the date columns invokes the
-- same trigger used by every later publish/upsert, avoiding a second code path.
update public.routes catalogue
set available_from = catalogue.available_from,
    available_to = catalogue.available_to
where exists (
  select 1
  from public.cms_routes cms
  join public.cms_route_publications publication
    on publication.route_id = cms.id
   and publication.revision = cms.published_revision
  where cms.id = catalogue.id
);

alter table public.routes
  add constraint routes_availability_window_pair_check
    check ((available_from is null) = (available_to is null)),
  add constraint routes_availability_window_order_check
    check (available_to is null or available_to >= available_from),
  add constraint routes_availability_window_status_check
    check (
      status::text = 'seasonal'
      or (available_from is null and available_to is null)
    );

comment on column public.routes.available_from is
  'Public read-only projection of the start date from the immutable published CMS snapshot; null for year-round or unpublished routes.';
comment on column public.routes.available_to is
  'Public read-only projection of the end date from the immutable published CMS snapshot; checkout RPC remains authoritative.';
comment on function private.sync_route_catalog_availability_window() is
  'Copies a seasonal window only from cms_routes.published_revision, preventing working-copy or client dates from entering the public catalogue.';
