# Office 365 · Actividad por usuario

Herramienta independiente del conversor CSV → XLSX. Acepta CSV originales o los XLSX generados por el conversor y produce un único informe Excel, con todos los eventos ordenados cronológicamente. El análisis de archivos funciona localmente y sin conexión en Windows, macOS o Linux. La consulta opcional de reputación con AbuseIPDB requiere Internet y una clave API. Se hace directamente desde el navegador, sin instalar programas.

## Descargar y abrir

1. [Descarga office365-actividad.zip](https://github.com/RFLAZ/Logs-Office-365/raw/refs/heads/main/office365-actividad.zip).
2. Descomprime el ZIP y abre `index.html` con Chrome, Edge o Firefox actualizado. Mantén `activity-app.js` junto a `index.html`.
3. Selecciona uno o varios CSV o XLSX. Pulsa **Generar tabla de actividad**.
4. Descarga `actividad_office365.xlsx`.

En el repositorio puedes abrir `dist/actividad.html`. Para el análisis sin reputación no necesitas Python, Node.js, acceso a Microsoft 365 ni subir tus archivos a un servidor.

## Reputación de IP con AbuseIPDB (opcional)

1. Abre `index.html` con Chrome, Edge o Firefox actualizado.
2. Selecciona tus CSV o XLSX y marca **Consultar reputación de IP con AbuseIPDB**.
3. Pega tu clave en la página, ajusta el límite (100 consultas por defecto) y pulsa **Generar informe y consultar IP**.
4. El Excel añade la hoja **Reputación IP**. No necesitas Python, Terminal, servidores ni archivos `.command`.

Pegar la clave no inicia consultas ni consume cuota. Se comprueba al consultar la primera IP pública. Se envía directamente a `https://api.abuseipdb.com/api/v2/check` cada IP pública distinta con la clave en la cabecera `Key`, nunca en la URL. No se envían usuarios, acciones, archivos ni logs completos. No se usan proxies públicos ni servicios intermediarios. La clave no se guarda en el navegador, archivos o Excel y se borra del formulario al terminar. La conexión HTTPS mantiene la verificación TLS del navegador.

La conexión depende de que AbuseIPDB admita el origen del navegador mediante CORS. **No se ha podido verificar una conexión autenticada real desde este entorno.** Si el proveedor bloquea la conexión, o falla Internet/TLS, se detienen las consultas y se informa en la interfaz y en la hoja; se conserva el informe de actividad. No se presentan esas IP como seguras ni con puntuación cero. No se pide desactivar las protecciones de macOS o del navegador. Las pruebas de conexión usan respuestas simuladas que admiten CORS; no demuestran que el proveedor lo admita en producción.

Se normalizan IPv4 con puerto, IPv6 entre corchetes e IPv4 mapeada para evitar duplicados. Se omiten IP privadas, reservadas e inválidas, y se calcula localmente su número de eventos y usuarios asociados. El límite de peticiones es por informe y no equivale a la cuota diaria de tu cuenta. Se detienen las consultas al alcanzar el límite, recibir cuota agotada (HTTP 429, o cabecera de cuota cero cuando el navegador puede leerla) o producirse un error. No hay reintentos automáticos. Puedes **Cancelar consultas y generar informe** para conservar lo ya obtenido; una petición enviada puede haber consumido cuota.

La hoja incluye puntuación de confianza de abuso (0–100), número de informes e informantes, última notificación, país, ISP, dominio, tipo de uso, lista blanca y fecha de consulta. Puntuación vacía significa que no hay resultado, no una puntuación cero. Es reputación actual basada en el período seleccionado; no reconstruye la reputación en la fecha del evento. Una puntuación cero no acredita que una IP sea segura.

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

Se validó en Chromium la carga y descarga a partir del CSV UAL original completo y de su XLSX: ambos generan la misma actividad para los 50.000 eventos, con las fechas ordenadas y el resumen sumando 50.000. No se observaron errores JavaScript ni peticiones externas. La integración de AbuseIPDB se valida con respuestas simuladas, sin clave real ni consultas al proveedor: IP únicas, exclusión de rangos no públicos, conexión directa, bloqueo de conexión/CORS, clave inválida, cuota, cancelación y generación de la tercera hoja. No se ha verificado una consulta real autenticada a AbuseIPDB en este entorno. Las pruebas automáticas cubren selección de campos, datos ausentes, SignIns, orden temporal, ambas codificaciones de texto XLSX, fechas numéricas, varias hojas y estructura del informe. Ningún log, identidad de usuario ni informe con datos reales se distribuye en los ZIP ni en el repositorio.
