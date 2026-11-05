const Papa = require('papaparse');
const {workbook} = require('./xlsx');
function uniqueHeaders(headers) {
  const used = new Set();
  return headers.map((header, i) => {
    const base = header.trim() || `Columna ${i + 1}`;
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base} (${suffix++})`;
    used.add(name); return name;
  });
}
function nestedJSON(value) {
  let current = value;
  for (let i = 0; i < 8 && typeof current === 'string'; i++) {
    const text = current.trim();
    if (!/^[{["]/.test(text)) return null;
    try { current = JSON.parse(text); } catch { return null; }
  }
  return current !== null && typeof current === 'object' ? current : null;
}
function flatten(value, prefix, result, depth = 0) {
  if (depth > 64) throw new Error('El JSON supera los 64 niveles de anidación admitidos. No se ha truncado el contenido.');
  const childPath = key => `${prefix}.${key.replace(/~/g, '~0').replace(/\./g, '~1')}`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) result.set(prefix, JSON.stringify(value));
    for (const [key, child] of entries) flatten(child, childPath(key), result, depth + 1);
  } else {
    result.set(prefix, value === null ? '' : value);
    if (typeof value === 'string') {
      const decoded = nestedJSON(value);
      // Preserve the encoded string at its existing path, and add its children.
      if (decoded !== null) for (const [key, child] of Object.entries(decoded)) {
        flatten(child, childPath(key), result, depth + 1);
      }
    }
  }
}
function parseCSV(text) {
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), {skipEmptyLines:'greedy'});
  const errors = parsed.errors.filter(error => error.code !== 'UndetectableDelimiter');
  if (errors.length) throw new Error(`CSV incorrecto: ${errors[0].message}`);
  if (parsed.data.length < 2) throw new Error('El CSV no contiene registros.');
  // Excel may re-save a complete comma-separated UAL record in its first
  // semicolon-separated cell, followed by empty spreadsheet columns.
  let records = parsed.data;
  let unwrapped = false;
  if (records[0].slice(1).every(value => value === '')) {
    const inner = Papa.parse(records[0][0], {delimiter: ','});
    if (!inner.errors.length && inner.data.length === 1 &&
        inner.data[0].includes('AuditData') && inner.data[0].includes('CreationDate')) {
      records = records.map((row, i) => {
        let end = row.length;
        while (end > 1 && row[end - 1] === '') end--;
        const nested = Papa.parse(row.slice(0, end).join(parsed.meta.delimiter), {delimiter: ','});
        if (nested.errors.length || nested.data.length !== 1 ||
            nested.data[0].length !== inner.data[0].length) {
          throw new Error(`Fila ${i + 1}: el registro UAL encapsulado no es un CSV válido.`);
        }
        return i === 0 ? [...nested.data[0], 'CSVOriginal.Celdas'] : [...nested.data[0], JSON.stringify(row)];
      });
      unwrapped = true;
    }
  }
  const headers = uniqueHeaders(records[0]);
  const rows = records.slice(1).map((values, i) => {
    if (values.length !== headers.length) throw new Error(`Fila ${i + 2}: ${values.length} campos; se esperaban ${headers.length}.`);
    return new Map(headers.map((key, j) => [key, values[j]]));
  });
  return {headers, rows, unwrapped};
}
function dateValue(value) {
  const s = String(value || '').trim();
  const local = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (local) {
    const [,d,m,y,h='0',min='0',sec='0']=local;
    const t=Date.UTC(+y,+m-1,+d,+h,+min,+sec), dt=new Date(t);
    return dt.getUTCDate()===+d && dt.getUTCMonth()===+m-1 ? t : NaN;
  }
  return /^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(s) ? Date.parse(s) : NaN;
}
function prepare(text, {expand=true, sort='asc', dateColumn=''}={}) {
  const data = parseCSV(text); let invalidJSON=0;
  const columns = new Set(data.headers);
  const jsonSources = new Set();
  if (expand) for (const row of data.rows) for (const header of data.headers) {
    if (data.unwrapped && header === 'CSVOriginal.Celdas') continue;
    const value = row.get(header).trim();
    if (!value.startsWith('{') && !value.startsWith('[')) continue;
    let obj;
    try { obj=JSON.parse(value); } catch { invalidJSON++; continue; }
    const expanded = new Map(); flatten(obj, header, expanded);
    jsonSources.add(header);
    for (const [key, val] of expanded) {
      // Original columns are preserved, including JSON and duplicate headers.
      let target=key;
      while (data.headers.includes(target)) target=`JSON.${target}`;
      row.set(target,val); columns.add(target);
      if (typeof val === 'string' && nestedJSON(val) !== null) jsonSources.add(target);
    }
  }
  const sourceHeaders = new Set(data.headers);
  const preferred = ['AuditData.CreationTime','AuditData.Operation','AuditData.UserId','AuditData.UserKey','AuditData.ClientIP','AuditData.Workload','AuditData.RecordType','AuditData.ResultStatus','AuditData.ObjectId'];
  const priority = new Map(preferred.map((h,i)=>[h,i]));
  const compare = (a,b) => (priority.get(a) ?? preferred.length) - (priority.get(b) ?? preferred.length) || a.localeCompare(b,'en',{numeric:true});
  // Keep expanded fields together and the raw JSON references at the far right.
  data.headers = [
    ...data.headers.filter(h => !jsonSources.has(h)),
    ...[...columns].filter(h => !sourceHeaders.has(h) && !jsonSources.has(h)).sort(compare),
    ...[...columns].filter(h => jsonSources.has(h)).sort(compare)
  ];
  const detected=data.headers.find(h=>/^(creationdate|creationtime|createddatetime|date|data(?: \(UTC\))?|fecha(?: y hora)?|date \(utc\)|created date time)$/i.test(h));
  if (dateColumn && !data.headers.includes(dateColumn)) throw new Error(`No existe la columna de fecha «${dateColumn}».`);
  const selected=dateColumn || detected;
  let invalidDates=0;
  if(sort!=='none' && selected) {
    const decorated=data.rows.map((row,i)=>{const date=dateValue(row.get(selected));if(!Number.isFinite(date))invalidDates++;return {row,i,date};});
    decorated.sort((a,b)=> {
      const av=Number.isFinite(a.date),bv=Number.isFinite(b.date);
      if(!av || !bv) return av===bv?a.i-b.i:av?-1:1;
      return (sort==='desc' ? b.date-a.date : a.date-b.date) || a.i-b.i;
    });
    data.rows=decorated.map(v=>v.row);
  }
  return {...data, invalidJSON, invalidDates, dateColumn:selected || ''};
}
module.exports={uniqueHeaders, parseCSV, prepare, workbook, dateValue};
