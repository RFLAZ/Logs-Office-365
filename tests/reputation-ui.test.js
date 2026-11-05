const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkLocalScript,reputationHint}=require('../src/reputation-ui');
test('HTML cannot launch a script: direct file mode gives the single Python command',async()=>{
 let calls=0;
 const state=await checkLocalScript({protocol:'file:',hostname:'',fetcher:async()=>{calls++;}});
 assert.equal(state,'file');assert.equal(calls,0);
 assert.match(reputationHint({launcher:state,keyPresent:true,fileCount:1}),/python3 iniciar.py/);
 assert.ok(!reputationHint({launcher:state,keyPresent:true,fileCount:1}).includes('.command'));
});
test('key feedback says which step is missing without claiming authentication',()=>{
 assert.match(reputationHint({launcher:'ready',keyPresent:true,fileCount:0}),/selecciona un CSV o XLSX/);
 assert.match(reputationHint({launcher:'ready',keyPresent:true,fileCount:1}),/Pulsa «Generar informe y consultar IP»/);
 assert.match(reputationHint({launcher:'ready',keyPresent:false,fileCount:1}),/Introduce tu clave/);
});
test('script detection sends no key and recognizes a stopped service',async()=>{
 let request;
 assert.equal(await checkLocalScript({protocol:'http:',hostname:'127.0.0.1',fetcher:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({service:'office365-activity',reputation:true})};}}),'ready');
 assert.equal(request.url,'/api/status');assert.equal(request.options.body,undefined);
 assert.equal(await checkLocalScript({protocol:'http:',hostname:'127.0.0.1',fetcher:async()=>{throw Error('stopped');}}),'unavailable');
});
