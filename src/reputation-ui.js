async function checkLauncher({protocol,hostname,fetcher=fetch}) {
 if(protocol!=='http:' || hostname!=='127.0.0.1')return 'file';
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),3000);
 try {
  const response=await fetcher('/api/status',{cache:'no-store',signal:controller.signal});
  const service=response.ok?await response.json():null;
  return service?.service==='office365-activity' && service.reputation?'ready':'unavailable';
 }catch{return 'unavailable';}
 finally{clearTimeout(timeout);}
}
function reputationHint({launcher,keyPresent,fileCount}) {
 if(launcher==='file')return 'Esta página se ha abierto sin el lanzador local. Para usar AbuseIPDB abre iniciar-mac.command (Mac) o iniciar-windows.bat (Windows) y utiliza la página que se abrirá en el navegador. También puedes ejecutar python3 iniciar_actividad.py desde Terminal. Pegar la clave aquí no inicia consultas.';
 if(launcher==='unavailable')return 'No se detecta el lanzador local. Vuelve a abrir iniciar-mac.command o iniciar-windows.bat y utiliza la nueva página que abra. Mantén la ventana del lanzador abierta.';
 if(launcher!=='ready')return 'Comprobando la conexión con el lanzador local…';
 if(!keyPresent)return 'Lanzador local conectado. Introduce tu clave de AbuseIPDB. La clave solo se comprobará cuando consultes una IP, no al pegarla.';
 if(!fileCount)return 'Clave introducida y lanzador conectado. Ahora selecciona un CSV o XLSX y pulsa «Generar informe y consultar IP». Todavía no se ha comprobado la clave con AbuseIPDB ni se ha consumido cuota.';
 return 'Clave introducida y archivo seleccionado. Pulsa «Generar informe y consultar IP». La clave se comprobará al consultar la primera IP pública; pegarla no inicia consultas.';
}
module.exports={checkLauncher,reputationHint};
