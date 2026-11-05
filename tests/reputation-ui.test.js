const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reputationHint}=require('../src/reputation-ui');
test('key feedback only needs a key and file; no localhost, launcher or authentication request',()=>{
 assert.match(reputationHint({keyPresent:true,fileCount:0}),/selecciona un CSV o XLSX/);
 assert.match(reputationHint({keyPresent:true,fileCount:1}),/Pulsa «Generar informe y consultar IP»/);
 assert.match(reputationHint({keyPresent:true,fileCount:1}),/sin lanzadores/);
 assert.match(reputationHint({keyPresent:false,fileCount:1}),/Introduce tu clave/);
});
