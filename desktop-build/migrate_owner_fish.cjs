// Run BEFORE replacing the old GREÑA installation:
// node desktop-build/migrate_owner_fish.cjs "C:\\ruta-al-programa-viejo\\chat-server.mjs"
// Finds the legacy base64 fallback in the old local program, never in GitHub.
'use strict';
const {readFile,access}=require('node:fs/promises');
const {join,resolve}=require('node:path');
const {homedir}=require('node:os');
const {storeOwnerFishKey,VAULT_FILE,validFishKey}=require('../fish-owner-vault.cjs');
const dataDir=()=>process.env.GRENA_DATA_DIR||join(process.env.APPDATA||join(homedir(),'AppData','Roaming'),'GREÑA LIVE PRO');
function recoverOldKey(source){
 const matched=/FISH_AUDIO_API_KEY_1\s*=\s*process\.env\.GRENA_FISH_API_KEY\s*\|\|\s*Buffer\.from\('([A-Za-z0-9+/=]+)'\s*,\s*'base64'\)/.exec(source);
 if(!matched)throw Error('No encontré la configuración antigua Fish Audio en ese archivo. No se ha cambiado nada.');
 const key=Buffer.from(matched[1],'base64').toString('utf8').trim();
 if(!validFishKey(key))throw Error('La clave de la instalación anterior no tiene un formato válido.');
 return key;
}
async function migrate(legacyPath,storageDir=dataDir()){
 if(process.platform!=='win32')throw Error('La migración protegida requiere Windows.');
 if(!legacyPath)throw Error('Indica la ruta de chat-server.mjs de la instalación ANTERIOR.');
 try{await access(join(storageDir,VAULT_FILE));throw Error('Ya existe una bóveda Fish Audio. No se sobrescribió nada.') }
 catch(error){if(error.code!=='ENOENT')throw error}
 const source=await readFile(resolve(legacyPath),'utf8');
 const first=recoverOldKey(source);
 const second=String(process.env.GRENA_FISH_API_KEY_2||'').trim();
 await storeOwnerFishKey(storageDir,1,first);
 if(second && validFishKey(second))await storeOwnerFishKey(storageDir,2,second);
 // Do not display, log or write either plaintext key.
 return {saved:second&&validFishKey(second)?2:1};
}
if(require.main===module)migrate(process.argv[2]).then(info=>{
 console.log('GREÑA: '+info.saved+' API(s) protegidas con Windows DPAPI. Verifica el estado en Administración antes de actualizar.');
}).catch(error=>{console.error('Migración detenida: '+error.message);process.exitCode=1});
module.exports={recoverOldKey,migrate};
