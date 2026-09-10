const config = Object.freeze({ apiBaseUrl: "https://smart-metering-portal-backend.amakunin7.workers.dev" });

export async function login(username, password) {
  const session = await request("/api/session", { method: "POST", body: JSON.stringify({ username, password }) });
  const invoices = await request("/api/draft-invoices");
  return portalData(session.user, invoices.value ?? []);
}

export async function logout() {
  await request("/api/session", { method: "DELETE" });
}

export async function requestDraftInvoice(payload) {
  return request("/api/draft-invoices", { method: "POST", body: JSON.stringify(payload) });
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
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || "factura-borrador.pdf";
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
  const now = new Date();
  const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return {
    user: { name: user.displayName || user.username, email: "No disponible", customerNumbers: user.customerNumbers },
    customers,
    supplies: [],
    periods: [{ id: periodId, label: "Datos energéticos pendientes", consumption: 0, production: 0, surplus: 0, battery: 0, comparison: 0, series: { consumption: [0], production: [0], surplus: [0] } }],
    invoices: invoices.map(invoice => ({
      id: invoice.id,
      number: invoice.number,
      customerNumber: invoice.customerNumber,
      cups: "—",
      period: invoice.documentDate || "Sin fecha",
      amount: invoice.amountIncludingTax,
      status: "Borrador",
      pdfAvailable: true,
    })),
  };
}
