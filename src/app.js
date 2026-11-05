const {prepare,workbook,batchSize}=require('./converter');
const input=document.querySelector('#files'), list=document.querySelector('#list'), button=document.querySelector('#convert');
let files=[]; const urls=[];
input.addEventListener('change',()=>{
  urls.splice(0).forEach(URL.revokeObjectURL); files=Array.from(input.files);
  list.replaceChildren();
  files.forEach(file=>{const p=document.createElement('p');p.textContent=`${file.name} · ${(file.size/1048576).toFixed(1)} MB`;list.append(p);});
  button.disabled=!files.length;
});
button.addEventListener('click',async()=>{
  button.disabled=true;input.disabled=true;
  urls.splice(0).forEach(URL.revokeObjectURL);
  list.replaceChildren();
  for(const file of files) {
    const article=document.createElement('article'), title=document.createElement('strong'), status=document.createElement('p');
    title.textContent=file.name;status.textContent='Procesando…';article.append(title,status);list.append(article);
    try {
      await new Promise(resolve=>setTimeout(resolve,30));
      const bytes=await file.arrayBuffer();
      const encoding=document.querySelector('#encoding').value;
      const text=new TextDecoder(encoding,{fatal:true}).decode(bytes);
      const data=prepare(text,{expand:document.querySelector('#expand').checked,sort:document.querySelector('#sort').value,dateColumn:document.querySelector('#date').value.trim()});
      const size=batchSize(data), parts=Math.ceil(data.rows.length/size);
      for (let part=0; part<parts; part++) {
        status.textContent=`Generando XLSX ${part+1} de ${parts}…`;
        await new Promise(resolve=>setTimeout(resolve,30));
        const output=await workbook({...data, rows:data.rows.slice(part*size,(part+1)*size)});
        const url=URL.createObjectURL(new Blob([output],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); urls.push(url);
        const link=document.createElement('a');link.href=url;
        link.download=file.name.replace(/\.csv$/i,'')+'_ordenado'+(parts>1?`_parte_${String(part+1).padStart(2,'0')}`:'')+'.xlsx';
        link.textContent=parts>1?`Descargar parte ${part+1} de ${parts}`:'Descargar XLSX';link.className='download';
        link.style.margin='4px';article.append(link);
      }
      status.textContent=`${data.rows.length.toLocaleString('es')} registros · ${data.headers.length} columnas · ${parts} XLSX. `+(data.unwrapped?'Se recuperaron las columnas del CSV UAL encapsulado. ':'')+(data.dateColumn?`Fecha: ${data.dateColumn}. `:'No se detectó columna de fecha: se conserva el orden. ')+(data.invalidJSON?`${data.invalidJSON} campos JSON inválidos conservados sin expandir. `:'')+(data.invalidDates?`${data.invalidDates} fechas vacías o no reconocidas, al final.`:'');

    } catch(error) {status.textContent=`No se pudo convertir: ${error.message}`;article.className='error';}
  }
  button.disabled=false;input.disabled=false;
});
