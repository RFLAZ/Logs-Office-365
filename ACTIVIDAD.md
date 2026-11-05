# Office 365 · Actividad por usuario

Herramienta independiente del conversor CSV → XLSX. Acepta CSV originales o los XLSX generados por el conversor y produce un único informe Excel, con todos los eventos ordenados cronológicamente. El análisis de archivos funciona localmente y sin conexión en Windows, macOS o Linux. La consulta opcional de reputación con AbuseIPDB requiere Internet, Python 3 y una clave API. El script incluido abre la interfaz y realiza las consultas.

## Descargar y abrir

1. [Descarga office365-actividad.zip](https://github.com/RFLAZ/Logs-Office-365/raw/refs/heads/main/office365-actividad.zip).
2. Descomprime el ZIP y ejecuta `python3 iniciar.py` para que se abra la interfaz, como se explica debajo. Si solo necesitas análisis sin reputación, puedes abrir `index.html` directamente.
3. Selecciona uno o varios CSV o XLSX. Para reputación, activa AbuseIPDB, pega la clave y pulsa **Generar informe y consultar IP**. Sin reputación, pulsa **Generar tabla de actividad**.
4. Descarga `actividad_office365.xlsx`.

En el repositorio puedes abrir `dist/actividad.html`. Para el análisis sin reputación no necesitas Python, Node.js, acceso a Microsoft 365 ni subir tus archivos a un servidor.

## Reputación de IP con AbuseIPDB

El navegador no puede ejecutar un script del ordenador ni controlar las restricciones CORS del proveedor. Esta versión incluye **`iniciar.py`**, un único script Python que contiene toda la interfaz, abre el navegador y realiza las consultas para el HTML. No hay archivos `.command` y no hace falta desactivar las protecciones del Mac.

1. Descomprime el ZIP.
2. En Mac abre Terminal, escribe `python3 ` (con un espacio al final), arrastra `iniciar.py` desde Finder a Terminal y pulsa Intro. También puedes ejecutar `python3 iniciar.py` desde su carpeta; en Windows, `py -3 iniciar.py`. Requiere Python 3, sin paquetes adicionales.
3. Se abre automáticamente la interfaz. Usa esa pestaña y mantén abierta la ventana de Terminal.
4. Carga el CSV o XLSX, activa **Consultar reputación de IP con AbuseIPDB**, pega tu clave y pulsa **Generar informe y consultar IP**.
5. Descarga el Excel con **Actividad**, **Resumen por usuario** y **Reputación IP**. Termina con Ctrl+C en Terminal cuando ya no necesites la aplicación.

`iniciar.py` es autónomo: puedes moverlo o copiarlo a otra carpeta y seguirá funcionando sin los otros archivos del ZIP. El HTML incluido se puede abrir por separado para analizar sin reputación; no puede arrancar el script por sí solo. Si el navegador no se abre automáticamente, la dirección local aparece en Terminal. Para desarrollo puedes ejecutar `python3 local/iniciar.py` después de compilar. El script empaquetado se genera con `npm run package`.

Pegar la clave no consume cuota. La autenticación se comprueba al consultar la primera IP pública. El HTML envía las IP y la clave al script en `127.0.0.1`, y este llama a `https://api.abuseipdb.com/api/v2/check`, con verificación TLS y sin seguir redirecciones. Así la conexión con AbuseIPDB no depende de CORS. La clave va en la cabecera `Key` al proveedor, no en la URL. No se envían al proveedor usuarios, acciones, archivos ni logs completos, ni se usan proxies públicos. La clave no se guarda en el navegador, archivos, registros del script o Excel y se borra del formulario al terminar.

Se normalizan IPv4 con puerto, IPv6 entre corchetes e IPv4 mapeada para evitar duplicados. Se omiten IP privadas, reservadas e inválidas, y se calcula localmente su número de eventos y usuarios asociados. El límite es por informe (100 peticiones por defecto), no la cuota diaria de tu cuenta. Se detienen las consultas al alcanzar el límite, recibir cuota agotada o producirse un error; el Excel conserva el informe y marca cada IP no consultada o fallida. No hay reintentos automáticos. Puedes **Cancelar consultas y generar informe** para conservar lo obtenido; una petición enviada puede haber consumido cuota.

La hoja incluye puntuación de confianza de abuso (0–100), informes e informantes, última notificación, país, ISP, dominio, tipo de uso, lista blanca y fecha de consulta. Puntuación vacía significa que no hay resultado, no una puntuación cero. Es reputación actual basada en el período seleccionado; no reconstruye la reputación en la fecha del evento. Una puntuación cero no acredita que una IP sea segura.

La integración se valida con el script real y respuestas de AbuseIPDB simuladas; no se ha usado una clave real en este entorno. Los errores de autenticación, cuota, conexión y certificados se indican sin revelar claves ni desactivar verificaciones.

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

Se validó en Chromium la carga y descarga a partir del CSV UAL original completo y de su XLSX: ambos generan la misma actividad para los 50.000 eventos, con las fechas ordenadas y el resumen sumando 50.000. No se observaron errores JavaScript ni peticiones externas. La integración de AbuseIPDB se valida con respuestas simuladas, sin clave real ni consultas al proveedor: IP únicas, exclusión de rangos no públicos, comunicación entre HTML y script local, clave inválida, cuota, cancelación y generación de la tercera hoja. No se ha verificado una consulta real autenticada a AbuseIPDB en este entorno. Las pruebas automáticas cubren selección de campos, datos ausentes, SignIns, orden temporal, ambas codificaciones de texto XLSX, fechas numéricas, varias hojas y estructura del informe. Ningún log, identidad de usuario ni informe con datos reales se distribuye en los ZIP ni en el repositorio.
