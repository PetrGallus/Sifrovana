import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/product-sections.tsx", import.meta.url), "utf8");

test("checkout remountuje stav při změně autentizovaného účtu", () => {
  assert.match(
    source,
    /const checkoutUserId = props\.auth\.user\?\.id \?\? null;[\s\S]{0,180}<CheckoutModalForUser key=\{checkoutUserId \?\? "signed-out"\}/,
  );
  assert.match(source, /return \(\) => \{\s*mounted\.current = false;\s*checkoutRequest\.current \+= 1;/);
});

test("asynchronní checkout publikuje objednávku jen původnímu účtu", () => {
  assert.match(source, /const requestUserId = checkoutUserId;\s*const requestId = \+\+checkoutRequest\.current;/);
  assert.match(
    source,
    /function requestIsCurrent\(requestId: number, requestUserId: string\)[\s\S]{0,180}checkoutUserId === requestUserId/,
  );

  const rpc = source.indexOf('supabase.rpc("create_route_checkout_order"');
  const postRpcGuard = source.indexOf("if (!requestIsCurrent(requestId, requestUserId)) return;", rpc);
  const publishOrder = source.indexOf("setOrder({ id: created.order_id", postRpcGuard);
  const finalGuard = source.lastIndexOf("if (!requestIsCurrent(requestId, requestUserId)) return;", publishOrder);

  assert.ok(rpc >= 0, "checkout RPC musí zůstat přítomné");
  assert.ok(postRpcGuard > rpc, "identita účtu se musí ověřit po RPC");
  assert.ok(finalGuard > postRpcGuard && finalGuard < publishOrder, "identita účtu se musí ověřit bezprostředně před zveřejněním objednávky");
});

test("zrušení objednávky používá stejnou izolaci účtu a requestu", () => {
  const cancelStart = source.indexOf("async function cancelOrder()");
  const cancelRpc = source.indexOf('supabase.rpc("cancel_checkout_order"', cancelStart);
  const cancelGuard = source.indexOf("if (!requestIsCurrent(requestId, requestUserId)) return;", cancelRpc);
  const clearOrder = source.indexOf("setOrder(null)", cancelGuard);

  assert.ok(cancelStart >= 0 && cancelRpc > cancelStart);
  assert.ok(cancelGuard > cancelRpc && clearOrder > cancelGuard);
});
