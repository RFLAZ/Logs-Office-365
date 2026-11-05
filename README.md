# Office 365: CSV → XLSX

Interfaz en español para convertir exportaciones UAL, Interactive SignIns, NonInteractive SignIns y AuthDetails en archivos Excel. Los archivos se procesan en memoria en el navegador: no hay backend, telemetría, CDN, API ni cargas a servidores.

## Herramienta independiente: actividad por usuario

[Descarga office365-actividad.zip](https://github.com/RFLAZ/Logs-Office-365/raw/refs/heads/main/office365-actividad.zip) para generar una tabla cronológica con usuario, acción, fecha e IP a partir de CSV o XLSX. Incluye resumen por usuario y permite combinar varios archivos. Ofrece consulta opcional de reputación con AbuseIPDB directamente desde el navegador, sin lanzadores (sujeta a que el proveedor permita CORS). [Instrucciones de actividad](ACTIVIDAD.md). El conversor de esta página sigue generando sus columnas expandidas sin añadir informes de actividad.

## Uso sin instalación

1. [Descarga el conversor ZIP](https://github.com/RFLAZ/Logs-Office-365/raw/refs/heads/main/office365-conversor.zip) y descomprímelo.
2. Abre `index.html` con Chrome, Edge o Firefox. Conserva `app.js` en la misma carpeta.
3. Selecciona uno o varios CSV, el orden de fecha y la codificación. Pulsa **Crear archivos XLSX**.
4. Pulsa **Descargar XLSX** en cada resultado.

También puedes abrir `dist/index.html` directamente desde el repositorio. La herramienta funciona sin conexión. Si una política corporativa impide abrir páginas locales, consulta con tu administrador; para desarrollo se puede servir `dist` con un servidor estático local.

## Datos y organización

- Un único XLSX por CSV con todos sus registros ordenados, sin dividir las descargas en partes. No se unen ni correlacionan automáticamente los registros. AuthDetails contiene varias filas por solicitud y se conserva así.
- Detecta comas, punto y coma o tabulaciones; permite UTF-8, Windows-1252 y UTF-16 LE.
- Conserva todas las columnas originales, incluso el JSON. Las cabeceras duplicadas reciben sufijos únicos.
- Expande JSON válido en cualquier columna, incluidos objetos, listas y JSON guardado como texto dentro de otros campos (también con varias capas de codificación): `AuditData.Parameters.0.Name`. En claves JSON, `~0` representa `~` y `~1` representa un punto literal.
- Orden cronológico ascendente o descendente, o conservación del orden. Detecta `CreationDate`, `CreationTime`, `CreatedDateTime`, `Data`, `Data (UTC)`, `Date` y `Fecha`; puedes indicar una cabecera exacta. Fechas locales: día/mes/año; no se reformatea el valor original. Fechas no reconocidas se colocan al final y se avisa.
- Conserva correos, IP, identificadores y ceros iniciales como texto. Los valores que comienzan por `=` no se convierten en fórmulas.
- Primera fila fija, filtros y anchuras de columna ajustadas a las cabeceras.
- Detecta UAL encapsulado en CSV de Excel separado por punto y coma. Recupera los campos y conserva todas las celdas exteriores originales en `CSVOriginal.Celdas`, para no perder contenido durante la recuperación.
- Se conservan `AuditData` y las cadenas JSON internas originales junto a las columnas expandidas. Las columnas expandidas aparecen juntas, con fecha, operación, usuario e IP al principio del bloque AuditData y el resto agrupado por ruta. El JSON original y las cadenas JSON internas se colocan al final como referencia. Los objetos y listas vacíos se conservan.
- JSON inválido se conserva sin expandir y se informa. CSV con filas inconsistentes se rechaza con el número de fila.

## Límites

La lectura y expansión completas requieren memoria del navegador, especialmente con UAL grandes o JSON con muchas claves; no es procesamiento en streaming. La escritura omite celdas ausentes y comprime el XML de forma incremental para generar un único XLSX sin acumular un objeto por cada celda. El navegador puede tardar y dejar de responder temporalmente durante la lectura y expansión. Excel admite 16.384 columnas y 32.767 caracteres por celda: se informa del error en lugar de truncar. Los registros se reparten en varias hojas si superan 1.048.575 por hoja. Guarda los XLSX en una ubicación segura: contienen los mismos datos sensibles del CSV. Al cerrar la pestaña desaparecen las referencias de la aplicación, pero los originales y las descargas permanecen donde los guardaste.

## Desarrollo

Node.js 24 y npm:

```sh
npm ci
npm test
npm run build
```

`src/converter.js` contiene el lector, expansión, orden y escritura; `src/app.js`, la interfaz. `src/xlsx.js` escribe XLSX con compresión incremental mediante fflate. El bundle de `dist/app.js` incluye las dependencias para funcionar sin Internet. `dist/index.html` aplica una política CSP con `connect-src 'none'`.

Las pruebas usan datos sintéticos: JSON anidado y listas, Unicode, orden, cabeceras repetidas, protección de columnas originales, fórmulas y límites de Excel. Se validaron además en Chromium las cargas y descargas de los dos ejemplos de SignIns suministrados (1.102 y 15.654 registros), sin peticiones externas ni fórmulas. La muestra UAL Libro1.csv se validó con 66 registros: se recupera el CSV encapsulado de una reexportación desde Excel, se expanden 224 columnas JSON y se conservan las celdas de origen en CSVOriginal.Celdas. En 27 registros el JSON recuperado no es válido: se conserva sin expandir y se muestra un aviso. Para expandir esos registros hace falta la exportación UAL original, anterior a su apertura y reexportación desde Excel. El CSV original completo tiene 50.000 registros y 2.513 columnas JSON expandidas (2.521 columnas totales), incluida la expansión recursiva de JSON guardado como texto, sin JSON ni fechas inválidos; se exporta completo en un único XLSX, con los 50.000 registros en una hoja. Ningún ejemplo ni resultado con datos reales se incluye en este repositorio o en el ZIP.
