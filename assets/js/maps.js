let map;
let markers = new Map();

export function renderSupplyMap(containerId, supplies) {
  if (!window.L) throw new Error("Leaflet no está disponible.");
  map = L.map(containerId, { scrollWheelZoom: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  const bounds = [];
  supplies.forEach(supply => {
    const position = [supply.latitude, supply.longitude];
    const marker = L.marker(position).addTo(map).bindPopup(`<strong>${supply.address}</strong><br>${supply.cups}<br>Tarifa ${supply.tariff}`);
    markers.set(supply.cups, marker);
    bounds.push(position);
  });
  map.fitBounds(bounds, { padding: [35, 35], maxZoom: 12 });
}

export function focusSupply(cups) {
  if (!map || cups === "all") return;
  const marker = markers.get(cups);
  if (!marker) return;
  map.setView(marker.getLatLng(), 15, { animate: true });
  marker.openPopup();
}
