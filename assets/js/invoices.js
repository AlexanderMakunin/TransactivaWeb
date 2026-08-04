export function renderInvoices(target, invoices, onPreview) {
  target.innerHTML = invoices.map((invoice, index) => `<tr>
    <td><input class="invoice-check" type="checkbox" aria-label="Seleccionar ${invoice.number}"></td>
    <td><strong>${invoice.number}</strong></td><td>${invoice.cups}</td><td>${invoice.period}</td><td>${invoice.amount.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</td>
    <td><span class="status ${invoice.status === "Pendiente" ? "pending" : ""}">${invoice.status}</span></td><td><button class="table-action" data-invoice-index="${index}" type="button">Ver PDF</button></td>
  </tr>`).join("");
  target.querySelectorAll("[data-invoice-index]").forEach(button => button.addEventListener("click", () => onPreview(invoices[Number(button.dataset.invoiceIndex)])));
}
