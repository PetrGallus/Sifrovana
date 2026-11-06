import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("sdílený modal drží fokus, zavírá Escape a vrací fokus spouštěči", async () => {
  const hook = await readFile(new URL("app/use-accessible-modal.ts", root), "utf8");
  assert.match(hook, /event\.key === "Escape"/);
  assert.match(hook, /event\.key !== "Tab"/);
  assert.match(hook, /document\.addEventListener\("keydown"/);
  assert.match(hook, /previousFocus\?\.focus\(\)/);
});

test("oba modály používají sdílený hook a auth loading skončí i při chybě", async () => {
  const source = await readFile(new URL("app/product-sections.tsx", root), "utf8");
  assert.equal((source.match(/useAccessibleModal\(onClose\)/g) ?? []).length, 2);
  assert.equal((source.match(/data-modal-autofocus/g) ?? []).length, 2);
  assert.match(source, /finally \{\s*if \(active\) setLoading\(false\)/);
  assert.match(source, /if \(error\) throw error/);
});

test("QR knihovna se načítá až při skutečném generování platby", async () => {
  const source = await readFile(new URL("app/product-sections.tsx", root), "utf8");
  assert.doesNotMatch(source, /^import QRCode from "qrcode"/m);
  assert.match(source, /if \(paymentIban\) \{[\s\S]{0,180}const \{ default: QRCode \} = await import\("qrcode"\)/);
  assert.match(source, /platební QR se nepodařilo vykreslit/);
  assert.match(source, /finally \{\s*setBusy\(false\)/);
});

test("checkout bez IBANu skončí před vytvořením serverové objednávky", async () => {
  const source = await readFile(new URL("app/product-sections.tsx", root), "utf8");
  const guard = source.indexOf("if (!paymentIban)");
  const rpc = source.indexOf('supabase.rpc("create_route_checkout_order"');
  assert.ok(guard >= 0 && rpc > guard);
  assert.match(source, /disabled=\{busy \|\| !paymentIban\}/);
  assert.match(source, /Objednávka se nevytvoří a nic se nerezervuje/);
});
