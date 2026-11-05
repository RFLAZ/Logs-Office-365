const ipaddr=require('ipaddr.js');
const HEADERS=['IP','Estado de consulta','Puntuación AbuseIPDB (0–100)','Informes','Informantes distintos','Último informe','País','ISP','Dominio','Tipo de uso','Lista blanca','Consulta (UTC)','Eventos','Usuarios distintos','Detalle'];
function parseIP(raw) {
 let text=raw.trim();
 const bracket=/^\[([^\]]+)\](?::\d{1,5})?$/.exec(text);
 if(bracket)text=bracket[1];
 else {const port=/^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(text);if(port)text=port[1];}
 try {
  if(text.includes('%'))throw new Error('scope');
  let address=ipaddr.parse(text);
  if(address.kind()==='ipv4' && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text))throw new Error('IPv4 format');
  if(address.kind()==='ipv6' && address.isIPv4MappedAddress())address=address.toIPv4Address();
  const ip=address.toString(),isPublic=address.range()==='unicast';
  return {ip,isPublic,reason:isPublic?'':'IP privada, reservada o no enrutable públicamente'};
 }catch{return {ip:raw,isPublic:false,reason:'Formato de IP no reconocido'};}
}
function collectIPs(events) {
 const ips=new Map();
 for(const event of events) {
  const seen=new Set();
  for(const raw of String(event.values[3] || '').split(/[,;\s]+/).filter(Boolean)) {
   const item=parseIP(raw);
   if(seen.has(item.ip))continue;seen.add(item.ip);
   if(!ips.has(item.ip))ips.set(item.ip,{...item,events:0,users:new Set()});
   const stored=ips.get(item.ip);stored.events++;if(event.values[1])stored.users.add(event.values[1]);
  }
 }
 return [...ips.values()].sort((a,b)=>a.ip.localeCompare(b.ip,'en',{numeric:true}));
}
function rowFor(item,state,detail='',data={},checked='') {
 const score=Number.isInteger(data.abuseConfidenceScore)&&data.abuseConfidenceScore>=0&&data.abuseConfidenceScore<=100?data.abuseConfidenceScore:'';
 const count=value=>Number.isInteger(value)&&value>=0?value:'';
 const values=[item.ip,state,score,count(data.totalReports),count(data.numDistinctUsers),data.lastReportedAt || '',data.countryName || data.countryCode || '',data.isp || '',data.domain || '',data.usageType || '',typeof data.isWhitelisted==='boolean'?data.isWhitelisted?'Sí':'No':'',checked,item.events,item.users.size,detail];
 return new Map(HEADERS.map((h,i)=>[h,values[i]]));
}
async function reputationSheet(events,{key,limit=100,maxAge=90,signal,fetcher=fetch,onProgress=()=>{}}) {
 if(!key || !key.trim())throw new Error('Introduce tu clave de AbuseIPDB para consultar la reputación.');
 if(!Number.isInteger(limit)||limit<1||limit>10000)throw new Error('El límite debe estar entre 1 y 10.000 consultas.');
 if(!Number.isInteger(maxAge)||maxAge<1||maxAge>365)throw new Error('El período debe estar entre 1 y 365 días.');
 const ips=collectIPs(events),rows=[];const publicCount=ips.filter(v=>v.isPublic).length;let attempted=0,success=0,stop='';
 for(let i=0;i<ips.length;i++) {
  const item=ips[i];
  if(!item.isPublic){rows.push(rowFor(item,'No consultada',item.reason));continue;}
  if(signal?.aborted)stop='Consultas canceladas por el usuario';
  if(!stop && attempted>=limit)stop='Límite de consultas de este informe alcanzado';
  if(stop){rows.push(rowFor(item,'No consultada',stop));continue;}
  attempted++;onProgress(attempted,Math.min(limit,publicCount));
  try {
   const query=new URLSearchParams({ipAddress:item.ip,maxAgeInDays:String(maxAge)});
   const response=await fetcher('https://api.abuseipdb.com/api/v2/check?'+query,{method:'GET',headers:{Key:key,Accept:'application/json'},credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal});
   let body;try{body=await response.json();}catch{body={};}
   if(!response.ok) {
    const reasons={401:'Clave API no válida',403:'Acceso a AbuseIPDB denegado',429:'Cuota de AbuseIPDB agotada o demasiadas peticiones'};
    stop=reasons[response.status] || 'No se pudo completar la consulta. Se detienen las peticiones restantes';
    rows.push(rowFor(item,'Error',stop));continue;
   }
   const data=body.data;
   if(!data || parseIP(String(data.ipAddress || '')).ip!==item.ip || !Number.isInteger(data.abuseConfidenceScore) || data.abuseConfidenceScore<0 || data.abuseConfidenceScore>100) {
    stop='Respuesta de AbuseIPDB no válida';rows.push(rowFor(item,'Error',stop));continue;
   }
   const checked=new Date().toISOString();success++;
   rows.push(rowFor(item,'Consultada',`Informes de los últimos ${maxAge} días`,data,checked));
   const remaining=response.headers?.get('X-RateLimit-Remaining');
   if(remaining!==null && remaining!==undefined && remaining.trim()!=='' && Number(remaining)===0)stop='Cuota restante de AbuseIPDB agotada';
  } catch(error) {
   stop=signal?.aborted || error.name==='AbortError'?'Consultas canceladas por el usuario':'El navegador no ha podido conectar directamente con AbuseIPDB. Puede ser un bloqueo CORS del proveedor o un problema de conexión o TLS. No se han usado intermediarios; las IP sin respuesta quedan sin puntuación.';
   rows.push(rowFor(item,signal?.aborted?'Cancelada':'Error',stop));
  }
 }
 return {name:'Reputación IP',headers:HEADERS,rows,attempted,success,unique:ips.length,stop};
}
module.exports={parseIP,collectIPs,reputationSheet};
