const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseIP,collectIPs,reputationSheet}=require('../src/reputation');
const {workbook}=require('../src/xlsx');
const ExcelJS=require('exceljs');
const event=(ip,user='ana@example.test')=>({values:['',user,'Login',ip]});
const ok=(ip,score=25,remaining=10)=>({ok:true,status:200,headers:{get:name=>name==='X-RateLimit-Remaining'?String(remaining):null},json:async()=>({data:{ipAddress:ip,abuseConfidenceScore:score,totalReports:7,numDistinctUsers:3,isp:'Example',countryCode:'ES',isWhitelisted:false},remaining})});
test('IPv4, IPv6, ports and mapped addresses normalize without querying local ranges',()=>{
 assert.equal(parseIP('8.8.8.8:443').ip,'8.8.8.8');
 assert.equal(parseIP('[2606:4700:4700::1111]:443').ip,'2606:4700:4700::1111');
 assert.equal(parseIP('::ffff:8.8.8.8').ip,'8.8.8.8');
 for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.1','169.254.1.2','100.64.1.1','192.0.2.1','224.0.0.1','::1','fe80::1','2001:db8::1','unknown','0x08080808'])assert.equal(parseIP(ip).isPublic,false,ip);
});
test('one request per unique public IP; no log records or user identifiers sent',async()=>{
 const calls=[];
 const events=[event('8.8.8.8'),event('8.8.8.8:443','bob@example.test'),event('::ffff:8.8.8.8'),event('10.0.0.1')];
 const ips=collectIPs(events);assert.equal(ips.find(i=>i.ip==='8.8.8.8').events,3);
 const sheet=await reputationSheet(events,{key:'test-key',fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return ok('8.8.8.8');}});
 assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/abuseipdb/check');
 assert.deepEqual(Object.keys(calls[0].body).sort(),['apiKey','ipAddress','maxAgeInDays']);
 assert.equal(sheet.success,1);assert.equal(sheet.rows.length,2);
 const privateRow=sheet.rows.find(r=>r.get('IP')==='10.0.0.1');
 assert.equal(privateRow.get('Estado de consulta'),'No consultada');assert.equal(privateRow.get('Puntuación AbuseIPDB (0–100)'),'');
 assert.ok(!JSON.stringify([...sheet.rows.map(r=>[...r])]).includes('test-key'));
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook({sheets:[sheet]})));
 assert.equal(book.worksheets[0].name,'Reputación IP');
});
test('report limit and provider quota stop remaining queries without inventing scores',async()=>{
 let calls=0;
 const sheet=await reputationSheet([event('1.1.1.1'),event('8.8.8.8')],{key:'test',limit:1,fetcher:async()=>{calls++;return ok('1.1.1.1',0);}});
 assert.equal(calls,1);assert.equal(sheet.rows[0].get('Puntuación AbuseIPDB (0–100)'),0);
 assert.equal(sheet.rows[1].get('Estado de consulta'),'No consultada');
 const quota=await reputationSheet([event('1.1.1.1'),event('8.8.8.8')],{key:'test',fetcher:async()=>ok('1.1.1.1',0,0)});
 assert.equal(quota.attempted,1);assert.equal(quota.success,1);
});
test('401 and 429 stop further requests and preserve all IP rows',async()=>{
 for(const status of [401,429]){
  let calls=0;const sheet=await reputationSheet([event('1.1.1.1'),event('8.8.8.8')],{key:'test',fetcher:async()=>{calls++;return {ok:false,status,json:async()=>({})};}});
  assert.equal(calls,1);assert.equal(sheet.rows.length,2);assert.equal(sheet.rows[0].get('Estado de consulta'),'Error');assert.equal(sheet.rows[1].get('Estado de consulta'),'No consultada');
 }
});
test('cancellation, network failures and malformed results retain an honest report',async()=>{
 const controller=new AbortController();controller.abort();
 const cancelled=await reputationSheet([event('8.8.8.8')],{key:'test',signal:controller.signal,fetcher:()=>{throw Error('must not fetch');}});
 assert.equal(cancelled.attempted,0);assert.equal(cancelled.rows[0].get('Estado de consulta'),'No consultada');
 const broken=await reputationSheet([event('8.8.8.8')],{key:'test',fetcher:async()=>({ok:true,json:async()=>({data:{ipAddress:'8.8.8.8'}})})});
 assert.equal(broken.success,0);assert.equal(broken.rows[0].get('Puntuación AbuseIPDB (0–100)'),'');
 const network=await reputationSheet([event('8.8.8.8')],{key:'test',fetcher:async()=>{throw Error('network');}});
 assert.equal(network.rows[0].get('Estado de consulta'),'Error');
 assert.match(network.rows[0].get('Detalle'),/script local/);
 assert.equal(network.rows[0].get('Puntuación AbuseIPDB (0–100)'),'');
});

