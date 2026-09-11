import assert from "node:assert/strict";
import test from "node:test";

import { applyDashboard, portalData } from "../assets/js/data-service.js";

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

test("builds monthly energy and battery totals from authorized dashboard", () => {
  const data = portalData({ username: "user", customerNumbers: ["C001"] }, []);
  const periodId = data.periods[0].id;
  const period = applyDashboard(data, {
    customer: { number: "C001", name: "Cliente", address: "Calle 1", solarPower: 5, contractedPowerP1: "5.5", contractedPowerP3: "5.5" },
    supplies: [{ cups: "ES001", customerNumber: "C001", tariff: "2.0TD", latitude: "40.4168", longitude: "-3.7038" }],
    dailyEnergy: [{ cups: "ES001", date: `${periodId}-01`, consumption: 10, production: 7, productionAvailable: true, surplus: 2, estimated: false }],
    batteryBalances: [{ cups: "ES001", amount: 4.5 }],
    draftInvoices: [{ id: "invoice-id", number: "FV-2", customerNumber: "C001", cups: "ES001", amountIncludingTax: 42, confidence: "Alto" }],
  }, periodId);
  assert.equal(period.consumption, 10);
  assert.equal(period.production, 7);
  assert.equal(period.surplus, 2);
  assert.equal(period.battery, 4.5);
  assert.equal(period.productionCoverage, 1);
  assert.equal(data.supplies[0].power, "5.5 / 5.5 kW");
  assert.equal(data.supplies[0].latitude, 40.4168);
  assert.equal(data.supplies[0].longitude, -3.7038);
  assert.equal(data.invoices[0].number, "FV-2");
  assert.equal(data.invoices[0].confidence, "Alto");
});
