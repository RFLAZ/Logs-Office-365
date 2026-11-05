const {Zip, ZipDeflate, strToU8}=require('fflate');
const MAX_ROWS=1048575;
function xml(value) {
  return String(value).replace(/_x[0-9a-f]{4}_/gi, m=>'_x005F_'+m.slice(1))
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/g,c=>`_x${c.charCodeAt(0).toString(16).padStart(4,'0')}_`)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\r/g,'&#13;');
}
function column(index) {
  let result='';for(let n=index;n>0;n=Math.floor((n-1)/26))result=String.fromCharCode(65+(n-1)%26)+result;
  return result;
}
function cell(ref,value,style='') {
  if(typeof value==='string' && value.length>32767) throw new Error('Una celda supera los 32.767 caracteres que permite Excel.');
  if(typeof value==='number' && Number.isFinite(value))return `<c r="${ref}"><v>${value}</v></c>`;
  if(typeof value==='boolean')return `<c r="${ref}" t="b"><v>${value?1:0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
async function workbook(data,onProgress=()=>{}) {
  if(data.headers.length>16384)throw new Error('La expansión supera las 16.384 columnas de Excel. Reduce la expansión JSON.');
  const chunks=[];let failure;
  const zip=new Zip((error,chunk)=>{if(error)failure=error;else chunks.push(chunk);});
  function entry(name){const file=new ZipDeflate(name,{level:1});zip.add(file);return file;}
  function textEntry(name,content){entry(name).push(strToU8(content),true);}
  const count=Math.max(1,Math.ceil(data.rows.length/MAX_ROWS));
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  textEntry('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({length:count},(_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  textEntry('_rels/.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  textEntry('xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${Array.from({length:count},(_,i)=>`<sheet name="Registros ${i+1}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`);
  textEntry('xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({length:count},(_,i)=>`<Relationship Id="rId${i+1}" Type="${rel}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`);
  textEntry('xl/styles.xml',`<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173F50"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  const letters=data.headers.map((_,i)=>column(i+1));
  const indexes=new Map(data.headers.map((h,i)=>[h,i]));
  for(let part=0;part<count;part++) {
    const file=entry(`xl/worksheets/sheet${part+1}.xml`);
    const push=(s,last=false)=>file.push(strToU8(s),last);
    const start=part*MAX_ROWS,end=Math.min(data.rows.length,start+MAX_ROWS);
    push(`<worksheet xmlns="${ns}"><dimension ref="A1:${letters.at(-1)}${end-start+1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${data.headers.map((h,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.min(48,Math.max(18,h.length+2))}" customWidth="1"/>`).join('')}</cols><sheetData><row r="1">${data.headers.map((h,i)=>cell(letters[i]+'1',h,' s="1"')).join('')}</row>`);
    let buffer='';
    for(let i=start;i<end;i++) {
      const r=i-start+2;
      buffer+=`<row r="${r}">`;
      const entries=[...data.rows[i]].filter(([h,v])=>indexes.has(h)&&v!==''&&v!==null&&v!==undefined).sort((a,b)=>indexes.get(a[0])-indexes.get(b[0]));
      for(const [h,v] of entries)buffer+=cell(letters[indexes.get(h)]+r,v);
      buffer+='</row>';
      if((i-start+1)%100===0){push(buffer);buffer='';onProgress(i+1,data.rows.length);await new Promise(resolve=>setTimeout(resolve,0));}
    }
    push(buffer+`</sheetData><autoFilter ref="A1:${letters.at(-1)}${end-start+1}"/></worksheet>`,true);
  }
  zip.end();if(failure)throw failure;
  const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}
  return result;
}
module.exports={workbook};
