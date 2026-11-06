import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20261106131056_seed_northern_route_checkpoint_drafts.sql",
  import.meta.url,
);
const adapterUrl = new URL("../lib/supabase/published-game.ts", import.meta.url);
const pageUrl = new URL("../app/page.tsx", import.meta.url);

const [migration, adapter, page] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(adapterUrl, "utf8"),
  readFile(pageUrl, "utf8"),
]);

test("meta-puzzle fragments are stored as structured checkpoint data", () => {
  assert.match(migration, /add column if not exists meta_token text/i);
  assert.match(adapter, /metaToken: string \| null/);
});

test("meta-puzzle fragments stay secret until the checkpoint is solved", () => {
  assert.match(
    migration,
    /else checkpoint\s*-\s*'fact'\s*-\s*'next_clue'\s*-\s*'meta_token'/,
  );
  assert.match(migration, /'meta_token',\s*v_checkpoint\s*->>\s*'meta_token'/);
  assert.match(adapter, /CHECKPOINT_REWARD_EXPOSED/);
});

test("the game renders an earned meta-puzzle fragment after a correct answer", () => {
  assert.match(adapter, /metaToken: asNullableString\(raw\.meta_token/);
  assert.match(page, /FRAGMENT DO METAŠIFRY/);
  assert.match(page, /ZÍSKANÉ FRAGMENTY DO METAŠIFRY/);
  assert.match(page, /answerStatus === "correct"[\s\S]*checkpoint\.metaToken/);
});
