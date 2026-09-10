import assert from "node:assert/strict";
import test from "node:test";

import { portalData } from "../assets/js/data-service.js";

test("maps only customers authorized by backend session", () => {
  const result = portalData(
    { username: "usuario", displayName: "Usuario", customerNumbers: ["C001"] },
    [{ id: "invoice-id", number: "FV-1", customerNumber: "C001", customerName: "Cliente 1", documentDate: "2026-09-01", amountIncludingTax: 12.5 }],
  );

  assert.deepEqual(result.customers, [{ number: "C001", name: "Cliente 1" }]);
  assert.equal(result.invoices[0].number, "FV-1");
  assert.equal(result.invoices[0].status, "Borrador");
  assert.deepEqual(result.user.customerNumbers, ["C001"]);
});
