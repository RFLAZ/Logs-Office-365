const {Unzip,UnzipInflate}=require('fflate');
const {SaxesParser}=require('saxes');
const {eventFromRow,relevantHeader}=require('./activity');
const local=name=>name.split(':').at(-1);
const unescape=s=>s.replace(/_x([0-9a-f]{4})_/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
function parser(handlers){const p=new SaxesParser();for(const [name,fn] of Object.entries(handlers))p.on(name,fn);return p;}
async function scan(bytes,select,onProgress=()=>{}) {
 let failure;
 const archive=new Unzip(file=>{
  const xml=select(file.name);if(!xml)return;
  const decoder=new TextDecoder('utf-8',{fatal:true});
  file.ondata=(error,chunk,final)=>{if(error){failure=error;return;}try{xml.write(decoder.decode(chunk,{stream:!final}));if(final)xml.close();}catch(e){failure=e;}};
  file.start();
 });
 archive.register(UnzipInflate);
 const step=262144;
 for(let i=0;i<bytes.length;i+=step){archive.push(bytes.subarray(i,i+step),i+step>=bytes.length);if(failure)throw failure;if(i%(step*8)===0){onProgress(Math.round(i/bytes.length*100));await new Promise(resolve=>setTimeout(resolve,0));}}
 if(failure)throw failure;
}
async function xlsxEvents(input,file,onProgress=()=>{}) {
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 const shared=[],sheets=[],rels=new Map();let date1904=false;let foundWorkbook=false;
 await scan(bytes,name=>{
  if(name==='xl/workbook.xml'){foundWorkbook=true;return parser({opentag:tag=>{const n=local(tag.name);if(n==='workbookPr')date1904=['1','true'].includes(tag.attributes.date1904);if(n==='sheet')sheets.push({name:tag.attributes.name,id:tag.attributes['r:id']});}});}
  if(name==='xl/_rels/workbook.xml.rels')return parser({opentag:tag=>{if(local(tag.name)==='Relationship' && tag.attributes.TargetMode!=='External')rels.set(tag.attributes.Id,tag.attributes.Target);}});
  if(name==='xl/sharedStrings.xml'){
   let inText=false,value='',phonetic=0;
   return parser({opentag:tag=>{const n=local(tag.name);if(n==='si')value='';if(n==='rPh')phonetic++;if(n==='t'&&!phonetic)inText=true;},text:text=>{if(inText)value+=text;},closetag:tag=>{const n=local(tag.name);if(n==='t')inText=false;if(n==='rPh')phonetic--;if(n==='si')shared.push(unescape(value));}});
  }
 },p=>onProgress('Leyendo estructura XLSX',p));
 if(!foundWorkbook || !sheets.length)throw new Error('El archivo no es un XLSX válido o no contiene hojas.');
 const records=sheets.filter(s=>/^Registros(?:\s|$)/i.test(s.name));
 const chosen=records.length?records:sheets.filter(s=>!/^Resumen/i.test(s.name));
 const paths=new Map();
 for(const s of chosen){let target=rels.get(s.id);if(!target)continue;target=target.startsWith('/')?target.slice(1):'xl/'+target;const parts=[];for(const part of target.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}paths.set(parts.join('/'),s.name);}
 const events=[];let usable=0;
 await scan(bytes,name=>{
  if(!paths.has(name))return;
  let headers=null,cells=new Map(),cell=null,inText=false,inValue=false,phonetic=0,rowNumber=0;
  return parser({opentag:tag=>{
   const n=local(tag.name);
   if(n==='row'){cells=new Map();rowNumber=Number(tag.attributes.r)||rowNumber+1;}
   if(n==='c'){cell={ref:(tag.attributes.r||'').replace(/\d/g,''),type:tag.attributes.t,text:'',value:''};}
   if(n==='rPh')phonetic++;
   if(n==='t'&&!phonetic)inText=true;
   if(n==='v')inValue=true;
  },text:text=>{if(cell){if(inText)cell.text+=text;if(inValue)cell.value+=text;}},closetag:tag=>{
   const n=local(tag.name);
   if(n==='t')inText=false;if(n==='v')inValue=false;if(n==='rPh')phonetic--;
   if(n==='c'&&cell){
    if(!headers || relevantHeader(headers.get(cell.ref)||'')){
     let value=cell.type==='inlineStr'?unescape(cell.text):cell.type==='s'?shared[Number(cell.value)]:cell.type==='b'?cell.value==='1':cell.type==='str'?unescape(cell.value):cell.type==='e'?'':cell.value===''?'':Number(cell.value);
     if(cell.type==='d')value=cell.value;
     // Cached formula results can be read, but formulas are never evaluated.
     if(value!==undefined && value!=='')cells.set(cell.ref,value);
    }
    cell=null;
   }
   if(n==='row'&&cells.size){
    if(!headers){headers=new Map([...cells].map(([col,value])=>[col,String(value)]));if([...headers.values()].some(relevantHeader))usable++;else headers=new Map();}
    else if(headers.size){const row=new Map([...cells].map(([col,value])=>[headers.get(col),value]));events.push(eventFromRow(row,{file,sheet:paths.get(name),row:rowNumber,date1904}));}
   }
  }});
 },p=>onProgress('Leyendo registros XLSX',p));
 if(!usable || !events.length)throw new Error('No se encontraron registros con cabeceras reconocibles de Office 365.');
 return events;
}
module.exports={xlsxEvents};
