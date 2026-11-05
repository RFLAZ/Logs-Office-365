const {csvEvents,activityReport}=require('./activity');
const {xlsxEvents}=require('./activity-reader');
const {workbook}=require('./xlsx');
const input=document.querySelector('#files'),status=document.querySelector('#status'),button=document.querySelector('#analyze'),results=document.querySelector('#results');
let url=null;
input.addEventListener('change',()=>{button.disabled=!input.files.length;results.replaceChildren();status.textContent=`${input.files.length} archivo(s) seleccionado(s).`;if(url){URL.revokeObjectURL(url);url=null;}});
button.addEventListener('click',async()=>{
 button.disabled=true;input.disabled=true;results.replaceChildren();if(url){URL.revokeObjectURL(url);url=null;}
 try {
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
  const output=await workbook(report,(done,total)=>{status.textContent=`Generando informe · ${Math.round(done/total*100)} %`;});
  url=URL.createObjectURL(new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download='actividad_office365.xlsx';link.textContent='Descargar informe de actividad';link.className='download';results.append(link);
  status.textContent=`${report.events.toLocaleString('es')} eventos · ${report.users.toLocaleString('es')} usuarios identificados · 1 XLSX con Actividad y Resumen por usuario.`;
  const warning=document.createElement('p');warning.textContent=`Datos que no constan en el origen: ${report.missing.user.toLocaleString('es')} eventos sin usuario; ${report.missing.ip.toLocaleString('es')} sin IP; ${report.missing.action.toLocaleString('es')} sin acción. Fechas vacías o no reconocidas: ${report.missing.date.toLocaleString('es')} (al final de la tabla).`;results.append(warning);
 }catch(error){status.textContent=`No se pudo generar el informe: ${error.message}`;}
 finally{input.disabled=false;button.disabled=!input.files.length;}
});
