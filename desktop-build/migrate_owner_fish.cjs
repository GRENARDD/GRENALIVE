// Run BEFORE replacing the old GREÑA installation:
// node desktop-build/migrate_owner_fish.cjs "C:\\ruta-al-programa-viejo\\chat-server.mjs"
// Finds the legacy base64 fallback in the old local program, never in GitHub.
'use strict';
const {readFile,access,readdir}=require('node:fs/promises');
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
async function findPreviousInstallation(){
 const rootFolders=[
   join(process.env.LOCALAPPDATA||'', 'Programs'),
   process.env.ProgramFiles||'',
   process.env['ProgramFiles(x86)']||'',
 ].filter(Boolean);
 for(const folder of rootFolders){
   let subfolders=[];try{subfolders=(await readdir(folder,{withFileTypes:true})).filter(x=>x.isDirectory()&&/gre(?:ñ|n)a|grefia/i.test(x.name)).map(x=>join(folder,x.name))}catch{}
   for(const dir of subfolders){
     for(const candidate of [join(dir,'resources','app','chat-server.mjs'),join(dir,'chat-server.mjs')]){
       try{await access(candidate);return candidate}catch{}
     }
   }
 }
 return null;
}
async function migrate(legacyPath,storageDir=dataDir()){
 if(process.platform!=='win32')throw Error('La migración protegida requiere Windows.');
 try{await access(join(storageDir,VAULT_FILE));throw Error('Ya existe una bóveda Fish Audio. No se sobrescribió nada.') }
 catch(error){if(error.code!=='ENOENT')throw error}
 // The configured environment keys take precedence over the old source fallback.
 // This matches the behavior of previous GREÑA Live releases.
 const envFirst=String(process.env.GRENA_FISH_API_KEY||'').trim();
 const envSecond=String(process.env.GRENA_FISH_API_KEY_2||'').trim();
 let first=validFishKey(envFirst)?envFirst:'';
 if(!first){
   const sourcePath=legacyPath?resolve(legacyPath):await findPreviousInstallation();
   if(!sourcePath)throw Error('No encontré una instalación anterior con Fish Audio. No se cambió nada; proporciona la ruta al antiguo chat-server.mjs o registra tus dos APIs en Administración.');
   const source=await readFile(sourcePath,'utf8');
   first=recoverOldKey(source);
 }
 if(envSecond&&!validFishKey(envSecond))throw Error('La segunda API del entorno tiene un formato inválido. No se ha migrado nada.');
 await storeOwnerFishKey(storageDir,1,first);
 if(envSecond)await storeOwnerFishKey(storageDir,2,envSecond);
 // Never print either key. A partial result cannot be reported as two protected keys.
 const stored=(await readFile(join(storageDir,VAULT_FILE),'utf8'));
 if(stored.includes(first)||(envSecond&&stored.includes(envSecond)))throw Error('La bóveda contiene texto sin cifrar; detén la actualización.');
 return {saved:envSecond?2:1,needsSecond:!envSecond};
}
if(require.main===module)migrate(process.argv[2]).then(info=>{
 console.log('GREÑA: '+info.saved+' API(s) protegidas con Windows DPAPI. '+(info.needsSecond?'FALTA CONFIRMAR LA API 2 antes de actualizar.':'Verifica ambas APIs en Administración antes de actualizar.'));
}).catch(error=>{console.error('Migración detenida: '+error.message);process.exitCode=1});
module.exports={recoverOldKey,migrate};
