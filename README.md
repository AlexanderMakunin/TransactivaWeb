# Prototipo del área cliente de Transactiva

Prototipo del portal conectado al backend seguro de Cloudflare Worker y a la API de Business Central. No contiene secretos ni credenciales embebidas.

## Probarlo

No se debe abrir `index.html` directamente: el navegador bloquea los módulos y el JSON bajo `file://`.

En Windows, haga doble clic en **Abrir prototipo.cmd**. Se iniciará un servidor local y se abrirá `http://127.0.0.1:4173`. La ventana debe permanecer abierta mientras se usa el prototipo. Alternativamente:

```powershell
npm start
```

También puede usarse **Live Server** de VS Code o publicarse en GitHub Pages.

## Alcance

- Login contra `Clientes Web` mediante Cloudflare Worker, sin persistir contraseña ni token Business Central.
- Filtrado de clientes, suministros y facturas autorizados para usuario actual.
- Solicitud de factura de inquilino: cliente, borrador de referencia (aporta cliente y CUPS al backend), periodo de días arbitrario, fecha de factura, nombre, dirección y NIF/NIE; descarga el PDF generado sin registrar ni contabilizar.
- Búsqueda, filtro, estado vacío y detalle de facturas.
- Panel mensual real: consumo/excedente Máximo, producción MySQL y batería confirmada.
- Selector de cliente autorizado, CUPS y últimos doce meses.
- Selector de CUPS y periodo.
- Indicadores y gráfico recalculados para CUPS seleccionado; opción global muestra consolidado del cliente.
- Porcentaje solar calculado a partir de producción, excedentes y consumo, con análisis ampliado dinámico.
- Gráfico SVG sin dependencias externas.
- Suministros, facturas y vista previa de PDF.
- Perfil y cierre de sesión reales.
- Mapa interactivo preparado para suministros con coordenadas; la API actual todavía no las devuelve.
- Diseño adaptable a móvil y escritorio.

El backend autentica la sesión y repite la autorización por cliente en cada operación. El navegador solo recibe una cookie opaca `HttpOnly`, `Secure` y `SameSite=None`, necesaria porque GitHub Pages y `workers.dev` son sitios distintos. Nunca deben exponerse credenciales de Datadis, Oligo, i-DE, Azure o Business Central en JavaScript.

En local, el login solo funcionará si el Worker admite explícitamente `http://127.0.0.1:4173` en CORS. En el despliegue normal debe limitarse al origen exacto de GitHub Pages.

## Calidad

```powershell
npm run check
npm test
```

El mapa utiliza los servidores públicos de teselas de OpenStreetMap únicamente para este prototipo de bajo tráfico. Mantiene visible la atribución y no descarga mapas en segundo plano. Para producción debe revisarse la política vigente o contratar un proveedor de teselas con garantías de servicio.

## Publicar en GitHub Pages

1. Subir el contenido de esta carpeta a la rama `main` de un repositorio.
2. Abrir `Settings > Pages`.
3. Seleccionar `Deploy from a branch`, rama `main` y carpeta `/root`.
4. Esperar a que GitHub muestre la URL pública.
