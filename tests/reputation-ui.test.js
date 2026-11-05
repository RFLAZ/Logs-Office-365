const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkLauncher,reputationHint}=require('../src/reputation-ui');
test('opening HTML directly reports the launcher requirement without sending a key or request',async()=>{
 let calls=0;
 const state=await checkLauncher({protocol:'file:',hostname:'',fetcher:async()=>{calls++;}});
 assert.equal(state,'file');assert.equal(calls,0);
 assert.match(reputationHint({launcher:state,keyPresent:true,fileCount:1}),/iniciar-mac.command/);
});
test('a pasted key gives a next step, not a claim of authentication',()=>{
 assert.match(reputationHint({launcher:'ready',keyPresent:true,fileCount:0}),/selecciona un CSV o XLSX/);
 assert.match(reputationHint({launcher:'ready',keyPresent:true,fileCount:1}),/Pulsa «Generar informe y consultar IP»/);
 assert.match(reputationHint({launcher:'ready',keyPresent:true,fileCount:1}),/se comprobará al consultar/);
 assert.match(reputationHint({launcher:'ready',keyPresent:false,fileCount:1}),/Introduce tu clave/);
});
test('launcher detection requests only local status and handles missing or stopped services',async()=>{
 let call;
 const ready=await checkLauncher({protocol:'http:',hostname:'127.0.0.1',fetcher:async(url,options)=>{call={url,options};return {ok:true,json:async()=>({service:'office365-activity',reputation:true})};}});
 assert.equal(ready,'ready');assert.equal(call.url,'/api/status');assert.equal(call.options.body,undefined);
 const missing=await checkLauncher({protocol:'http:',hostname:'127.0.0.1',fetcher:async()=>{throw Error('stopped');}});
 assert.equal(missing,'unavailable');
 assert.match(reputationHint({launcher:missing,keyPresent:true,fileCount:1}),/Vuelve a abrir/);
});
