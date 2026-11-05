const fs=require('node:fs');
const {zipSync}=require('fflate');
function pack(target,files) {
 const entries={};
 for(const [destination,source] of Object.entries(files))entries[destination]=new Uint8Array(fs.readFileSync(source));
 fs.writeFileSync(target,zipSync(entries,{level:6}));
 console.log(`${target}: ${Object.keys(entries).join(', ')}`);
}
pack('office365-conversor.zip',{'index.html':'dist/index.html','app.js':'dist/app.js','THIRD_PARTY_LICENSES.txt':'dist/THIRD_PARTY_LICENSES.txt','LEEME.md':'README.md'});
pack('office365-actividad.zip',{'index.html':'dist/actividad.html','activity-app.js':'dist/activity-app.js','THIRD_PARTY_LICENSES.txt':'dist/THIRD_PARTY_LICENSES.txt','LEEME.md':'ACTIVIDAD.md'});
