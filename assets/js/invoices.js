const euro = value => value == null ? "Pendiente" : value.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function renderInvoices(target, invoices, onPreview) {
  target.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const invoice of invoices) {
    const row = document.createElement("tr");
    appendCell(row, invoice.number, true); appendCell(row, invoice.cups); appendCell(row, invoice.period); appendCell(row, euro(invoice.amount));
    const confidenceCell = row.insertCell(); const confidence = document.createElement("span"); confidence.className = `confidence ${confidenceClass(invoice.confidence)}`.trim(); confidence.textContent = invoice.confidence; confidence.title = invoice.confidenceReason || "Confianza de datos"; confidenceCell.append(confidence);
    const statusCell = row.insertCell(); const status = document.createElement("span"); status.className = `status ${statusClass(invoice.status)}`.trim(); status.textContent = invoice.status; statusCell.append(status);
    const actionCell = row.insertCell(); const button = document.createElement("button"); button.className = "table-action"; button.type = "button"; button.textContent = invoice.pdfAvailable === false ? "Ver detalle" : "Ver PDF"; button.addEventListener("click", () => onPreview(invoice)); actionCell.append(button);
    fragment.append(row);
  }
  target.append(fragment);
}

function appendCell(row, value, strong = false) { const cell = row.insertCell(); const content = strong ? document.createElement("strong") : document.createTextNode(String(value ?? "—")); if (strong) content.textContent = String(value ?? "—"); cell.append(content); }
function statusClass(status) { if (status === "Pendiente") return "pending"; if (status === "Borrador") return "draft"; return ""; }
function confidenceClass(confidence) { if (confidence === "Alto") return "high"; if (confidence === "Medio") return "medium"; if (confidence === "Bajo") return "low"; return "unknown"; }
