const {csvEvents,activityReport}=require('./activity');
const {xlsxEvents}=require('./activity-reader');
const {workbook}=require('./xlsx');
const {reputationSheet}=require('./reputation');
const {checkLocalScript,reputationHint}=require('./reputation-ui');
const input=document.querySelector('#files'),status=document.querySelector('#status'),button=document.querySelector('#analyze'),results=document.querySelector('#results');
let url=null,queryController=null;
const enabled=document.querySelector('#reputation'),options=document.querySelector('#reputation-options'),cancel=document.querySelector('#cancel-reputation');
const keyInput=document.querySelector('#abuse-key'),reputationStatus=document.querySelector('#reputation-status');
let launcher='checking',scriptCheck=0;
function showReputationHint() {
 reputationStatus.textContent=reputationHint({launcher,keyPresent:!!keyInput.value.trim(),fileCount:input.files.length});
 button.textContent=enabled.checked?'Generar informe y consultar IP':'Generar tabla de actividad';
}
enabled.addEventListener('change',async()=>{
 options.hidden=!enabled.checked;const attempt=++scriptCheck;
 if(enabled.checked){launcher='checking';showReputationHint();const state=await checkLocalScript(location);if(attempt===scriptCheck){launcher=state;showReputationHint();}}
 else showReputationHint();
});
keyInput.addEventListener('input',showReputationHint);
cancel.addEventListener('click',()=>{queryController?.abort();cancel.disabled=true;});
input.addEventListener('change',()=>{button.disabled=!input.files.length;results.replaceChildren();status.textContent=`${input.files.length} archivo(s) seleccionado(s).`;showReputationHint();if(url){URL.revokeObjectURL(url);url=null;}});
button.addEventListener('click',async()=>{
 button.disabled=true;input.disabled=true;results.replaceChildren();if(url){URL.revokeObjectURL(url);url=null;}
 const reputationEnabled=enabled.checked;
 enabled.disabled=true;
 options.querySelectorAll('input,select').forEach(control=>{control.disabled=true;});
 let reputationOutcome='';
 try {
  let apiKey='';let queryLimit=100,maxAge=90;
  if(reputationEnabled) {
   launcher=await checkLocalScript(location);showReputationHint();
   if(launcher!=='ready')throw new Error(reputationHint({launcher,keyPresent:!!keyInput.value.trim(),fileCount:input.files.length}));
   apiKey=document.querySelector('#abuse-key').value.trim();
   queryLimit=Number(document.querySelector('#query-limit').value);maxAge=Number(document.querySelector('#max-age').value);
   if(!apiKey)throw new Error('Introduce tu clave de AbuseIPDB. No se guardará.');
   if(!Number.isInteger(queryLimit)||queryLimit<1||queryLimit>10000)throw new Error('El límite debe estar entre 1 y 10.000 consultas.');
  }
  const events=[];
  for(const file of input.files){
   status.textContent=`Leyendo ${file.name}…`;await new Promise(resolve=>setTimeout(resolve,30));
   const bytes=await file.arrayBuffer();let found;
   if(/\.xlsx$/i.test(file.name))found=await xlsxEvents(bytes,file.name,(stage,progress)=>{status.textContent=`${file.name}: ${stage} · ${progress} %`;});
   else if(/\.csv$/i.test(file.name))found=csvEvents(new TextDecoder(document.querySelector('#encoding').value,{fatal:true}).decode(bytes),file.name);
   else throw new Error('Selecciona archivos CSV o XLSX.');
   for(const event of found)events.push(event);
  }
  if(!events.length)throw new Error('No se encontraron eventos.');
  status.textContent='Ordenando todos los eventos por fecha…';await new Promise(resolve=>setTimeout(resolve,30));
  const report=activityReport(events);
  let reputation=null;
  if(reputationEnabled) {
   queryController=new AbortController();cancel.hidden=false;cancel.disabled=false;
   status.textContent='Identificando IP únicas para AbuseIPDB…';
   reputation=await reputationSheet(events,{key:apiKey,limit:queryLimit,maxAge,signal:queryController.signal,onProgress:(done,total)=>{status.textContent=`AbuseIPDB: consulta ${done} de hasta ${total}. Puedes cancelar y conservar los resultados obtenidos.`;}});
   reputationOutcome=`${reputation.success} consultas completadas de ${reputation.attempted} intentadas. ${reputation.stop || ''} La clave se ha borrado del formulario.`;
   report.sheets.push(reputation);queryController=null;cancel.hidden=true;
  }
  const output=await workbook(report,(done,total)=>{status.textContent=`Generando informe · ${Math.round(done/total*100)} %`;});
  url=URL.createObjectURL(new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download='actividad_office365.xlsx';link.textContent='Descargar informe de actividad';link.className='download';results.append(link);
  status.textContent=`${report.events.toLocaleString('es')} eventos · ${report.users.toLocaleString('es')} usuarios identificados · 1 XLSX con Actividad, Resumen por usuario${reputation?' y Reputación IP':''}.`;
  const warning=document.createElement('p');warning.textContent=`Datos que no constan en el origen: ${report.missing.user.toLocaleString('es')} eventos sin usuario; ${report.missing.ip.toLocaleString('es')} sin IP; ${report.missing.action.toLocaleString('es')} sin acción. Fechas vacías o no reconocidas: ${report.missing.date.toLocaleString('es')} (al final de la tabla).`;results.append(warning);
  if(reputation){const note=document.createElement('p');note.textContent=`Reputación: ${reputation.success} consultas completadas de ${reputation.attempted} intentadas; ${reputation.unique} IP únicas detectadas. ${reputation.stop || ''} Consulta la hoja Reputación IP para ver las IP omitidas y los errores.`;results.append(note);}
 }catch(error){status.textContent=`No se pudo generar el informe: ${error.message}`;if(reputationEnabled)reputationOutcome=error.message;}
 finally{keyInput.value='';queryController=null;cancel.hidden=true;enabled.disabled=false;input.disabled=false;button.disabled=!input.files.length;options.querySelectorAll('input,select').forEach(control=>{control.disabled=false;});showReputationHint();if(reputationOutcome)reputationStatus.textContent=reputationOutcome;}
});
