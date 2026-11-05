const fs=require('node:fs');
const {zipSync}=require('fflate');
function pack(target,files) {
 const entries={};
 for(const [destination,source] of Object.entries(files))entries[destination]=destination.endsWith('.command')?[new Uint8Array(fs.readFileSync(source)),{os:3,attrs:0o100755<<16}]:new Uint8Array(fs.readFileSync(source));
 fs.writeFileSync(target,zipSync(entries,{level:6}));
 console.log(`${target}: ${Object.keys(entries).join(', ')}`);
}
pack('office365-conversor.zip',{'index.html':'dist/index.html','app.js':'dist/app.js','THIRD_PARTY_LICENSES.txt':'dist/THIRD_PARTY_LICENSES.txt','LEEME.md':'README.md'});
pack('office365-actividad.zip',{'index.html':'dist/actividad.html','activity-app.js':'dist/activity-app.js','THIRD_PARTY_LICENSES.txt':'dist/THIRD_PARTY_LICENSES.txt','LEEME.md':'ACTIVIDAD.md','iniciar_actividad.py':'local/iniciar_actividad.py','iniciar-mac.command':'local/iniciar-mac.command','iniciar-windows.bat':'local/iniciar-windows.bat'});
