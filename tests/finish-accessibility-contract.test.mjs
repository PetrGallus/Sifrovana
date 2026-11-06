import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("lokální selfie uvolňuje object URL při výměně, dokončení i odpojení", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /photoUrlRef = useRef<string \| null>/);
  assert.ok((page.match(/URL\.revokeObjectURL\(photoUrlRef\.current\)/g) ?? []).length >= 3);
  assert.match(page, /const nextUrl = URL\.createObjectURL\(file\)/);
});

test("selfie volba zůstává dostupná z klávesnice a jednoduché volby používají stav stisknutí", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
  ]);
  assert.match(page, /className="proof-tabs" role="group"/);
  assert.match(page, /aria-pressed=/);
  assert.doesNotMatch(page, /role="tab"/);
  assert.match(page, /aria-label="Vybrat vítěznou selfie"/);
  assert.match(page, /Podpis je volitelný/);
  assert.match(page, /role="img" aria-label="Plocha pro volitelný digitální podpis/);
  assert.match(css, /\.photo-drop:focus-within/);
  assert.match(css, /\.photo-drop input \{ display: block; position: absolute;/);
});
