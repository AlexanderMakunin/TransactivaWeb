import { downloadDraftInvoicePdf, login, logout, requestDraftInvoice } from "./data-service.js";
import { renderEnergyChart } from "./charts.js";
import { renderInvoices } from "./invoices.js";
import { focusSupply, renderSupplyMap } from "./maps.js";

const euro = value => value == null ? "Pendiente" : value.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const energy = value => `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kWh`;
const element = selector => document.querySelector(selector);
let data;
let currentView;
let selectedInvoice;
let toastTimer;

function toast(message) {
  const target = element("#toast");
  target.textContent = message;
  target.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => target.classList.remove("show"), 2600);
}

function openDialog(dialog) {
  element("#modalBackdrop").hidden = false;
  dialog.showModal();
}

function closeDialogs() {
  document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
  element("#modalBackdrop").hidden = true;
}

function option(value, label) {
  const item = document.createElement("option");
  item.value = value;
  item.textContent = label;
  return item;
}

async function submitLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = element("#loginButton");
  const error = element("#loginError");
  error.hidden = true;

  if (!form.reportValidity()) return;
  button.disabled = true;
  button.textContent = "Comprobando acceso…";
  try {
    data = await login(form.username.value.trim(), form.password.value);
    form.password.value = "";
    showPortal();
  } catch (loginError) {
    error.textContent = loginError.message;
    error.hidden = false;
    form.password.value = "";
    form.password.focus();
  } finally {
    button.disabled = false;
    button.textContent = "Entrar";
  }
}

function showPortal() {
  element("#loginView").hidden = true;
  element("#portalShell").hidden = false;
  element("#customerFirstName").textContent = data.user.name.split(" ")[0];
  element("#navUserName").textContent = data.user.name;
  element("#profileName").textContent = data.user.name;
  element("#profileEmail").textContent = data.user.email;
  element("#profileCustomerCount").textContent = String(data.customers.length);
  fillSelectors();
  renderSupplyCards();
  renderPeriod(data.periods[0]);
  renderSupplyMap("supplyMap", data.supplies);
  renderInvoiceList();
  element("#mainContent").focus({ preventScroll: true });
}

function fillSelectors() {
  const supplyFilter = element("#supplyFilter");
  supplyFilter.replaceChildren(option("all", "Todos los suministros"));
  for (const supply of data.supplies) supplyFilter.append(option(supply.cups, supply.address));

  const periodFilter = element("#periodFilter");
  periodFilter.replaceChildren(...data.periods.map(period => option(period.id, period.label)));

  const customerFilter = element("#invoiceCustomer");
  customerFilter.replaceChildren(...data.customers.map(customer => option(customer.number, `${customer.name} · ${customer.number}`)));
}

function renderSupplyCards() {
  element("#supplyCount").textContent = `${data.supplies.length} suministro${data.supplies.length === 1 ? "" : "s"}`;
  const container = element("#supplyCards");
  container.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const supply of data.supplies) {
    const card = document.createElement("article");
    card.className = "supply-card";
    const top = document.createElement("div"); top.className = "supply-top";
    const icon = document.createElement("span"); icon.className = "supply-icon"; icon.textContent = "⌁"; icon.setAttribute("aria-hidden", "true");
    const status = document.createElement("span"); status.className = `status ${supply.status === "En revisión" ? "pending" : ""}`.trim(); status.textContent = supply.status;
    top.append(icon, status);
    const title = document.createElement("h3"); title.textContent = supply.address;
    const cups = document.createElement("p"); cups.className = "cups"; cups.textContent = supply.cups;
    const details = document.createElement("dl"); details.append(detail("Tarifa", supply.tariff), detail("Potencia", supply.power));
    const button = document.createElement("button"); button.className = "text-button choose-supply"; button.type = "button"; button.textContent = "Ver suministro →";
    button.addEventListener("click", () => { element("#supplyFilter").value = supply.cups; element("#dashboard").scrollIntoView(); refresh(false); });
    card.append(top, title, cups, details, button); fragment.append(card);
  }
  container.append(fragment);
}

function detail(term, description) {
  const wrapper = document.createElement("div"); const dt = document.createElement("dt"); const dd = document.createElement("dd");
  dt.textContent = term; dd.textContent = description; wrapper.append(dt, dd); return wrapper;
}

