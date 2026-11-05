const {test}=require('node:test');
const assert=require('node:assert/strict');
const Papa=require('papaparse');
const ExcelJS=require('exceljs');
const {csvEvents,activityReport,eventFromRow}=require('../src/activity');
const {xlsxEvents}=require('../src/activity-reader');
const {applyReputationCountries}=require('../src/geography');
const {reputationSheet}=require('../src/reputation');
const {workbook}=require('../src/xlsx');
test('Portuguese SignIns location and country appear immediately after IP without an API call',async()=>{
 const events=csvEvents(Papa.unparse([['Data (UTC)','Nome de Utilizador','Endereço IP','Localização','Estado'],['23/10/2026 12:00:00','ana@example.test','8.8.8.8','Madrid, Comunidad de Madrid, ES','Éxito']]),'InteractiveSignIns.csv');
 assert.equal(events[0].geography.location,'Madrid, Comunidad de Madrid, ES');
 assert.equal(events[0].geography.country,'España');
 const report=activityReport(events);
 assert.deepEqual(report.sheets[0].headers.slice(3,8),['IP','Ubicación','País','Origen del país','Resultado']);
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(report)));
 assert.equal(book.worksheets[0].getCell('E2').value,'Madrid, Comunidad de Madrid, ES');
 assert.equal(book.worksheets[0].getCell('F2').value,'España');assert.equal(book.worksheets[0].getCell('G2').value,'Registro');
 assert.equal(book.worksheets[0].getCell('H2').value,'Éxito');
});
test('structured and nested encoded location fields are supported',()=>{
 const graph=eventFromRow(new Map([['Location',JSON.stringify({city:'Lisboa',state:'Lisboa',countryOrRegion:'PT'})]]));
 assert.deepEqual(graph.geography,{location:'Lisboa',country:'Portugal',countrySource:'Registro'});
 const audit=eventFromRow(new Map([['AuditData',JSON.stringify({Location:JSON.stringify({city:'Paris',state:'Île-de-France',countryOrRegion:'FR'})})]]));
 assert.equal(audit.geography.country,'Francia');assert.equal(audit.geography.location,'Paris, Île-de-France');
});
test('expanded XLSX geography columns and reimported country provenance are preserved',async()=>{
 const data={headers:['AuditData.Location.city','AuditData.Location.state','AuditData.Location.countryOrRegion','ClientIP'],rows:[new Map([['AuditData.Location.city','Madrid'],['AuditData.Location.state','Madrid'],['AuditData.Location.countryOrRegion','ES'],['ClientIP','8.8.8.8']])]};
 const events=await xlsxEvents(await workbook(data),'expanded.xlsx');
 assert.equal(events[0].geography.location,'Madrid');assert.equal(events[0].geography.country,'España');
 const report=activityReport([eventFromRow(new Map([['IP','8.8.8.8'],['País','España'],['Origen del país','AbuseIPDB']]))]);
 const reread=await xlsxEvents(await workbook({sheets:report.sheets}),'report.xlsx');
 assert.equal(reread[0].geography.countrySource,'AbuseIPDB');
});
test('AbuseIPDB fills only missing countries from successful existing queries; no extra calls',async()=>{
 const events=[eventFromRow(new Map([['IP','8.8.8.8'],['País','ES'],['Ubicación','Madrid']])),eventFromRow(new Map([['IP','8.8.8.8:443']])),eventFromRow(new Map([['IP','9.9.9.9']]))];
 const report=activityReport(events);let calls=0;
 const reputation=await reputationSheet(events,{key:'test',limit:1,fetcher:async()=>{calls++;return {ok:true,status:200,json:async()=>({data:{ipAddress:'8.8.8.8',countryCode:'US',abuseConfidenceScore:0}})};}});
 assert.equal(calls,1);assert.equal(applyReputationCountries(report,reputation),1);
 const rows=report.sheets[0].rows;
 assert.equal(rows[0].get('País'),'España');assert.equal(rows[0].get('Origen del país'),'Registro');
 assert.equal(rows[1].get('País'),'Estados Unidos');assert.equal(rows[1].get('Origen del país'),'AbuseIPDB');
 assert.equal(rows[1].get('Ubicación'),'No consta en el registro');
 assert.equal(rows[2].get('País'),'No consta en el registro');
 assert.equal(calls,1);
});
test('ambiguous locations, multiple IPs and failed queries do not invent a country',()=>{
 const event=eventFromRow(new Map([['Location','Example City, CA'],['IP','8.8.8.8, 1.1.1.1']]));
 assert.equal(event.geography.country,'');
 const report=activityReport([event,eventFromRow(new Map([['IP','9.9.9.9']]))]);
 const reputation={rows:[new Map([['IP','8.8.8.8'],['Estado de consulta','Consultada'],['País','ES']]),new Map([['IP','9.9.9.9'],['Estado de consulta','Error'],['País','FR']])]};
 assert.equal(applyReputationCountries(report,reputation),0);
 assert.ok(report.sheets[0].rows.every(r=>r.get('País')==='No consta en el registro'));
});