test('TLS verification errors preserve the safe diagnostic code, without a score',async()=>{
 const sheet=await reputationSheet([event('8.8.8.8')],{key:'test',fetcher:async()=>({ok:false,status:502,json:async()=>({code:'TLS_ERROR',verifyCode:20})})});
 assert.equal(sheet.success,0);assert.match(sheet.rows[0].get('Detalle'),/Código de verificación TLS: 20/);
 assert.equal(sheet.rows[0].get('Puntuación AbuseIPDB (0–100)'),'');
});
test('SignIns reputation has one row per IP and original Estado, with one API lookup per IP',async()=>{
 const {csvEvents,activityReport}=require('../src/activity');
 const {xlsxEvents}=require('../src/activity-reader');
 const Papa=require('papaparse');
 const input=Papa.unparse([['Data (UTC)','Nome de Utilizador','Estado','Endereço IP'],['23/10/2026 12:00:00','a@example.test','Êxito','8.8.8.8'],['23/10/2026 12:01:00','b@example.test','Êxito','8.8.8.8:443'],['23/10/2026 12:02:00','a@example.test','Êxito','8.8.8.8'],['23/10/2026 12:03:00','a@example.test','Falha','8.8.8.8'],['23/10/2026 12:04:00','b@example.test','Interrompido','8.8.8.8']]);
 const events=csvEvents(input,'InteractiveSignIns.csv');let calls=0;
 const query=async()=>{calls++;return ok('8.8.8.8');};
 const sheet=await reputationSheet(events,{key:'test',fetcher:query});
 assert.equal(calls,1);assert.equal(sheet.unique,1);assert.equal(sheet.success,1);assert.equal(sheet.rows.length,3);
 const success=sheet.rows.find(r=>r.get('Estado de conexión')==='Êxito');
 assert.equal(success.get('Conexión satisfactoria'),'Sí');assert.equal(success.get('Eventos'),3);assert.equal(success.get('Usuarios distintos'),2);
 for(const state of ['Falha','Interrompido']){const row=sheet.rows.find(r=>r.get('Estado de conexión')===state);assert.equal(row.get('Conexión satisfactoria'),'No');assert.equal(row.get('Eventos'),1);}
 assert.ok(sheet.rows.every(r=>r.get('Puntuación AbuseIPDB (0–100)')===25));
 const excel=new ExcelJS.Workbook();await excel.xlsx.load(Buffer.from(await workbook({sheets:[sheet]})));
 assert.equal(excel.worksheets[0].getCell('C2').value,'Sí');assert.ok(excel.worksheets[0].autoFilter);
 const report=activityReport(events);
 const reread=await xlsxEvents(await workbook(report),'actividad.xlsx');
 const fromXlsx=await reputationSheet(reread,{key:'test',fetcher:query});
 assert.equal(calls,2);assert.deepEqual(fromXlsx.rows.map(r=>[r.get('Estado de conexión'),r.get('Conexión satisfactoria'),r.get('Eventos')]),sheet.rows.map(r=>[r.get('Estado de conexión'),r.get('Conexión satisfactoria'),r.get('Eventos')]));
});
test('unknown SignIns states and non-SignIns events are not declared successful connections',()=>{
 const {eventFromRow}=require('../src/activity');const {connectionStatus}=require('../src/reputation');
 const status=(value)=>eventFromRow(new Map([['Estado',value],['IP','8.8.8.8']]),{file:'NonInteractiveSignIns.csv'});
 for(const value of ['Éxito','Success','Succeeded','Sucesso'])assert.equal(connectionStatus(status(value)).successful,'Sí');
 for(const value of ['Error','Failure','Falha','Interrupted'])assert.equal(connectionStatus(status(value)).successful,'No');
 assert.equal(connectionStatus(status('Pending')).successful,'No determinado');
 assert.equal(connectionStatus(status('')).state,'No consta en el registro');
 const ual=eventFromRow(new Map([['Operation','FileAccessed'],['ResultStatus','Success'],['IP','8.8.8.8']]),{file:'UAL.csv'});
 assert.equal(connectionStatus(ual).successful,'No aplica');
 const detail=eventFromRow(new Map([['Com êxito','true'],['IP','8.8.8.8']]),{file:'NonInteractiveSignIns_AuthDetails.csv'});
 assert.equal(connectionStatus(detail).successful,'No aplica');
});
test('lookup failures preserve each original connection outcome and leave reputation scores empty',async()=>{
 const {eventFromRow}=require('../src/activity');
 const events=['Success','Failure'].map(state=>eventFromRow(new Map([['Estado',state],['IP','8.8.8.8']]),{file:'SignIns.csv'}));
 let calls=0;
 const sheet=await reputationSheet(events,{key:'test',fetcher:async()=>{calls++;return {ok:false,status:401,json:async()=>({})};}});
 assert.equal(calls,1);assert.equal(sheet.rows.length,2);
 assert.ok(sheet.rows.every(r=>r.get('Estado de consulta')==='Error' && r.get('Puntuación AbuseIPDB (0–100)')===''));
 assert.deepEqual(sheet.rows.map(r=>r.get('Conexión satisfactoria')),['Sí','No']);
});
