-- Reserve the verified owner account and keep future registrations aligned.
-- Catalogue prices are intentionally outside this migration.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean := lower(coalesce(new.email, '')) in (
    'gallus-petr@pm.me',
    'galluspeginpetr@gmail.com'
  );
begin
  insert into public.profiles (id, email, username, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case when v_is_owner then 'gallus' else null end,
    case when v_is_owner then 'gallus'
      else coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1))
    end,
    case when v_is_owner then 'superadmin'::public.user_role else 'user'::public.user_role end
  )
  on conflict (id) do update
    set email = excluded.email,
        username = case when v_is_owner then 'gallus' else public.profiles.username end,
        display_name = case when v_is_owner then 'gallus' else public.profiles.display_name end,
        role = case when v_is_owner then 'superadmin'::public.user_role else public.profiles.role end,
        updated_at = now();
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

update public.profiles
set username = 'gallus', display_name = 'gallus', role = 'superadmin'::public.user_role, updated_at = now()
where lower(email) in ('gallus-petr@pm.me', 'galluspeginpetr@gmail.com');
