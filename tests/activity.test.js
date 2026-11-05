const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const Papa=require('papaparse');
const {csvEvents,activityReport,eventFromRow}=require('../src/activity');
const {xlsxEvents}=require('../src/activity-reader');
const {workbook}=require('../src/xlsx');
function source(){return Papa.unparse([['RecordId','CreationDate','UserId','Operation','AuditData'],['id2','2026-10-23T12:00:00Z','fallback@example.test','Fallback',JSON.stringify({CreationTime:'2026-10-23T12:00:00Z',UserId:'ana@example.test',Operation:'FileAccessed',ClientIP:'192.0.2.1',ResultStatus:'Succeeded'})],['id1','2026-10-22T12:00:00Z','ana@example.test','Login',JSON.stringify({ClientIP:'2001:db8::1'})]]);}
test('activity prioritizes AuditData fields, sorts globally and summarizes each user',async()=>{
 const report=activityReport(csvEvents(source(),'ual.csv'));
 assert.equal(report.events,2);assert.equal(report.users,1);
 const rows=report.sheets[0].rows;
 assert.equal(rows[0].get('Acción'),'Login');
 assert.equal(rows[1].get('Acción'),'FileAccessed');
 assert.equal(rows[0].get('IP'),'2001:db8::1');
 assert.equal(rows[1].get('Archivo de origen'),'ual.csv');
 assert.equal(rows[1].get('Fila o registro de origen'),2);
 const summary=report.sheets[1].rows[0];
 assert.equal(summary.get('Eventos'),2);assert.equal(summary.get('IP distintas'),2);
 assert.equal(summary.get('Acciones distintas'),2);
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(report)));
 assert.deepEqual(book.worksheets.map(s=>s.name),['Actividad','Resumen por usuario']);
 assert.equal(book.worksheets[0].rowCount,3);assert.equal(book.worksheets[1].getCell('B2').value,2);
});
test('XLSX reader supports sparse inline XML from the original converter',async()=>{
 const data={headers:['RecordId','CreationDate','AuditData','Unused'],rows:[new Map([['RecordId','x'],['CreationDate','2026-01-01T00:00:00Z'],['AuditData',JSON.stringify({UserId:'ana@example.test',Operation:'Login',ClientIP:'192.0.2.9'})]])]};
 const events=await xlsxEvents(await workbook(data),'original.xlsx');
 assert.equal(events.length,1);assert.equal(events[0].values[1],'ana@example.test');
 assert.equal(events[0].values[2],'Login');assert.equal(events[0].values[3],'192.0.2.9');
 assert.equal(events[0].values[9],'Registros 1');
});
test('XLSX reader supports shared strings, numeric dates, multiple record sheets and ignores summary',async()=>{
 const book=new ExcelJS.Workbook();
 for(const name of ['Registros 1','Registros 2']){
  const sheet=book.addWorksheet(name);sheet.addRow(['CreationDate','UserId','Operation','ClientIP']);sheet.addRow([45946,'josé@example.test','=not_a_formula','192.0.2.1']);
 }
 const summary=book.addWorksheet('Resumen por usuario');summary.addRow(['UserId']);summary.addRow(['do-not-count']);
 const events=await xlsxEvents(await book.xlsx.writeBuffer(),'input.xlsx');
 assert.equal(events.length,2);assert.equal(events[0].values[0],'2025-10-16T00:00:00.000Z');
 assert.equal(events[0].values[1],'josé@example.test');
 assert.equal(events[0].values[2],'=not_a_formula');
});
test('Portuguese SignIns and AuthDetails retain missing identity and IP honestly',()=>{
 const signin=eventFromRow(new Map([['Data (UTC)','23/10/2026 12:30:00'],['Nome de Utilizador','ana@example.test'],['Endereço IP','192.0.2.1'],['Estado','Success']]),{file:'NonInteractiveSignIns.csv'});
 assert.equal(signin.values[2],'Inicio de sesión no interactivo');
 assert.equal(signin.values[0],'2026-10-23T12:30:00.000Z');
 const auth=csvEvents(Papa.unparse([['ID do Pedido','Data','Método de autenticação'],['id','23/10/2026 12:30:00','Password']]),'AuthDetails.csv');
 const report=activityReport(auth);assert.equal(report.events,1);assert.equal(report.users,0);assert.equal(report.missing.ip,1);assert.equal(report.missing.user,1);
});
test('unknown dates sort last, equal times are stable and no events are deduplicated',()=>{
 const e=csvEvents(Papa.unparse([['CreationDate','UserId','Operation'],['','x','No date'],['2026-01-01T01:00:00+01:00','x','First'],['2026-01-01T00:00:00Z','x','Second']]),'a.csv');
 const report=activityReport(e);
 assert.deepEqual(report.sheets[0].rows.map(r=>r.get('Acción')),['First','Second','No date']);assert.equal(report.missing.date,1);
});
test('empty or unrecognized XLSX fails with a useful error',async()=>{
 const b=new ExcelJS.Workbook();b.addWorksheet('Sheet1').addRow(['Other']);
 await assert.rejects(xlsxEvents(await b.xlsx.writeBuffer(),'empty.xlsx'),/registros/);
});
