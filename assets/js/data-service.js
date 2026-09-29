const config = Object.freeze({ apiBaseUrl: "https://smart-metering-portal-backend.amakunin7.workers.dev" });

export async function login(username, password) {
  const session = await request("/api/session", { method: "POST", body: JSON.stringify({ username, password }) });
  return portalData(session.user, []);
}

export async function loadDashboard(customerNumber, periodId, cups = "") {
  const [year, month] = periodId.split("-").map(Number);
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const to = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  const query = new URLSearchParams({ customerNumber, from, to });
  if (cups) query.set("cups", cups);
  return request(`/api/dashboard?${query}`);
}

export async function logout() {
  await request("/api/session", { method: "DELETE" });
}

export async function requestTenantInvoicePdf(payload) {
  const response = await fetch(`${config.apiBaseUrl}/api/draft-invoices`, {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/pdf", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `No se pudo generar la factura de inquilino (${response.status}).`);
  }
  await savePdf(response, "factura-inquilino.pdf");
}

export async function downloadDraftInvoicePdf(invoiceId) {
  const response = await fetch(`${config.apiBaseUrl}/api/draft-invoices/${encodeURIComponent(invoiceId)}/pdf`, {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/pdf" },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || `No se pudo descargar el PDF (${response.status}).`);
  }
  await savePdf(response, "factura-borrador.pdf");
}

// content-disposition no es visible en peticiones cross-origin sin expose-headers,
// por eso cada llamada aporta su nombre de respaldo.
async function savePdf(response, fallbackName) {
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = fileName;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function request(path, options = {}) {
  const headers = { accept: "application/json", ...options.headers };
  if (options.body) headers["content-type"] = "application/json";
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...options, credentials: "include", headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Error del servicio (${response.status}).`);
  return payload;
}

export function portalData(user, invoices) {
  const customers = user.customerNumbers.map(number => ({
    number,
    name: invoices.find(invoice => invoice.customerNumber === number)?.customerName || number,
  }));
  return {
    user: { username: user.username, name: user.displayName || user.username, email: "No disponible", customerNumbers: user.customerNumbers },
    customers,
    supplies: [],
    periods: monthOptions(12),
    invoices: invoices.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      customerNumber: invoice.customerNumber,
      cups: invoice.cups || "—",
      period: invoice.energyPeriodMonth || invoice.documentDate || "Sin fecha",
      amount: invoice.amountIncludingTax,
      status: "Borrador",
      confidence: invoice.confidence || "Sin calcular",
      confidenceReason: invoice.confidenceReason || "",
      estimatedDays: invoice.estimatedDays || 0,
      missingReadingDays: invoice.missingReadingDays || 0,
      pdfAvailable: true,
    })),
  };
}

export function applyDashboard(data, dashboard, periodId) {
  const customer = dashboard.customer;
  const customerIndex = data.customers.findIndex(item => item.number === customer.number);
  const mappedCustomer = { number: customer.number, name: customer.name };
  if (customerIndex >= 0) data.customers[customerIndex] = mappedCustomer;
  data.invoices = (dashboard.draftInvoices ?? []).map(mapInvoice);

  const daily = dashboard.dailyEnergy ?? [];
  const totalsByCups = new Map();
  for (const row of daily) {
    const totals = totalsByCups.get(row.cups) ?? { consumption: 0, production: 0, surplus: 0, rows: 0, productionRows: 0 };
    totals.consumption += Number(row.consumption) || 0;
    totals.production += Number(row.production) || 0;
    totals.surplus += Number(row.surplus) || 0;
    totals.rows += 1;
    if (row.productionAvailable === true) totals.productionRows += 1;
    totalsByCups.set(row.cups, totals);
  }
  const allTotals = [...totalsByCups.values()].reduce((sum, item) => ({
    consumption: sum.consumption + item.consumption,
    production: sum.production + item.production,
    surplus: sum.surplus + item.surplus,
    rows: sum.rows + item.rows,
    productionRows: sum.productionRows + item.productionRows,
  }), { consumption: 0, production: 0, surplus: 0, rows: 0, productionRows: 0 });
  const balances = new Map((dashboard.batteryBalances ?? []).map(item => [item.cups, Math.max(0, Number(item.amount) || 0)]));
  const totalBattery = [...balances.values()].reduce((sum, value) => sum + value, 0);
  const address = [customer.address, customer.address2, customer.postCode, customer.city].filter(Boolean).join(", ") || customer.name;
  data.supplies = (dashboard.supplies ?? []).map(supply => {
    const totals = totalsByCups.get(supply.cups) ?? { consumption: 0, production: 0, surplus: 0, rows: 0, productionRows: 0 };
    return {
      cups: supply.cups, customerNumber: customer.number, address, tariff: supply.tariff || "Sin tarifa",
      latitude: finiteCoordinate(supply.latitude), longitude: finiteCoordinate(supply.longitude),
      power: contractedPower(customer, supply.tariff), status: daily.some(row => row.cups === supply.cups) ? "Con datos" : "Sin datos",
      consumptionShare: ratio(totals.consumption, allTotals.consumption), productionShare: ratio(totals.production, allTotals.production),
      surplusShare: ratio(totals.surplus, allTotals.surplus), batteryShare: ratio(balances.get(supply.cups) || 0, totalBattery), comparisonAdjustment: 0,
      productionCoverage: ratio(totals.productionRows, totals.rows),
    };
  });
  const period = data.periods.find(item => item.id === periodId);
  Object.assign(period, {
    consumption: allTotals.consumption, production: allTotals.production, surplus: allTotals.surplus, battery: totalBattery,
    comparison: null, series: dailySeries(daily, periodId), estimatedDays: new Set(daily.filter(row => row.estimated).map(row => row.date)).size,
    hasSolar: Number(customer.solarPower) > 0, productionCoverage: ratio(allTotals.productionRows, allTotals.rows),
  });
  return period;
}

function mapInvoice(invoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    customerNumber: invoice.customerNumber,
    cups: invoice.cups || "—",
    period: invoice.energyPeriodMonth || invoice.documentDate || "Sin fecha",
    amount: Number(invoice.amountIncludingTax) || 0,
    status: "Borrador",
    confidence: invoice.confidence || "Sin calcular",
    confidenceReason: invoice.confidenceReason || "",
    estimatedDays: Number(invoice.estimatedDays) || 0,
    missingReadingDays: Number(invoice.missingReadingDays) || 0,
    pdfAvailable: true,
  };
}

function monthOptions(count) {
  const formatter = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" });
  const now = new Date();
  return Array.from({ length: count }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return { id: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: formatter.format(date), consumption: 0, production: 0, surplus: 0, battery: 0, comparison: null, series: { consumption: [0], production: [0], surplus: [0] } };
  });
}

function dailySeries(rows, periodId) {
  const [year, month] = periodId.split("-").map(Number);
  const days = new Date(year, month, 0).getDate();
  const result = { consumption: Array(days).fill(0), production: Array(days).fill(0), surplus: Array(days).fill(0) };
  for (const row of rows) {
    const index = Number(row.date.slice(-2)) - 1;
    if (index < 0 || index >= days) continue;
    result.consumption[index] += Number(row.consumption) || 0;
    result.production[index] += Number(row.production) || 0;
    result.surplus[index] += Number(row.surplus) || 0;
  }
  return result;
}

function ratio(value, total) { return total > 0 ? value / total : 0; }
function finiteCoordinate(value) {
  if (value == null || value === "") return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}
function contractedPower(customer, tariff) {
  const periods = tariff === "3.0TD" ? [1, 2, 3, 4, 5, 6] : [1, 3];
  const values = periods.map(number => customer[`contractedPowerP${number}`]).filter(value => value && value !== "0");
  return values.length ? `${values.join(" / ")} kW` : "Sin potencia";
}
