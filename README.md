# Prototipo del área cliente de Transactiva

Reconstrucción estática del portal original con una presentación alineada con la web pública actual de Transactiva. No contiene credenciales, datos reales ni conexión con las APIs.

## Probarlo

Al utilizar módulos JavaScript y un fichero JSON, debe abrirse desde un servidor web. Puede publicarse directamente en GitHub Pages o probarse localmente con la extensión **Live Server** de VS Code.

## Alcance

- Panel mensual de consumo, producción, excedentes y batería virtual.
- Selector de CUPS y periodo.
- Indicadores y gráfico recalculados para el CUPS seleccionado; la opción global muestra el consolidado.
- Porcentaje solar calculado a partir de producción, excedentes y consumo, con análisis ampliado dinámico.
- Gráfico SVG sin dependencias externas.
- Suministros, facturas y vista previa de PDF.
- Perfil y cambio de contraseña simulados.
- Mapa interactivo con Leaflet y OpenStreetMap; las coordenadas son ficticias.
- Diseño adaptable a móvil y escritorio.

Los datos de `assets/data/demo.json` son ficticios. La futura integración debe consumir una API segura; nunca se deben exponer credenciales de Datadis, Oligo, i-DE o Business Central en JavaScript.

El mapa utiliza los servidores públicos de teselas de OpenStreetMap únicamente para este prototipo de bajo tráfico. Mantiene visible la atribución y no descarga mapas en segundo plano. Para producción debe revisarse la política vigente o contratar un proveedor de teselas con garantías de servicio.

## Publicar en GitHub Pages

1. Subir el contenido de esta carpeta a la rama `main` de un repositorio.
2. Abrir `Settings > Pages`.
3. Seleccionar `Deploy from a branch`, rama `main` y carpeta `/root`.
4. Esperar a que GitHub muestre la URL pública.
