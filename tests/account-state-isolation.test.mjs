import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("profilový dotaz nemůže zveřejnit profil jiného nebo předchozího účtu", async () => {
  const source = await readFile(new URL("app/product-sections.tsx", root), "utf8");

  assert.match(source, /profileState[\s\S]{0,120}userId: string;[\s\S]{0,80}value: AppProfile/);
  assert.match(source, /session && profileState && session\.user\.id === profileState\.userId[\s\S]{0,60}\? profileState\.value/);
  assert.match(source, /const requestId = \+\+profileRequest\.current/);
  assert.match(source, /if \(requestId !== profileRequest\.current\) return/);
  assert.match(source, /nextProfile\?\.id === user\.id[\s\S]{0,100}\{ userId: user\.id, value: nextProfile \}/);
});

test("lokální dokončení je svázané s účtem a samo neodemkne dokončovací obrazovku", async () => {
  const source = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(source, /activityUserId: string \| null/);
  assert.match(source, /state\.activityUserId === currentUserId/);
  assert.match(source, /activityUserId: currentUserId/);
  assert.match(source, /const currentGameCompleted = Boolean\(publishedGame\.session\?\.progress\.completedAt\);/);
  assert.match(source, /: \{ \.\.\.initialState\.progress, completed: hasLocalActivity \}/);
  assert.match(source, /hintsUsed=\{publishedGame\.session\?\.progress\.hintsUsed \?\? 0\}/);
  assert.doesNotMatch(source, /currentGameCompleted[^;]{0,160}state\.progress\.completed/);
});
