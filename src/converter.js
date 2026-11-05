const Papa = require('papaparse');
const ExcelJS = require('exceljs');
const MAX_ROWS = 1048575;
function uniqueHeaders(headers) {
  const used = new Set();
  return headers.map((header, i) => {
    const base = header.trim() || `Columna ${i + 1}`;
    let name = base, suffix = 2;
    while (used.has(name)) name = `${base} (${suffix++})`;
    used.add(name); return name;
  });
}
function flatten(value, prefix, result) {
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) result.set(prefix, JSON.stringify(value));
    for (const [key, child] of entries) flatten(child, `${prefix}.${key.replace(/~/g, '~0').replace(/\./g, '~1')}`, result);
  } else result.set(prefix, value === null ? '' : value);
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
  if (expand) for (const row of data.rows) for (const header of data.headers) {
    if (data.unwrapped && header === 'CSVOriginal.Celdas') continue;
    const value = row.get(header).trim();
    if (!value.startsWith('{') && !value.startsWith('[')) continue;
    let obj;
    try { obj=JSON.parse(value); } catch { invalidJSON++; continue; }
    const expanded = new Map(); flatten(obj, header, expanded);
    for (const [key, val] of expanded) {
      // Original columns are preserved, including JSON and duplicate headers.
      let target=key;
      while (data.headers.includes(target)) target=`JSON.${target}`;
      row.set(target,val); columns.add(target);
    }
  }
  data.headers=[...columns];
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
async function workbook(data) {
  if(data.headers.length>16384) throw new Error('La expansión supera las 16.384 columnas de Excel. Reduce la expansión JSON.');
  const book=new ExcelJS.Workbook(); book.creator='Conversor local Office 365';
  for(let offset=0;offset<data.rows.length;offset+=MAX_ROWS) {
    const sheet=book.addWorksheet(`Registros ${Math.floor(offset/MAX_ROWS)+1}`);
    sheet.addRow(data.headers);
    sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF173F50'}};
    sheet.views=[{state:'frozen',ySplit:1}];
    sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:data.headers.length}};
    const indexes = new Map(data.headers.map((header, i) => [header, i + 1]));
    for(const row of data.rows.slice(offset,offset+MAX_ROWS)) {
      const target = sheet.addRow([]);
      // A wide UAL is sparse: never allocate cells for absent JSON fields.
      for (const [header, value] of row) {
        if (value === '' || value === null || value === undefined) continue;
        if(typeof value==='string' && value.length>32767) throw new Error(`La columna «${header}» contiene una celda de más de 32.767 caracteres. Excel no puede conservarla completa.`);
        target.getCell(indexes.get(header)).value = value;
      }
    }
    sheet.columns.forEach((col,i)=>{col.width=Math.min(48,Math.max(18,data.headers[i].length+2));});
  }
  return book.xlsx.writeBuffer();
}
function batchSize(data) {
  return data.rows.length * data.headers.length > 5000000 ? 5000 : data.rows.length;
}
module.exports={uniqueHeaders, parseCSV, prepare, workbook, dateValue, batchSize};
