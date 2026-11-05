const {parseIP}=require('./reputation');
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const LOCATION=['Ubicación','Localização','Localizacion','Location','LocationDetails','GeoLocation','AuditData.Location','AuditData.LocationDetails','AuditData.GeoLocation'];
const COUNTRY=['País','Pais','Country','CountryOrRegion','Country Code','CountryCode','País ou região','AuditData.ClientIPCountryCode','AuditData.CountryCode'];
const CITY=['City','Cidade','Ciudad'];
const STATE=['State','Province','StateOrProvince','State or province','Provincia','Região'];
const FIELDS=[...LOCATION,...COUNTRY,...CITY,...STATE,'Origen del país',...LOCATION.flatMap(prefix=>['city','state','country','countryOrRegion','countryCode','countryName'].map(field=>prefix+'.'+field))];
let displayNames;
const MISSING=/^(?:-|n\/a|unknown|no consta en el registro|no consta|not available)$/i;
const present=value=>value!==null && value!==undefined && String(value).trim()!=='' && !MISSING.test(String(value).trim());
function countryName(value) {
 if(!present(value))return '';
 const text=String(value).trim();
 if(/^(ZZ|XX)$/i.test(text))return '';
 if(/^[a-z]{2}$/i.test(text)){
  const code=text.toUpperCase();
  try{if(!displayNames)displayNames=new Intl.DisplayNames(['es'],{type:'region'});return displayNames.of(code) || code;}catch{return code;}
 }
 return text;
}
function decode(value) {
 let current=value;
 for(let i=0;i<4 && typeof current==='string' && /^[{[\"]/.test(current.trim());i++){
  try{current=JSON.parse(current);}catch{break;}
 }
 return current;
}
function geographyFromRow(lookup,audit={}) {
 const objects=new WeakMap();
 function raw(name) {
  const existing=lookup.get(norm(name));if(present(existing))return existing;
  if(!name.startsWith('AuditData.'))return '';
  let value=audit;
  for(const part of name.slice(10).split('.')){
   value=decode(value);
   if(!value || typeof value!=='object')return '';
   let fields=objects.get(value);if(!fields){fields=new Map(Object.entries(value).map(([k,v])=>[norm(k),v]));objects.set(value,fields);}
   if(!fields.has(norm(part)))return '';value=fields.get(norm(part));
  }
  return value;
 }
 function first(names) {for(const name of names){const value=raw(name);if(present(value) && typeof value!=='object')return String(value).trim();}return '';}
 let country=countryName(first(COUNTRY)),city=first(CITY),state=first(STATE),location='';
 for(const prefix of LOCATION){
  const decoded=decode(raw(prefix));
  if(decoded && typeof decoded==='object' && !Array.isArray(decoded)){
   const values=new Map(Object.entries(decoded).map(([k,v])=>[norm(k),v]));
   const get=names=>{for(const key of names){const value=values.get(norm(key));if(present(value) && typeof value!=='object')return String(value).trim();}return '';};
   city=city || get(['city']);state=state || get(['state','province']);
   country=country || countryName(get(['countryOrRegion','countryCode','country','countryName']));
  }else if(typeof decoded==='string' && present(decoded) && !/^[{[\"]/.test(decoded.trim()) && !location)location=decoded.trim();
  city=city || first([prefix+'.city']);state=state || first([prefix+'.state']);
  country=country || countryName(first(['countryOrRegion','countryCode','country','countryName'].map(k=>prefix+'.'+k)));
 }
 if(!location)location=[...new Set([city,state].filter(Boolean))].join(', ');
 if(!country && location){
  const parts=location.split(',').map(v=>v.trim());
  // Microsoft SignIns CSV: city, state/province, ISO country code.
  if(parts.length>=3 && /^[a-z]{2}$/i.test(parts.at(-1)))country=countryName(parts.at(-1));
 }
 const source=country?(first(['Origen del país']) || 'Registro'):'';
 return {location,country,countrySource:source};
}
function applyReputationCountries(report,reputation) {
 const countries=new Map();
 for(const row of reputation.rows){
  if(row.get('Estado de consulta')!=='Consultada')continue;
  const country=countryName(row.get('País'));if(country)countries.set(parseIP(row.get('IP')).ip,country);
 }
 let filled=0;
 const sheet=report.sheets.find(s=>s.name==='Actividad');
 if(!sheet)return filled;
 for(const row of sheet.rows){
  if(present(row.get('País')))continue;
  const ips=new Set(String(row.get('IP') || '').split(/[,;\s]+/).filter(Boolean).map(value=>parseIP(value)).filter(ip=>ip.isPublic).map(ip=>ip.ip));
  // Do not attribute one country to a row containing several different IPs.
  if(ips.size!==1)continue;
  const country=countries.get([...ips][0]);if(!country)continue;
  row.set('País',country);row.set('Origen del país','AbuseIPDB');filled++;
 }
 return filled;
}
module.exports={geographyFromRow,geographyHeaders:FIELDS,applyReputationCountries,countryName};
