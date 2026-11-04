-- Version-pinned live game sessions for published CMS route snapshots.
-- Players never receive accepted answers or unpublished/future checkpoints.

create extension if not exists unaccent with schema extensions;

create table public.route_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route_id text not null references public.cms_routes(id) on delete restrict,
  publication_id uuid not null references public.cms_route_publications(id) on delete restrict,
  current_position integer not null default 1 check (current_position > 0),
  solved_checkpoint_ids text[] not null default array[]::text[],
  hints_used integer not null default 0 check (hints_used >= 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (completed_at is null or completed_at >= started_at)
);

create index route_game_sessions_user_route_idx
  on public.route_game_sessions (user_id, route_id, started_at desc);

create unique index route_game_sessions_one_active_route_idx
  on public.route_game_sessions (user_id, route_id)
  where completed_at is null;

create table public.route_game_attempts (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.route_game_sessions(id) on delete cascade,
  checkpoint_id text not null,
  used_fallback boolean not null default false,
  is_correct boolean not null,
  attempted_at timestamptz not null default now()
);

create index route_game_attempts_session_checkpoint_idx
  on public.route_game_attempts (session_id, checkpoint_id, attempted_at desc);

create table public.route_game_hints (
  session_id uuid not null references public.route_game_sessions(id) on delete cascade,
  checkpoint_id text not null,
  hint_level smallint not null check (hint_level in (1, 2)),
  revealed_at timestamptz not null default now(),
  primary key (session_id, checkpoint_id, hint_level)
);

alter table public.route_game_sessions enable row level security;
alter table public.route_game_attempts enable row level security;
alter table public.route_game_hints enable row level security;

-- Direct browser writes stay disabled. Game mutations go through the narrow RPCs below.
revoke all on public.route_game_sessions from public, anon, authenticated;
revoke all on public.route_game_attempts from public, anon, authenticated;
revoke all on public.route_game_hints from public, anon, authenticated;
revoke all on sequence public.route_game_attempts_id_seq from public, anon, authenticated;

