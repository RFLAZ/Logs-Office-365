const {parseCSV, dateValue}=require('./converter');
const HEADERS=['Fecha (UTC)','Usuario','Acción','IP','Resultado','Aplicación o servicio','Recurso','ID del registro','Archivo de origen','Hoja de origen','Fila o registro de origen'];
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const ALIASES={
 date:['AuditData.CreationTime','CreationDate','CreationTime','CreatedDateTime','Date (UTC)','Created date time','Data (UTC)','Data','Date','Fecha (UTC)','Fecha','Timestamp'],
 user:['AuditData.UserId','UserId','User principal name','UserPrincipalName','Nome de Utilizador','Nombre de usuario','Usuario','Utilizador','User','AuditData.UserKey'],
 action:['AuditData.Operation','Operation','Activity','Action','Acción','Operación','Actividad'],
 ip:['AuditData.ClientIP','AuditData.ClientIPAddress','AuditData.ActorIpAddress','ClientIP','ClientIPAddress','IPAddress','IP address','Endereço IP','Dirección IP','IP'],
 result:['AuditData.ResultStatus','ResultStatus','Status','Estado','Resultado','Com êxito','Success'],
 app:['AuditData.Workload','AuditData.ApplicationDisplayName','AuditData.AppDisplayName','AppDisplayName','Application','Aplicação','Aplicación','Aplicación o servicio'],
 resource:['AuditData.ObjectId','AuditData.SourceFileName','ResourceDisplayName','Resource','Recurso'],
 id:['RecordId','AuditData.Id','Id','Request ID','ID do Pedido','CorrelationId','ID del registro']
};
const relevant=new Set(['AuditData',...Object.values(ALIASES).flat()].map(norm));
function relevantHeader(header){return relevant.has(norm(header));}
function eventFromRow(row,context={}) {
 const lookup=new Map([...row].map(([k,v])=>[norm(k),v]));
 let audit={};const raw=lookup.get('auditdata');
 if(typeof raw==='string')try{const obj=JSON.parse(raw);if(obj && typeof obj==='object' && !Array.isArray(obj))audit=obj;}catch{}
 const pick=kind=>{
  for(const name of ALIASES[kind]) {
   const key=name.startsWith('AuditData.')?name.slice(10):null;
   const value=key && audit[key]!==undefined?audit[key]:lookup.get(norm(name));
   if(value!==undefined && value!==null && String(value).trim()!=='' && typeof value!=='object')return value;
  }
  return '';
 };
 const rawDate=pick('date');let time=NaN;
 if(typeof rawDate==='number' && Number.isFinite(rawDate))time=Math.round((rawDate-(context.date1904?24107:25569))*86400000);
 else {
  let text=String(rawDate).trim();
  if(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d/.test(text) && !/(?:Z|[+-]\d\d:?\d\d)$/i.test(text))text=text.replace(' ','T')+'Z';
  time=dateValue(text);
 }
 let action=String(pick('action'));
 if(!action) {
  const file=norm(context.file || '');
  if(file.includes('authdetails') || lookup.has(norm('Método de autenticação')))action='Detalle de autenticación';
  else if(file.includes('noninteractive'))action='Inicio de sesión no interactivo';
  else if(file.includes('interactive'))action='Inicio de sesión interactivo';
  else if(lookup.has(norm('AppDisplayName')) || lookup.has(norm('Aplicação')))action='Inicio de sesión (tipo no especificado)';
 }
 return {time, values:[Number.isFinite(time)?new Date(time).toISOString():String(rawDate),String(pick('user')),action,String(pick('ip')),String(pick('result')),String(pick('app')),String(pick('resource')),String(pick('id')),context.file || '',context.sheet || '',context.row || '']};
}
function csvEvents(text,file) {
 const data=parseCSV(text);
 return data.rows.map((row,i)=>eventFromRow(row,{file,row:i+2}));
}
function activityReport(events) {
 const ordered=events.map((event,i)=>({...event,i}));
 ordered.sort((a,b)=>{
  const av=Number.isFinite(a.time),bv=Number.isFinite(b.time);
  return av && bv ? a.time-b.time || a.i-b.i : av!==bv ? av?-1:1 : a.i-b.i;
 });
 const users=new Map();const missing={user:0,ip:0,action:0,date:0};
 const rows=ordered.map(event=>{
  const v=event.values.slice();
  if(!v[1]){missing.user++;v[1]='No consta en el registro';}
  if(!v[2]){missing.action++;v[2]='No consta en el registro';}
  if(!v[3]){missing.ip++;v[3]='No consta en el registro';}
  if(!Number.isFinite(event.time))missing.date++;
  const key=event.values[1];
  if(!users.has(key))users.set(key,{name:v[1],count:0,actions:new Set(),ips:new Set(),first:'',last:''});
  const summary=users.get(key);summary.count++;
  if(event.values[2])summary.actions.add(event.values[2]);
  if(event.values[3])summary.ips.add(event.values[3]);
  if(Number.isFinite(event.time)){if(!summary.first)summary.first=v[0];summary.last=v[0];}
  return new Map(HEADERS.map((h,i)=>[h,v[i]]));
 });
 const summaryHeaders=['Usuario','Eventos','Acciones distintas','IP distintas','Primera fecha (UTC)','Última fecha (UTC)'];
 const summaryRows=[...users.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(u=>new Map(summaryHeaders.map((h,i)=>[h,[u.name,u.count,u.actions.size,u.ips.size,u.first,u.last][i]])));
 return {sheets:[{name:'Actividad',headers:HEADERS,rows},{name:'Resumen por usuario',headers:summaryHeaders,rows:summaryRows}],missing,events:rows.length,users:[...users.keys()].filter(Boolean).length};
}
function filterActivityEvents(events,{excludeUserLoginFailed=true}={}) {
 const included=excludeUserLoginFailed?events.filter(event=>String(event.values[2] || '').trim().toLowerCase()!=='userloginfailed'):events;
 return {events:included,inputCount:events.length,excluded:events.length-included.length,enabled:excludeUserLoginFailed};
}
function filterSummary(filter) {
 const headers=['Criterio','Valor'];
 const entries=[['Excluir UserLoginFailed',filter.enabled?'Sí':'No'],['Eventos de entrada',filter.inputCount],['UserLoginFailed excluidos',filter.excluded],['Eventos incluidos',filter.events.length]];
 return {name:'Resumen del análisis',headers,rows:entries.map(([criterion,value])=>new Map([[headers[0],criterion],[headers[1],value]]))};
}
module.exports={eventFromRow,csvEvents,activityReport,relevantHeader,filterActivityEvents,filterSummary};
