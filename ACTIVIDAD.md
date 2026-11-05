# Office 365 · Actividad por usuario

Herramienta independiente del conversor CSV → XLSX. Acepta CSV originales o los XLSX generados por el conversor y produce un único informe Excel, con todos los eventos ordenados cronológicamente. Funciona localmente y sin conexión en Windows, macOS o Linux.

## Descargar y abrir

1. [Descarga office365-actividad.zip](https://github.com/RFLAZ/Logs-Office-365/raw/refs/heads/main/office365-actividad.zip).
2. Descomprime el ZIP y abre `index.html` con Chrome, Edge o Firefox actualizado. Mantén `activity-app.js` junto a `index.html`.
3. Selecciona uno o varios CSV o XLSX. Pulsa **Generar tabla de actividad**.
4. Descarga `actividad_office365.xlsx`.

En el repositorio puedes abrir `dist/actividad.html`. No necesitas Python, Node.js, acceso a Microsoft 365 ni subir tus archivos a un servidor.

## Hojas del informe

**Actividad:** una fila por evento con fecha UTC, usuario, acción, IP, resultado, aplicación o servicio, recurso, ID del registro, archivo, hoja y fila o registro de origen. Orden ascendente de fecha, filtros y primera fila fija. Filtra la columna Usuario para ver todas las acciones de una cuenta.

**Resumen por usuario:** número de eventos, acciones distintas, IP distintas, primera y última fecha. Las cuentas sin usuario identificado se agrupan en una fila separada como «No consta en el registro».

El informe no elimina eventos repetidos. Si cargas varios archivos se combinan todos y se ordenan por fecha globalmente. No selecciones simultáneamente un CSV y su XLSX equivalente, salvo que quieras contar ambos.

## Origen de los datos

- Para UAL se consultan los campos de `AuditData` y sus columnas expandidas: `CreationTime`, `UserId`, `Operation`, `ClientIP`, `ResultStatus`, `Workload` y `ObjectId`, con alternativas conocidas en las columnas originales.
- Se conservan los nombres de operación registrados por Microsoft 365, sin traducirlos ni inferir una acción distinta.
- Se reconocen cabeceras habituales en inglés, portugués y español, incluidos los ejemplos de SignIns suministrados. Para SignIns sin campo de operación se indica el tipo de inicio de sesión cuando el nombre del archivo permite identificarlo; en otro caso se indica que el tipo no está especificado.
- IP, usuario y acción no disponibles se marcan como **No consta en el registro**, sin inventar datos. La interfaz muestra cuántos eventos carecen de cada dato.
- AuthDetails puede contener únicamente ID de solicitud y detalles de autenticación: no se puede identificar usuario o IP si no figuran en el archivo. Esta versión no correlaciona automáticamente esos ID con otro archivo de SignIns.
- Se preserva el valor de IP registrado, incluidos sus posibles puertos o formato IPv6.
- Las fechas se normalizan a UTC. Fechas sin zona horaria se interpretan como UTC; fechas locales con barras, como día/mes/año. Las fechas vacías o no reconocidas conservan su texto y quedan al final.
- Se reconocen fechas numéricas de Excel con los sistemas 1900 y 1904. Se aceptan XLSX con cadenas compartidas o en línea. Se procesan las hojas `Registros…` cuando existen, evitando contar también los resúmenes. Si no existen, se leen hojas con cabeceras reconocibles, excluyendo las llamadas `Resumen…`.
- No se ejecutan fórmulas ni macros. Se pueden leer resultados de fórmulas guardados en el XLSX. No se admiten XLS antiguos, XLSX cifrados ni ZIP de CSV como entrada directa.

Los CSV se leen completos. Los XLSX se descomprimen y analizan por fragmentos, conservando los campos de actividad necesarios, para no cargar millones de celdas en memoria. El catálogo de cadenas compartidas, cuando existe, sí requiere memoria. Los eventos del informe y sus resúmenes se conservan en memoria para ordenar; con archivos grandes puede tardar. Los libros con más registros que el límite por hoja de Excel usan varias hojas dentro del mismo fichero.

## Desarrollo y validación

```sh
npm ci
npm test
npm run package
```

`src/activity.js` extrae y resume los eventos; `src/activity-reader.js` lee XLSX de forma incremental; `src/activity-app.js` controla la interfaz. Comparten con el conversor el lector CSV y el escritor XLSX, sin añadir la tabla de actividad a las descargas del conversor.

Se validó en Chromium la carga y descarga a partir del CSV UAL original completo y de su XLSX: ambos generan la misma actividad para los 50.000 eventos, con las fechas ordenadas y el resumen sumando 50.000. No se observaron errores JavaScript ni peticiones externas. Las pruebas automáticas cubren selección de campos, datos ausentes, SignIns, orden temporal, ambas codificaciones de texto XLSX, fechas numéricas, varias hojas y estructura del informe. Ningún log, identidad de usuario ni informe con datos reales se distribuye en los ZIP ni en el repositorio.
