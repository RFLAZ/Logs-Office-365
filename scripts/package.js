const fs=require('node:fs');
const {zipSync}=require('fflate');
function pack(target,files) {
 const entries={};
 for(const [destination,source] of Object.entries(files))entries[destination]=new Uint8Array(fs.readFileSync(source));
 fs.writeFileSync(target,zipSync(entries,{level:6}));
 console.log(`${target}: ${Object.keys(entries).join(', ')}`);
}
pack('office365-conversor.zip',{'index.html':'dist/index.html','app.js':'dist/app.js','THIRD_PARTY_LICENSES.txt':'dist/THIRD_PARTY_LICENSES.txt','LEEME.md':'README.md'});
const embedded={};
for(const [name,path] of Object.entries({'index.html':'dist/actividad.html','activity-app.js':'dist/activity-app.js','THIRD_PARTY_LICENSES.txt':'dist/THIRD_PARTY_LICENSES.txt'}))embedded[name]=new Uint8Array(fs.readFileSync(path));
const template=fs.readFileSync('local/iniciar.py','utf8');
const encoded=Buffer.from(zipSync(embedded,{level:6})).toString('base64');
fs.writeFileSync('iniciar.py',template.replace('__ASSETS_ZIP_BASE64__',encoded));
pack('office365-actividad.zip',{'index.html':'dist/actividad.html','activity-app.js':'dist/activity-app.js','THIRD_PARTY_LICENSES.txt':'dist/THIRD_PARTY_LICENSES.txt','LEEME.md':'ACTIVIDAD.md','iniciar.py':'iniciar.py'});
