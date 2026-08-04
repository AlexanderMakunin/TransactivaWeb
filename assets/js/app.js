import { loadDemoData } from "./data-service.js";
import { renderEnergyChart } from "./charts.js";
import { renderInvoices } from "./invoices.js";
import { focusSupply, renderSupplyMap } from "./maps.js";

const euro = value => value.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const energy = value => `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })} kWh`;
let data;
let currentView;

function toast(message) { const element = document.querySelector("#toast"); element.textContent = message; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 2200); }
function openDialog(dialog) { document.querySelector("#modalBackdrop").hidden = false; dialog.showModal(); }
function closeDialogs() { document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close()); document.querySelector("#modalBackdrop").hidden = true; }

function renderSupplyCards() {
  document.querySelector("#supplyCount").textContent = `${data.supplies.length} suministros`;
  document.querySelector("#supplyCards").innerHTML = data.supplies.map(supply => `<article class="supply-card">
    <div class="supply-top"><span class="supply-icon">⌁</span><span class="status ${supply.status === "En revisión" ? "pending" : ""}">${supply.status}</span></div>
    <h3>${supply.address}</h3><p class="cups">${supply.cups}</p>
    <dl><div><dt>Tarifa</dt><dd>${supply.tariff}</dd></div><div><dt>Potencia</dt><dd>${supply.power}</dd></div></dl>
    <button class="text-button choose-supply" data-cups="${supply.cups}" type="button">Ver suministro →</button>
  </article>`).join("");
  document.querySelectorAll(".choose-supply").forEach(button => button.addEventListener("click", () => { document.querySelector("#supplyFilter").value = button.dataset.cups; document.querySelector("#dashboard").scrollIntoView(); refresh(); }));
}

function getPeriodView(period, cups) {
  if (cups === "all") return calculateSolarValues({ ...period });
  const supply = data.supplies.find(item => item.cups === cups);
  const scale = (values, factor) => values.map(value => Number((value * factor).toFixed(2)));
  const view = {
    consumption: period.consumption * supply.consumptionShare,
    production: period.production * supply.productionShare,
    surplus: period.surplus * supply.surplusShare,
    battery: period.battery * supply.batteryShare,
    comparison: period.comparison + supply.comparisonAdjustment,
    series: {
      consumption: scale(period.series.consumption, supply.consumptionShare),
      production: scale(period.series.production, supply.productionShare),
      surplus: scale(period.series.surplus, supply.surplusShare)
    }
  };
  return calculateSolarValues(view);
}

function calculateSolarValues(view) {
  view.selfConsumed = Math.max(0, Math.min(view.consumption, view.production - view.surplus));
  view.gridEnergy = Math.max(0, view.consumption - view.selfConsumed);
  view.selfConsumption = view.consumption > 0 ? Math.round(view.selfConsumed / view.consumption * 100) : 0;
  view.surplusRatio = view.production > 0 ? Math.round(view.surplus / view.production * 100) : 0;
  return view;
}

function renderPeriod(period, cups = "all") {
  const view = getPeriodView(period, cups);
  currentView = view;
  document.querySelector("#consumptionMetric").textContent = energy(view.consumption);
  document.querySelector("#productionMetric").textContent = energy(view.production);
  document.querySelector("#surplusMetric").textContent = energy(view.surplus);
  document.querySelector("#batteryMetric").textContent = euro(view.battery);
  document.querySelector("#consumptionComparison").textContent = `${view.comparison < 0 ? "↓" : "↑"} ${Math.abs(view.comparison).toLocaleString("es-ES", { maximumFractionDigits: 1 })} % respecto al mes anterior`;
  document.querySelector("#selfConsumptionMetric").textContent = `${view.selfConsumption} % de autoconsumo`;
  document.querySelector("#solarScore").textContent = view.selfConsumption;
  document.querySelector("#solarScore").parentElement.style.setProperty("--solar-percent", `${view.selfConsumption}%`);
  document.querySelector("#insightText").textContent = view.selfConsumption >= 65 ? "Tu producción está cubriendo una parte importante del consumo. Revisa los excedentes para aprovechar mejor la energía generada." : "Existe margen para desplazar consumo a las horas de mayor producción solar.";
  renderEnergyChart(document.querySelector("#energyChart"), view.series);
}

