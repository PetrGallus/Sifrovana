import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("veřejný produktový modul netahá administrační editory", async () => {
  const source = await readFile(new URL("app/product-sections.tsx", root), "utf8");
  assert.doesNotMatch(source, /from "\.\/route-cms"/);
  assert.doesNotMatch(source, /from "\.\/discount-admin"/);
  assert.doesNotMatch(source, /export function AdminCenter/);
});

test("administrace je samostatný lazy chunk se zachovaným řízením rolí", async () => {
  const [page, admin] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/admin-center.tsx", root), "utf8"),
  ]);

  assert.match(page, /lazy\(\(\) => import\("\.\/admin-center"\)/);
  assert.match(page, /<Suspense fallback=/);
  assert.match(admin, /from "\.\/route-cms"/);
  assert.match(admin, /from "\.\/discount-admin"/);
  assert.match(admin, /role !== "route_manager"/);
  assert.match(admin, /role !== "superadmin"/);
});
