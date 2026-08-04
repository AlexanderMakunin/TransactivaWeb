export async function loadDemoData() {
  const response = await fetch("assets/data/demo.json");
  if (!response.ok) throw new Error(`No se pudieron cargar los datos (${response.status})`);
  return response.json();
}