create or replace function private.normalize_game_answer(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select regexp_replace(
    extensions.unaccent(lower(btrim(coalesce(p_value, '')))),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

revoke all on function private.normalize_game_answer(text) from public, anon, authenticated;

create or replace function private.game_user_can_access(p_route_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.user_route_access access
      where access.user_id = auth.uid() and access.route_id = p_route_id
    )
    or exists (
      select 1
      from public.profiles profile
      where profile.id = auth.uid() and profile.role::text = 'superadmin'
    )
  );
$$;

revoke all on function private.game_user_can_access(text) from public, anon, authenticated;

create or replace function private.route_game_session_payload(
  p_session_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
        -- Facts and navigation clues are rewards for a solved checkpoint. The
        -- current puzzle must not reveal them before a correct answer.
        when (checkpoint ->> 'position')::integer < v_session.current_position
          then checkpoint
        else checkpoint - 'fact' - 'next_clue'
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
      - 'published_revision',
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
$$;

revoke all on function private.route_game_session_payload(uuid, uuid) from public, anon, authenticated;

create or replace function public.start_or_resume_route_game(p_route_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_publication_id uuid;
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'Pro zahájení výpravy se přihlas.';
  end if;

  if not private.game_user_can_access(p_route_id) then
    raise exception 'Tuto trasu nemáš odemčenou.';
  end if;

  -- A player always finishes the immutable publication they originally started.
  select session.id into v_session_id
  from public.route_game_sessions session
  where session.user_id = v_user_id
    and session.route_id = p_route_id
    and session.completed_at is null
  order by session.started_at desc
  limit 1;

  if v_session_id is not null then
    return private.route_game_session_payload(v_session_id, v_user_id);
  end if;

  select publication.id into v_publication_id
  from public.cms_route_publications publication
  join public.cms_routes route on route.id = publication.route_id
  where publication.route_id = p_route_id
    and route.lifecycle = 'active'
    and (
      route.availability = 'active'
      or (
        route.availability = 'seasonal'
        and (route.available_from is null or route.available_from <= current_date)
        and (route.available_to is null or route.available_to >= current_date)
      )
    )
  order by publication.published_at desc
  limit 1;

  if v_publication_id is null then
    raise exception 'Trasa zatím nemá publikovanou herní verzi.';
  end if;

  insert into public.route_game_sessions (user_id, route_id, publication_id)
  values (v_user_id, p_route_id, v_publication_id)
  on conflict (user_id, route_id) where completed_at is null
  do update set updated_at = public.route_game_sessions.updated_at
  returning id into v_session_id;

  return private.route_game_session_payload(v_session_id, v_user_id);
end;
$$;

revoke all on function public.start_or_resume_route_game(text) from public, anon, authenticated;
grant execute on function public.start_or_resume_route_game(text) to authenticated;

create or replace function public.get_route_game_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Pro načtení výpravy se přihlas.';
  end if;
  return private.route_game_session_payload(p_session_id, v_user_id);
end;
$$;

revoke all on function public.get_route_game_session(uuid) from public, anon, authenticated;
grant execute on function public.get_route_game_session(uuid) to authenticated;

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
as $$
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

  -- Keep accidental double taps and simple brute-force scripts from flooding
  -- the attempt log. The session row lock makes this check race-safe.
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
    'session', private.route_game_session_payload(v_session.id, v_user_id)
  );
end;
$$;

revoke all on function public.submit_route_game_answer(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_route_game_answer(uuid, text, text, boolean) to authenticated;

create or replace function public.reveal_route_game_hint(
  p_session_id uuid,
  p_hint_level smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.route_game_sessions;
  v_publication public.cms_route_publications;
  v_checkpoint jsonb;
  v_checkpoint_id text;
  v_hint text;
  v_inserted boolean := false;
begin
  if v_user_id is null then raise exception 'Pro zobrazení nápovědy se přihlas.'; end if;
  if p_hint_level not in (1, 2) then raise exception 'Nápověda musí mít úroveň 1 nebo 2.'; end if;

  select * into v_session
  from public.route_game_sessions session
  where session.id = p_session_id and session.user_id = v_user_id
  for update;

  if not found then raise exception 'Rozehraná výprava nebyla nalezena.'; end if;
  if not private.game_user_can_access(v_session.route_id) then
    raise exception 'Tuto trasu už nemáš odemčenou.';
  end if;
  if v_session.completed_at is not null then raise exception 'Výprava už je dokončena.'; end if;

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

  if v_checkpoint is null then raise exception 'Aktuální checkpoint nebyl nalezen.'; end if;
  v_checkpoint_id := v_checkpoint ->> 'id';

  if p_hint_level = 2 and not exists (
    select 1 from public.route_game_hints hint
    where hint.session_id = v_session.id
      and hint.checkpoint_id = v_checkpoint_id
      and hint.hint_level = 1
  ) then
    raise exception 'Nejdřív odkryj první nápovědu.';
  end if;

  insert into public.route_game_hints (session_id, checkpoint_id, hint_level)
  values (v_session.id, v_checkpoint_id, p_hint_level)
  on conflict do nothing
  returning true into v_inserted;

  if coalesce(v_inserted, false) then
    update public.route_game_sessions
    set hints_used = hints_used + 1, updated_at = now()
    where id = v_session.id;
  end if;

  v_hint := case when p_hint_level = 1
    then v_checkpoint ->> 'hint_1'
    else v_checkpoint ->> 'hint_2'
  end;

  return jsonb_build_object(
    'checkpoint_id', v_checkpoint_id,
    'hint_level', p_hint_level,
    'hint', v_hint,
    'hints_used', (
      select session.hints_used from public.route_game_sessions session where session.id = v_session.id
    )
  );
end;
$$;

revoke all on function public.reveal_route_game_hint(uuid, smallint) from public, anon, authenticated;
grant execute on function public.reveal_route_game_hint(uuid, smallint) to authenticated;

comment on table public.route_game_sessions is
  'A player session pinned to one immutable CMS publication; draft edits never change an active game.';
comment on function public.start_or_resume_route_game(text) is
  'Starts or resumes an owned route and returns only unlocked, answer-free checkpoint data.';
comment on function public.submit_route_game_answer(uuid, text, text, boolean) is
  'Checks the current checkpoint answer server-side without exposing accepted answers.';