function renderCompleteAnalysis() {
  const selectedCups = document.querySelector("#supplyFilter").value;
  const selectedPeriod = data.periods.find(period => period.id === document.querySelector("#periodFilter").value);
  const supply = data.supplies.find(item => item.cups === selectedCups);
  document.querySelector("#analysisTitle").textContent = selectedCups === "all" ? "Balance consolidado" : supply.address;
  document.querySelector("#analysisContext").textContent = `${selectedPeriod.label} · ${selectedCups === "all" ? "Todos los suministros" : selectedCups}`;
  document.querySelector("#analysisSelfConsumed").textContent = energy(currentView.selfConsumed);
  document.querySelector("#analysisGridEnergy").textContent = energy(currentView.gridEnergy);
  document.querySelector("#analysisSolarCoverage").textContent = `${currentView.selfConsumption} %`;
  document.querySelector("#analysisSurplus").textContent = `${energy(currentView.surplus)} (${currentView.surplusRatio} % de la producción)`;
  document.querySelector("#solarBar").style.width = `${currentView.selfConsumption}%`;

  let title; let recommendation;
  if (currentView.surplusRatio >= 30) {
    title = "Hay excedente aprovechable";
    recommendation = "Una parte relevante de la producción se vierte a la red. Conviene comparar compensación, batería virtual y desplazamiento de consumos a las horas solares antes de valorar almacenamiento físico.";
  } else if (currentView.selfConsumption < 40) {
    title = "Puedes aumentar el uso directo de energía solar";
    recommendation = "La cobertura solar es reducida. Programar climatización, agua caliente, carga de vehículos u otros consumos durante las horas de producción podría reducir la energía tomada de la red.";
  } else {
    title = "El equilibrio solar es razonable";
    recommendation = "La producción cubre una parte significativa del consumo y el excedente se mantiene moderado. Revisa varios meses antes de modificar potencia, tarifa o almacenamiento.";
  }
  document.querySelector("#analysisRecommendationTitle").textContent = title;
  document.querySelector("#analysisRecommendation").textContent = recommendation;
  openDialog(document.querySelector("#analysisDialog"));
}

function refresh() {
  const selectedCups = document.querySelector("#supplyFilter").value;
  const invoices = selectedCups === "all" ? data.invoices : data.invoices.filter(invoice => invoice.cups === selectedCups);
  renderPeriod(data.periods.find(period => period.id === document.querySelector("#periodFilter").value), selectedCups);
  renderInvoices(document.querySelector("#invoiceRows"), invoices, previewInvoice);
  focusSupply(selectedCups);
  toast("Vista actualizada con datos de demostración");
}

function previewInvoice(invoice) {
  document.querySelector("#invoiceDialogTitle").textContent = invoice.number;
  openDialog(document.querySelector("#invoiceDialog"));
}

async function init() {
  try { data = await loadDemoData(); } catch (error) { document.body.innerHTML = `<main class="load-error"><h1>No se pudo abrir el prototipo</h1><p>${error.message}</p><p>Ábrelo mediante GitHub Pages o un servidor web local.</p></main>`; return; }
  document.querySelector("#customerFirstName").textContent = data.customer.name.split(" ")[0];
  document.querySelector("#profileName").textContent = data.customer.name; document.querySelector("#profileEmail").textContent = data.customer.email; document.querySelector("#profileNumber").textContent = data.customer.number;
  document.querySelector("#supplyFilter").innerHTML = `<option value="all">Todos los suministros</option>${data.supplies.map(supply => `<option value="${supply.cups}">${supply.address}</option>`).join("")}`;
  document.querySelector("#periodFilter").innerHTML = data.periods.map(period => `<option value="${period.id}">${period.label}</option>`).join("");
  renderSupplyCards(); renderInvoices(document.querySelector("#invoiceRows"), data.invoices, previewInvoice); renderPeriod(data.periods[0]); renderSupplyMap("supplyMap", data.supplies);
}

document.querySelector("#refreshButton").addEventListener("click", refresh);
document.querySelector("#supplyFilter").addEventListener("change", refresh);
document.querySelector("#periodFilter").addEventListener("change", refresh);
document.querySelector("#profileButton").addEventListener("click", () => openDialog(document.querySelector("#profileDialog")));
document.querySelector("#analysisButton").addEventListener("click", renderCompleteAnalysis);
document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click", closeDialogs));
document.querySelector("#modalBackdrop").addEventListener("click", closeDialogs);
document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#mainNav").classList.toggle("open"));
document.querySelector("#passwordForm").addEventListener("submit", event => { event.preventDefault(); closeDialogs(); toast("Contraseña actualizada (simulación)"); event.target.reset(); });
document.querySelector("#downloadSelected").addEventListener("click", () => { const count = document.querySelectorAll(".invoice-check:checked").length; toast(count ? `${count} descarga(s) simulada(s)` : "Selecciona al menos una factura"); });
init();
