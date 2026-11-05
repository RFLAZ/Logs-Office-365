const {test}=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('exceljs');
const Papa=require('papaparse');
const {prepare,workbook}=require('../src/converter');
test('UAL: nested JSON, arrays, Unicode, sorting and exact XLSX values',async()=>{
 const text=Papa.unparse([
 ['CreationDate','AuditData','UserId'],
 ['2026-10-29T10:00:00Z',JSON.stringify({Device:{Browser:'Edge'},Parameters:[{Name:'José',Value:'=1+1'}]}),'0001234567890123456789'],
 ['2026-10-22T10:00:00Z','{"Operation":"Login"}','ana@example.test']
 ]);
 const data=prepare(text);
 assert.equal(data.rows[0].get('UserId'),'ana@example.test');
 assert.equal(data.rows[1].get('AuditData.Parameters.0.Name'),'José');
 assert.ok(data.headers.includes('AuditData'));
 const book=new ExcelJS.Workbook();await book.xlsx.load(await workbook(data));
 const sheet=book.worksheets[0];
 const get=(name,row)=>sheet.getCell(row,data.headers.indexOf(name)+1);
 assert.equal(get('UserId',3).value,'0001234567890123456789');
 assert.equal(get('AuditData.Parameters.0.Value',3).value,'=1+1');
 assert.equal(get('AuditData.Parameters.0.Value',3).type,ExcelJS.ValueType.String);
 assert.equal(sheet.views[0].ySplit,1);
 assert.ok(sheet.autoFilter);
});
test('duplicate headers and delimiter detection preserve all fields',()=>{
 const data=prepare('Data;Tipo;Tipo;Tipo (2)\n23/10/2026;A;B;C\n22/10/2026;D;E;F');
 assert.equal(new Set(data.headers).size,4);
 assert.deepEqual([...data.rows[0].values()],['22/10/2026','D','E','F']);
});
test('malformed JSON and missing dates stay visible; invalid dates sort last',()=>{
 const data=prepare(Papa.unparse([['Data','AuditData'],['','{broken'],['23/10/2026','{}'],['22/10/2026','[]']]));
 assert.equal(data.invalidJSON,1);assert.equal(data.invalidDates,1);
 assert.equal(data.rows[2].get('AuditData'),'{broken');
});
test('malformed CSV fails rather than silently dropping fields',()=>{
 assert.throws(()=>prepare('A,B\n1,2,3'),/Fila 2/);
});
test('Excel cell length limit fails explicitly',async()=>{
 const data=prepare('A\n'+ 'x'.repeat(32768));
 await assert.rejects(workbook(data),/32.767/);
});
test('JSON field names cannot overwrite an original column',()=>{
 const data=prepare(Papa.unparse([['AuditData','AuditData.A'],['{"A":"expanded"}','original']]));
 assert.equal(data.rows[0].get('AuditData.A'),'original');
 assert.equal(data.rows[0].get('JSON.AuditData.A'),'expanded');
});
test('Excel re-exported UAL: unwrap records from first cell and empty columns',async()=>{
 const inner=Papa.unparse([['RecordId','CreationDate','AuditData'],['id-1','2026-10-23T12:00:00Z',JSON.stringify({Operation:'FileAccessed',Nested:{Name:'prueba;con,comas'}})]]);
 const lines=inner.split('\r\n');
 const outer=Papa.unparse(lines.map(line=>[line,'','']),{delimiter:';'});
 const data=prepare(outer);
 assert.equal(data.unwrapped,true);
 assert.equal(data.rows.length,1);
 assert.equal(data.rows[0].get('AuditData.Nested.Name'),'prueba;con,comas');
 assert.equal(data.dateColumn,'CreationDate');
 const book=new ExcelJS.Workbook();await book.xlsx.load(await workbook(data));
 assert.equal(book.worksheets[0].rowCount,2);
});
test('do not discard nonempty columns when UAL-looking header is present',()=>{
 const data=prepare(Papa.unparse([['RecordId,CreationDate,AuditData','Other'],['a,b,c','retain']],{delimiter:';',quotes:true}));
 assert.equal(data.unwrapped,false);
 assert.equal(data.rows[0].get('Other'),'retain');
});

test('re-exported UAL split at semicolons retains exact source cells',()=>{
 const header='RecordId,CreationDate,AuditData';
 const record=Papa.unparse([['id-1','2026-10-23T12:00:00Z',JSON.stringify({Name:'one;two'})]]);
 const cells=record.split(';');
 const outer=Papa.unparse([[header,''],cells],{delimiter:';',quotes:true});
 const data=prepare(outer);
 assert.equal(data.unwrapped,true);
 assert.equal(data.rows[0].get('AuditData.Name'),'one;two');
 assert.deepEqual(JSON.parse(data.rows[0].get('CSVOriginal.Celdas')),cells);
});
test('large wide UAL is split into bounded batches',()=>{
 const {batchSize}=require('../src/converter');
 assert.equal(batchSize({rows:{length:50000},headers:{length:1579}}),5000);
 assert.equal(batchSize({rows:{length:66},headers:{length:233}}),66);
});
test('sparse workbook preserves blank columns, numbers and false values',async()=>{
 const data={headers:['A','B','C','D'],rows:[new Map([['A','text'],['C',0],['D',false]])]};
 const book=new ExcelJS.Workbook();await book.xlsx.load(await workbook(data));
 assert.equal(book.worksheets[0].getCell('A2').value,'text');
 assert.equal(book.worksheets[0].getCell('B2').value,null);
 assert.equal(book.worksheets[0].getCell('C2').value,0);
 assert.equal(book.worksheets[0].getCell('D2').value,false);
});
