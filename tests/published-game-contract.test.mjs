import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20261104154835_add_live_game_sessions.sql",
  import.meta.url,
);
const adapterUrl = new URL("../lib/supabase/published-game.ts", import.meta.url);
const cmsMigrationUrl = new URL(
  "../supabase/migrations/20261104154753_add_route_cms.sql",
  import.meta.url,
);

const [migration, adapter, cmsMigration] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(adapterUrl, "utf8"),
  readFile(cmsMigrationUrl, "utf8"),
]);

test("live sessions are pinned to immutable CMS publications", () => {
  assert.match(migration, /publication_id uuid not null references public\.cms_route_publications/);
  assert.match(migration, /return private\.route_game_session_payload\(v_session_id, v_user_id\)/);
  assert.match(migration, /and session\.completed_at is null/);
  assert.match(
    migration,
    /function private\.route_game_session_payload[\s\S]*?language plpgsql\s+volatile\s+security definer/,
  );
});

test("starting without a publication fails before a session is inserted", () => {
  const missingPublicationGuard = migration.indexOf(
    "raise exception 'Trasa zatím nemá publikovanou herní verzi.'",
  );
  const sessionInsert = migration.indexOf(
    "insert into public.route_game_sessions (user_id, route_id, publication_id)",
  );
  assert.ok(missingPublicationGuard > -1);
  assert.ok(sessionInsert > missingPublicationGuard);
});

test("browser payload excludes secrets and future checkpoints", () => {
  for (const secret of ["accepted_answers", "fallback_answers", "hint_1", "hint_2"]) {
    assert.match(migration, new RegExp(`- '${secret}'`));
  }
  assert.match(
    migration,
    /where \(checkpoint ->> 'position'\)::integer <= least\(v_session\.current_position, v_checkpoint_count\)/,
  );
  assert.match(migration, /else checkpoint - 'fact' - 'next_clue'/);
  assert.match(adapter, /ANSWER_DATA_EXPOSED/);
  assert.match(adapter, /FUTURE_CHECKPOINT_EXPOSED/);
});

test("answers are verified in an authenticated server-side RPC", () => {
  assert.match(migration, /create or replace function public\.submit_route_game_answer/);
  assert.match(migration, /private\.normalize_game_answer\(accepted\.answer\)/);
  assert.match(migration, /private\.normalize_game_answer\(p_answer\)/);
  assert.match(
    migration,
    /revoke all on function public\.submit_route_game_answer[\s\S]*grant execute on function public\.submit_route_game_answer[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(
    migration.match(/create table public\.route_game_attempts[\s\S]*?\);/)?.[0] ?? "",
    /\banswer\b/,
  );
});

test("all exposed game mutations use ownership checks and locked progress", () => {
  assert.match(migration, /where session\.id = p_session_id and session\.user_id = v_user_id\s+for update/g);
  assert.match(migration, /private\.game_user_can_access\(v_session\.route_id\)/g);
  assert.match(migration, /set search_path = ''/g);
  assert.match(migration, /interval '750 milliseconds'/);
});

test("CMS publication is revisioned and safe to retry", () => {
  for (const child of ["checkpoints", "sources", "media"]) {
    assert.match(
      cmsMigration,
      new RegExp(`create trigger cms_${child}_bump_route_revision`),
    );
  }
  assert.match(
    cmsMigration,
    /publication\.revision = v_route\.content_revision[\s\S]*?'already_published', true/,
  );
  assert.match(
    cmsMigration,
    /regexp_replace\(v_route\.version, '-r\[0-9\]\+\$', ''\)[\s\S]*?v_route\.content_revision::text/,
  );
});
