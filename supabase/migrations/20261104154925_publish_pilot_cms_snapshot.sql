-- Bootstrap the already reviewed pilot through the same validated publishing
-- function as the CMS UI. The request claim is scoped to this transaction and
-- records the explicitly authorised owner as published_by.

do $$
declare
  v_owner_id uuid;
begin
  if exists (
    select 1
    from public.cms_route_publications publication
    where publication.route_id = 'brno-kralovo-pole-stopy'
  ) then
    return;
  end if;

  select profile.id into v_owner_id
  from public.profiles profile
  where lower(profile.email) = 'gallus-petr@pm.me'
    and profile.role::text = 'superadmin'
  limit 1;

  if v_owner_id is null then
    raise exception 'Autorizovaný superadmin gallus-petr@pm.me nebyl nalezen.';
  end if;

  perform set_config('request.jwt.claim.sub', v_owner_id::text, true);
  perform public.publish_cms_route('brno-kralovo-pole-stopy');
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;
