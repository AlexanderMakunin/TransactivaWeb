import assert from "node:assert/strict";
import test, { after } from "node:test";

import { requestTenantInvoicePdf } from "../assets/js/data-service.js";

// El proceso de test por fichero es propio de node --test: los stubs del
// navegador se instalan una vez y no se retiran (savePdf agenda un
// setTimeout de 1 s que se ejecutaría después de cualquier restauración).
globalThis.document = {
  createElement: () => ({ click() {}, remove() {}, href: "", download: "" }),
  body: { append() {} },
};
if (typeof URL.createObjectURL !== "function") URL.createObjectURL = () => "blob:test";
if (typeof URL.revokeObjectURL !== "function") URL.revokeObjectURL = () => {};

const PAYLOAD = Object.freeze({
  invoiceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  invoiceDate: "2026-11-01",
  tenantName: "Inquilino",
  tenantAddress: "Calle 1",
  tenantIdentifier: "12345678A",
});

function sequenceFetch(items) {
  const calls = [];
  let index = 0;
  globalThis.fetch = async () => {
    calls.push(index);
    const item = items[Math.min(index, items.length - 1)];
    index += 1;
    if (item instanceof Error) throw item;
    return item.clone();
  };
  return calls;
}

function busyResponse(retryAfter) {
  return Response.json(
    { error: "GENERATION_BUSY", message: "Ya hay una generación en curso para el cliente C001 y CUPS ES001 (fase render)." },
    { status: 425, headers: retryAfter ? { "retry-after": retryAfter } : {} },
  );
}

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

test("retries a busy generation and saves the PDF when the claim succeeds", async () => {
  const delays = [];
  const progress = [];
  const calls = sequenceFetch([
    busyResponse("45"),
    busyResponse(),
    new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
  ]);

  await requestTenantInvoicePdf(PAYLOAD, number => progress.push(number), ms => { delays.push(ms); return Promise.resolve(); });

  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [45_000, 45_000]);
  assert.deepEqual(progress, [2, 3]);
});

test("does not retry a functional error", async () => {
  const delays = [];
  const calls = sequenceFetch([
    Response.json({ error: "UNAUTHORIZED", message: "Session is missing or expired." }, { status: 401 }),
  ]);

  await assert.rejects(
    () => requestTenantInvoicePdf(PAYLOAD, undefined, ms => { delays.push(ms); return Promise.resolve(); }),
    error => error.message === "Session is missing or expired.",
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(delays, []);
});

test("treats the legacy400 busy text as transient while the worker rollout is pending", async () => {
  const delays = [];
  const calls = sequenceFetch([
    Response.json({ error: "UPSTREAM_ERROR", message: "Business Central request failed with HTTP 400. Ya hay una generación en curso para el cliente C001 (fase registrando)." }, { status: 400 }),
    new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
  ]);

  await requestTenantInvoicePdf(PAYLOAD, undefined, ms => { delays.push(ms); return Promise.resolve(); });

  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [45_000]);
});

test("retries the real row-lock 400 captured on 2026-10-08", async () => {
  const delays = [];
  const calls = sequenceFetch([
    Response.json({ error: "UPSTREAM_ERROR", message: "Business Central request failed with HTTP 400. Application_DialogException: No se pueden guardar los cambios en este momento, porque un registro de la tabla 'Cab. venta' se está actualizando en una transacción realizada en otra sesión. Vuelva a intentarlo más tarde." }, { status: 400 }),
    new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
  ]);

  await requestTenantInvoicePdf(PAYLOAD, undefined, ms => { delays.push(ms); return Promise.resolve(); });

  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [45_000]);
});

test("retries a network failure and reports progress", async () => {
  const delays = [];
  const progress = [];
  const calls = sequenceFetch([
    new TypeError("fetch failed"),
    new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } }),
  ]);

  await requestTenantInvoicePdf(PAYLOAD, number => progress.push(number), ms => { delays.push(ms); return Promise.resolve(); });

  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [45_000]);
  assert.deepEqual(progress, [2]);
});

test("gives up after the bounded attempt window", async () => {
  const delays = [];
  const progress = [];
  const calls = sequenceFetch(Array.from({ length: 18 }, () => busyResponse()));

  await assert.rejects(
    () => requestTenantInvoicePdf(PAYLOAD, number => progress.push(number), ms => { delays.push(ms); return Promise.resolve(); }),
    error => /tras 18 intentos/.test(error.message) && /generación en curso/.test(error.message),
  );
  assert.equal(calls.length, 18);
  assert.equal(delays.length, 17);
  assert.equal(progress.length, 17);
  assert.equal(progress[0], 2);
  assert.equal(progress[16], 18);
});
