let map;
let markers = new Map();

export function renderSupplyMap(containerId, supplies) {
  const container = document.getElementById(containerId);
  const section = container.closest(".map-section");
  const locatedSupplies = supplies.filter(supply => Number.isFinite(supply.latitude) && Number.isFinite(supply.longitude));
  if (map) {
    map.remove();
    markers.clear();
  }
  if (locatedSupplies.length === 0) {
    section.hidden = true;
    container.replaceChildren();
    return;
  }
  section.hidden = false;
  container.textContent = "";
  container.classList.remove("content-state");
  if (!window.L) {
    container.textContent = "El mapa no está disponible en este momento.";
    container.classList.add("content-state");
    return;
  }
  map = L.map(containerId, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const bounds = [];
  locatedSupplies.forEach(supply => {
    const position = [supply.latitude, supply.longitude];
    const popup = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = supply.address;
    popup.append(title, document.createElement("br"), document.createTextNode(supply.cups), document.createElement("br"), document.createTextNode(`Tarifa ${supply.tariff}`));
    const marker = L.marker(position).addTo(map).bindPopup(popup);
    markers.set(supply.cups, marker);
    bounds.push(position);
  });
  if (bounds.length > 0)
    map.fitBounds(bounds, { padding: [35, 35], maxZoom: 12 });
  else
    map.setView([40.4168, -3.7038], 5);
}

export function focusSupply(cups) {
  if (!map || cups === "all") return;
  const marker = markers.get(cups);
  if (!marker) return;
  map.setView(marker.getLatLng(), 15, { animate: true });
  marker.openPopup();
}
