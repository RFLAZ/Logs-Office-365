# Office 365 · Actividad por usuario

Herramienta independiente del conversor CSV → XLSX. Acepta CSV originales o los XLSX generados por el conversor y produce un único informe Excel, con todos los eventos ordenados cronológicamente. El análisis de archivos funciona localmente y sin conexión en Windows, macOS o Linux. La consulta opcional de reputación con AbuseIPDB requiere Internet y Python 3.

## Descargar y abrir

1. [Descarga office365-actividad.zip](https://github.com/RFLAZ/Logs-Office-365/raw/refs/heads/main/office365-actividad.zip).
2. Descomprime el ZIP y abre `index.html` con Chrome, Edge o Firefox actualizado. Mantén `activity-app.js` junto a `index.html`.
3. Selecciona uno o varios CSV o XLSX. Pulsa **Generar tabla de actividad**.
4. Descarga `actividad_office365.xlsx`.

En el repositorio puedes abrir `dist/actividad.html`. Para el análisis sin reputación no necesitas Python, Node.js, acceso a Microsoft 365 ni subir tus archivos a un servidor.

## Reputación de IP con AbuseIPDB (opcional)

1. Instala Python 3 desde [python.org](https://www.python.org/downloads/) si no lo tienes.
2. En la carpeta descomprimida abre `iniciar-mac.command` en macOS o `iniciar-windows.bat` en Windows. El lanzador abre el navegador. También puedes ejecutar `python3 iniciar_actividad.py` desde Terminal en macOS/Linux, o `py -3 iniciar_actividad.py` en Windows. En el checkout de desarrollo puedes usar `python3 local/iniciar_actividad.py` después de compilar.
3. Mantén abierta la ventana del lanzador. Marca **Consultar reputación de IP con AbuseIPDB** e introduce la clave en el campo de contraseña de la página; no en Terminal.
4. Ajusta el límite de consultas (100 por defecto) y el período de informes (90 días por defecto). Carga tus archivos y genera el informe.
5. El Excel añade una tercera hoja, **Reputación IP**. Cierra el lanzador con Ctrl+C al terminar.

Si macOS no permite abrir el archivo `.command`, ejecuta `python3 iniciar_actividad.py` desde Terminal dentro de la carpeta descomprimida. No es necesario desactivar las protecciones de macOS. Para el lanzador estándar se recomienda Python 3.8 o superior; las pruebas se ejecutan en Python 3.12.

La aplicación consulta una vez cada IP pública distinta de todos los archivos seleccionados. Normaliza IPv4 con puerto, IPv6 entre corchetes e IPv4 mapeada en IPv6 para evitar consultas duplicadas. No consulta direcciones privadas, reservadas o inválidas. La cuenta de eventos y usuarios asociados se calcula localmente.

**Datos enviados:** únicamente cada IP pública a consultar y la clave para autenticar la petición ante AbuseIPDB. No se envían usuarios, acciones, archivos ni logs completos. El navegador envía la petición al lanzador en `127.0.0.1`; este llama exclusivamente a `https://api.abuseipdb.com/api/v2/check`, con verificación TLS activa. La clave viaja en la cabecera `Key` hacia AbuseIPDB, nunca en la URL. No se guarda en archivos, almacenamiento del navegador, registros del servidor ni en el Excel. El campo se vacía al terminar cada ejecución.

**Límites y fallos:** el límite es por informe, no la cuota diaria de tu cuenta. Se respeta el agotamiento de cuota indicado por el proveedor. Un error de autenticación, cuota o conexión detiene las consultas restantes; el informe se genera con lo obtenido y cada IP indica si fue consultada, omitida, cancelada o falló. Puedes pulsar **Cancelar consultas y generar informe**. No hay reintentos automáticos que consuman más cuota.

La hoja incluye puntuación de confianza de abuso (0–100), número de informes e informantes, última notificación, país, ISP, dominio, tipo de uso, lista blanca y fecha de consulta. Una celda de puntuación vacía significa que no hay resultado, no una puntuación cero. Es reputación actual basada en el período seleccionado; no reconstruye la reputación que tenía la IP en la fecha del evento. Una puntuación cero no acredita que una IP sea segura.

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

Se validó en Chromium la carga y descarga a partir del CSV UAL original completo y de su XLSX: ambos generan la misma actividad para los 50.000 eventos, con las fechas ordenadas y el resumen sumando 50.000. No se observaron errores JavaScript ni peticiones externas. La integración de AbuseIPDB se valida con respuestas simuladas, sin clave real ni consultas al proveedor: IP únicas, exclusión de rangos no públicos, clave inválida, cuota, cancelación y generación de la tercera hoja. No se ha verificado una consulta real autenticada a AbuseIPDB en este entorno. Las pruebas automáticas cubren selección de campos, datos ausentes, SignIns, orden temporal, ambas codificaciones de texto XLSX, fechas numéricas, varias hojas y estructura del informe. Ningún log, identidad de usuario ni informe con datos reales se distribuye en los ZIP ni en el repositorio.