function getPeriodView(period, cups) {
  if (cups === "all") return calculateSolarValues({ ...period });
  const supply = data.supplies.find(item => item.cups === cups);
  if (!supply) return calculateSolarValues({ ...period });
  const scale = (values, factor) => values.map(value => Number((value * factor).toFixed(2)));
  return calculateSolarValues({ consumption: period.consumption * supply.consumptionShare, production: period.production * supply.productionShare, surplus: period.surplus * supply.surplusShare, battery: period.battery * supply.batteryShare, comparison: period.comparison + supply.comparisonAdjustment, series: { consumption: scale(period.series.consumption, supply.consumptionShare), production: scale(period.series.production, supply.productionShare), surplus: scale(period.series.surplus, supply.surplusShare) } });
}

function calculateSolarValues(view) {
  view.selfConsumed = Math.max(0, Math.min(view.consumption, view.production - view.surplus));
  view.gridEnergy = Math.max(0, view.consumption - view.selfConsumed);
  view.selfConsumption = view.consumption > 0 ? Math.round(view.selfConsumed / view.consumption * 100) : 0;
  view.surplusRatio = view.production > 0 ? Math.round(view.surplus / view.production * 100) : 0;
  return view;
}

function renderPeriod(period, cups = "all") {
  currentView = getPeriodView(period, cups);
  element("#consumptionMetric").textContent = energy(currentView.consumption);
  element("#productionMetric").textContent = energy(currentView.production);
  element("#surplusMetric").textContent = energy(currentView.surplus);
  element("#batteryMetric").textContent = euro(currentView.battery);
  element("#consumptionComparison").textContent = `${currentView.comparison < 0 ? "↓" : "↑"} ${Math.abs(currentView.comparison).toLocaleString("es-ES", { maximumFractionDigits: 1 })} % respecto al mes anterior`;
  element("#selfConsumptionMetric").textContent = `${currentView.selfConsumption} % de autoconsumo`;
  element("#solarScore").textContent = currentView.selfConsumption;
  element("#solarScore").parentElement.style.setProperty("--solar-percent", `${currentView.selfConsumption}%`);
  element("#insightText").textContent = currentView.selfConsumption >= 65 ? "Tu producción cubre una parte importante del consumo. Revisa excedentes para aprovechar mejor energía generada." : "Existe margen para desplazar consumo a horas de mayor producción solar.";
  renderEnergyChart(element("#energyChart"), currentView.series);
}

function refresh(showToast = true) {
  const cups = element("#supplyFilter").value;
  const period = data.periods.find(item => item.id === element("#periodFilter").value);
  renderPeriod(period, cups);
  renderInvoiceList();
  focusSupply(cups);
  if (showToast) toast("Vista actualizada");
}

function renderInvoiceList() {
  const cups = element("#supplyFilter").value;
  const search = element("#invoiceSearch").value.trim().toLocaleLowerCase("es");
  const status = element("#invoiceStatusFilter").value;
  const invoices = data.invoices.filter(invoice => (cups === "all" || invoice.cups === cups || invoice.cups === "Pendiente de cálculo") && (status === "all" || invoice.status === status) && (!search || `${invoice.number} ${invoice.cups}`.toLocaleLowerCase("es").includes(search)));
  const hasInvoices = invoices.length > 0;
  element("#invoiceState").hidden = hasInvoices;
  element("#invoiceTableWrap").hidden = !hasInvoices;
  if (!hasInvoices) element("#invoiceState").textContent = "No hay facturas para estos filtros.";
  element("#invoiceSummary").textContent = `${invoices.length} de ${data.invoices.length}`;
  renderInvoices(element("#invoiceRows"), invoices, previewInvoice);
}

function previewInvoice(invoice) {
  selectedInvoice = invoice;
  const customer = data.customers.find(item => item.number === invoice.customerNumber);
  element("#invoiceDialogTitle").textContent = invoice.number;
  element("#invoiceDialogCustomer").textContent = customer ? `${customer.name} · ${customer.number}` : invoice.customerNumber;
  element("#invoiceDialogPeriod").textContent = invoice.period;
  element("#invoiceDialogAmount").textContent = euro(invoice.amount);
  element("#downloadInvoiceButton").disabled = invoice.pdfAvailable === false;
  element("#downloadInvoiceButton").textContent = invoice.pdfAvailable === false ? "PDF pendiente" : "Descargar PDF";
  openDialog(element("#invoiceDialog"));
}

function openInvoiceRequest() {
  const selectedPeriod = data.periods.find(item => item.id === element("#periodFilter").value);
  const [year, month] = selectedPeriod.id.split("-").map(Number);
  element("#invoiceFrom").value = `${year}-${String(month).padStart(2, "0")}-01`;
  element("#invoiceTo").value = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  element("#requestInvoiceError").hidden = true;
  openDialog(element("#requestInvoiceDialog"));
}

