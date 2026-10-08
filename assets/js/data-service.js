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

// Bucle de sondeo de generación (regla 34: reintentos limitados a fallos
// transitorios conocidos). Un solo POST no sobrevive al corte de
// infraestructura (~125 s → 502) ni a una generación larga de BC: cada
// repetición de la MISMA petición responde 425 «en curso» (o 502 si vuelva a
// cortar) hasta que el reclamo de BC entrega el PDF al terminar. 18 intentos ×
// 45 s = 765 s ≈ 12,75 min de espera + primer intento largo (hasta ~125 s si
// hay corte) ≈ 14-15 min de ventana, por encima del máximo de 6-10 min del
// job. Un429/500/502/503/504/524/408 también se reintenta; el resto
// (400/401/403/404/409/415/422…) es error funcional y se lanza al instante.
const GENERATION_MAX_ATTEMPTS = 18;
const GENERATION_RETRY_DELAY_MS = 45_000;
const RETRY_AFTER_CAP_MS = 120_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 524]);

export async function requestTenantInvoicePdf(payload, onAttempt, delay = sleep) {
  let lastMessage = "";
  for (let attempt = 1; attempt <= GENERATION_MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(`${config.apiBaseUrl}/api/draft-invoices`, {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/pdf", "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Fallo de red del navegador: transitorio, cuenta como intento fallido.
      lastMessage = "Sin conexión con el servidor.";
      if (attempt === GENERATION_MAX_ATTEMPTS) break;
      onAttempt?.(attempt + 1);
      await delay(generationRetryDelay(undefined));
      continue;
    }
    if (response.ok) {
      await savePdf(response, "factura-inquilino.pdf");
      return;
    }
    const errorPayload = await response.json().catch(() => ({}));
    lastMessage = errorPayload.message || `No se pudo generar la factura de inquilino (${response.status}).`;
    // Compatibilidad con un worker aún sin mapeo 425: el texto de busy del
    // candado también marca el400 como transitorio mientras se despliega.
    // Variantes reales: "…actualizando en otra sesión" y "…actualizando en
    // una transacción realizada en otra sesión" (08/10/2026).
    const busyText = response.status === 400 && /generaci[óo]n en curso|actualiz[^.]*otra sesi[óo]n/i.test(lastMessage);
    if (!RETRYABLE_STATUSES.has(response.status) && !busyText) throw new Error(lastMessage);
    if (attempt === GENERATION_MAX_ATTEMPTS) break;
    onAttempt?.(attempt + 1);
    await delay(generationRetryDelay(response.headers.get("retry-after")));
  }
  throw new Error(`La generación sigue sin completarse tras ${GENERATION_MAX_ATTEMPTS} intentos (~13 min de espera). ${lastMessage}`);
}

function generationRetryDelay(retryAfterHeader) {
  const header = Number(retryAfterHeader);
  const delay = Number.isFinite(header) && header > 0 ? header * 1000 : GENERATION_RETRY_DELAY_MS;
  return Math.min(Math.max(delay, 10_000), RETRY_AFTER_CAP_MS);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
