function reputationHint({keyPresent,fileCount}) {
 if(!keyPresent)return 'Introduce tu clave de AbuseIPDB. No se guarda y solo se comprobará al consultar la primera IP pública.';
 if(!fileCount)return 'Clave introducida. Ahora selecciona un CSV o XLSX y pulsa «Generar informe y consultar IP». Todavía no se ha comprobado la clave ni se ha consumido cuota.';
 return 'Clave introducida y archivo seleccionado. Pulsa «Generar informe y consultar IP». La consulta es directa a AbuseIPDB, sin lanzadores ni programas adicionales.';
}
module.exports={reputationHint};
