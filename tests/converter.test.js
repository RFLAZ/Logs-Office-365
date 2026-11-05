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
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(data)));
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
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(data)));
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
test('sparse workbook preserves blank columns, numbers and false values',async()=>{
 const data={headers:['A','B','C','D'],rows:[new Map([['A','text'],['C',0],['D',false]])]};
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(data)));
 assert.equal(book.worksheets[0].getCell('A2').value,'text');
 assert.equal(book.worksheets[0].getCell('B2').value,null);
 assert.equal(book.worksheets[0].getCell('C2').value,0);
 assert.equal(book.worksheets[0].getCell('D2').value,false);
});
test('incremental XLSX preserves XML symbols and line breaks',async()=>{
 const value='  <tag> & "texto"\r\nJosé  ';
 const data={headers:['Texto'],rows:[new Map([['Texto',value]])]};
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(data)));
 assert.equal(book.worksheets[0].getCell('A2').value,value);
});

test('literal Excel escape sequences are escaped in the worksheet XML',async()=>{
 const {unzipSync,strFromU8}=require('fflate');
 const data={headers:['Text'],rows:[new Map([['Text','_x0041_']])]};
 const files=unzipSync(await workbook(data));
 assert.ok(strFromU8(files['xl/worksheets/sheet1.xml']).includes('_x005F_x0041_'));
});
test('UAL JSON encoded inside strings expands recursively and preserves originals',async()=>{
 const old=JSON.stringify({settings:{enabled:false}});
 const inner=JSON.stringify({Rules:[{Name:'Regla',Value:JSON.stringify({Scope:'local',Codes:[1,2]})}]});
 const audit={ActivityParameters:inner,ModifiedProperties:[{Name:'Settings',OldValue:old,NewValue:'["uno","dos"]'}]};
 const data=prepare(Papa.unparse([['CreationDate','AuditData'],['2026-10-23T12:00:00Z',JSON.stringify(audit)]]));
 const row=data.rows[0];
 assert.equal(row.get('AuditData.ActivityParameters'),inner);
 assert.equal(row.get('AuditData.ActivityParameters.Rules.0.Value.Scope'),'local');
 assert.equal(row.get('AuditData.ActivityParameters.Rules.0.Value.Codes.1'),2);
 assert.equal(row.get('AuditData.ModifiedProperties.0.OldValue'),old);
 assert.equal(row.get('AuditData.ModifiedProperties.0.OldValue.settings.enabled'),false);
 assert.equal(row.get('AuditData.ModifiedProperties.0.NewValue.1'),'dos');
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(data)));
 const col=data.headers.indexOf('AuditData.ActivityParameters.Rules.0.Value.Scope')+1;
 assert.equal(book.worksheets[0].getCell(2,col).value,'local');
});
test('JSON-like text remains unchanged and multiply encoded objects expand',()=>{
 const data=prepare(Papa.unparse([['AuditData'],[JSON.stringify({Text:'[ordinary text]',Empty:'{}',Encoded:JSON.stringify(JSON.stringify({Name:'ok'}))})]]));
 assert.equal(data.rows[0].get('AuditData.Text'),'[ordinary text]');
 assert.equal(data.rows[0].get('AuditData.Empty'),'{}');
 assert.equal(data.rows[0].get('AuditData.Encoded.Name'),'ok');
});
test('expanded JSON columns are grouped before raw JSON reference columns',async()=>{
 const inner=JSON.stringify({Z:'last',A:'first'});
 const data=prepare(Papa.unparse([['RecordId','AuditData'],['id',JSON.stringify({Nested:inner,Operation:'Login',ClientIP:'192.0.2.1',CreationTime:'2026-01-01T00:00:00Z'})]]));
 assert.equal(data.headers[0],'RecordId');
 assert.equal(data.headers[1],'AuditData.CreationTime');
 assert.ok(data.headers.indexOf('AuditData.Nested.A')<data.headers.indexOf('AuditData.Nested.Z'));
 for(const h of ['AuditData','AuditData.Nested'])assert.ok(data.headers.indexOf(h)>data.headers.indexOf('AuditData.Nested.Z'));
 const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await workbook(data)));
 assert.equal(book.worksheets[0].getCell(2,data.headers.indexOf('AuditData.Nested.A')+1).value,'first');
});
