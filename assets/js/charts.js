function createPath(values, width, height, max) {
  return values.map((value, index) => `${index ? "L" : "M"} ${(index * width / (values.length - 1)).toFixed(1)} ${(height - value * height / max).toFixed(1)}`).join(" ");
}

export function renderEnergyChart(container, series) {
  const width = 760, height = 220;
  const max = Math.max(1, ...series.consumption, ...series.production, ...series.surplus);
  const consumption = createPath(series.consumption, width, height, max);
  const production = createPath(series.production, width, height, max);
  const surplus = createPath(series.surplus, width, height, max);
  container.innerHTML = `<svg viewBox="0 0 760 255" preserveAspectRatio="none">
    <defs><linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172c2b" stop-opacity=".16"/><stop offset="1" stop-color="#172c2b" stop-opacity="0"/></linearGradient></defs>
    ${[0,55,110,165,220].map(y => `<line class="chart-grid" x1="0" y1="${y}" x2="760" y2="${y}"/>`).join("")}
    <path class="chart-area" d="${consumption} L 760 220 L 0 220 Z"/><path class="chart-consumption" d="${consumption}"/><path class="chart-production" d="${production}"/><path class="chart-surplus" d="${surplus}"/>
    ${["Día 1","Día 6","Día 11","Día 16","Día 21","Día 26","Fin"].map((label, i) => `<text class="chart-label" x="${i * 122}" y="248">${label}</text>`).join("")}
  </svg>`;
}