async function submitInvoiceRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = element("#requestInvoiceError");
  if (!form.reportValidity()) return;
  if (form.from.value > form.to.value) { error.textContent = "Fecha inicial no puede ser posterior a fecha final."; error.hidden = false; return; }
  error.hidden = true;
  const button = element("#submitInvoiceRequest"); button.disabled = true; button.textContent = "Generando…";
  try {
    const invoice = await requestDraftInvoice({ customerNumber: form.customer.value, from: form.from.value, to: form.to.value, tenantName: form.tenantName.value.trim() });
    data.invoices.unshift(invoice); closeDialogs(); form.reset(); renderInvoiceList(); element("#invoices").scrollIntoView(); toast("Borrador solicitado. Revisa estado antes de usarlo.");
  } catch (requestError) { error.textContent = requestError.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = "Generar borrador"; }
}

function renderCompleteAnalysis() {
  const selectedCups = element("#supplyFilter").value;
  const selectedPeriod = data.periods.find(period => period.id === element("#periodFilter").value);
  const supply = data.supplies.find(item => item.cups === selectedCups);
  element("#analysisTitle").textContent = selectedCups === "all" ? "Balance consolidado" : supply.address;
  element("#analysisContext").textContent = `${selectedPeriod.label} · ${selectedCups === "all" ? "Todos los suministros" : selectedCups}`;
  element("#analysisSelfConsumed").textContent = energy(currentView.selfConsumed); element("#analysisGridEnergy").textContent = energy(currentView.gridEnergy); element("#analysisSolarCoverage").textContent = `${currentView.selfConsumption} %`; element("#analysisSurplus").textContent = `${energy(currentView.surplus)} (${currentView.surplusRatio} % de producción)`; element("#solarBar").style.width = `${currentView.selfConsumption}%`;
  const highSurplus = currentView.surplusRatio >= 30; const lowCoverage = currentView.selfConsumption < 40;
  element("#analysisRecommendationTitle").textContent = highSurplus ? "Hay excedente aprovechable" : lowCoverage ? "Puedes aumentar uso directo de energía solar" : "Equilibrio solar razonable";
  element("#analysisRecommendation").textContent = highSurplus ? "Compara compensación, batería virtual y desplazamiento de consumos antes de valorar almacenamiento físico." : lowCoverage ? "Programa consumos durante horas de producción para reducir energía tomada de red." : "Revisa varios meses antes de modificar potencia, tarifa o almacenamiento.";
  openDialog(element("#analysisDialog"));
}

async function closeSession() {
  try {
    await logout();
  } catch (error) {
    toast(error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.");
    return;
  }
  data = undefined; selectedInvoice = undefined; closeDialogs(); element("#portalShell").hidden = true; element("#loginView").hidden = false; element("#loginUsername").focus();
}

element("#loginForm").addEventListener("submit", submitLogin);
element("#togglePassword").addEventListener("click", event => { const input = element("#loginPassword"); const visible = input.type === "text"; input.type = visible ? "password" : "text"; event.currentTarget.textContent = visible ? "Mostrar" : "Ocultar"; event.currentTarget.setAttribute("aria-label", `${visible ? "Mostrar" : "Ocultar"} contraseña`); });
element("#refreshButton").addEventListener("click", () => refresh()); element("#supplyFilter").addEventListener("change", () => refresh(false)); element("#periodFilter").addEventListener("change", () => refresh(false));
element("#invoiceSearch").addEventListener("input", renderInvoiceList); element("#invoiceStatusFilter").addEventListener("change", renderInvoiceList);
element("#profileButton").addEventListener("click", () => openDialog(element("#profileDialog"))); element("#logoutButton").addEventListener("click", closeSession); element("#analysisButton").addEventListener("click", renderCompleteAnalysis);
element("#requestInvoiceButton").addEventListener("click", openInvoiceRequest); element("#requestInvoiceForm").addEventListener("submit", submitInvoiceRequest);
element("#downloadInvoiceButton").addEventListener("click", async event => {
  if (!selectedInvoice || selectedInvoice.pdfAvailable === false) return;
  const button = event.currentTarget; button.disabled = true; button.textContent = "Preparando PDF…";
  try { await downloadDraftInvoicePdf(selectedInvoice.id); toast("PDF descargado"); }
  catch (error) { toast(error.message || "No se pudo descargar el PDF."); }
  finally { button.disabled = false; button.textContent = "Descargar PDF"; }
});
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", closeDialogs)); element("#modalBackdrop").addEventListener("click", closeDialogs);
element("#menuButton").addEventListener("click", event => { const nav = element("#mainNav"); const open = nav.classList.toggle("open"); event.currentTarget.setAttribute("aria-expanded", String(open)); });
