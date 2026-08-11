alter table public.profiles
  add column if not exists username text;

do $$
begin
  alter table public.profiles
    add constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_]{3,24}$');
exception
  when duplicate_object then null;
end
$$;

create unique index if not exists profiles_username_unique_lower
  on public.profiles (lower(username))
  where username is not null;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, username, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case
      when lower(coalesce(new.email, '')) = 'galluspeginpetr@gmail.com' then 'gallus'
      else null
    end,
    case
      when lower(coalesce(new.email, '')) = 'galluspeginpetr@gmail.com' then 'gallus'
      else coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(coalesce(new.email, ''), '@', 1))
    end,
    case
      when lower(coalesce(new.email, '')) = 'galluspeginpetr@gmail.com'
        then 'superadmin'::public.user_role
      else 'user'::public.user_role
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        username = case
          when excluded.role = 'superadmin'::public.user_role then 'gallus'
          else public.profiles.username
        end,
        display_name = case
          when excluded.role = 'superadmin'::public.user_role then 'gallus'
          else public.profiles.display_name
        end,
        role = case
          when excluded.role = 'superadmin'::public.user_role then 'superadmin'::public.user_role
          else public.profiles.role
        end,
        updated_at = now();
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

update public.profiles
set username = 'gallus',
    display_name = 'gallus',
    role = 'superadmin'::public.user_role,
    updated_at = now()
where lower(email) = 'galluspeginpetr@gmail.com';

comment on column public.profiles.username is
  'Unique public handle. Reserved superadmin account uses gallus.';
