#!/usr/bin/env node
// Respaldo portable cifrado de preferencias GREÑA Live. Ejecutar con GREÑA Live cerrado.
// No exporta credenciales de plataformas, tokens OAuth ni claves Fish Audio.
import {readFile,writeFile,rename,mkdir,stat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {encryptProfileBackup,decryptProfileBackup,safeSettings} from './grena-profile-backup.mjs';

const DATA_DIR=process.env.GRENA_DATA_DIR||join(process.env.APPDATA||join(homedir(),'AppData','Roaming'),'GREÑA LIVE PRO');
const names=['alert-designs.json','custom-alerts.json','social.json','afterglow-settings.json','auto-connect.json','chat-settings.json','counter-settings.json','loyalty.json','soundboard-settings.json','viewer-settings.json','widget-settings.json'];
const action=process.argv[2],file=process.argv[3];
if(!['export','import'].includes(action)||!file){
 console.error('Uso: node grena-backup-cli.mjs export|import ruta-de-respaldo.grena');
 process.exitCode=2;
}else{
 try{await main()}catch(e){console.error('No se pudo completar:',e.message);process.exitCode=1}
}
async function ask(question){
 const input=process.stdin;
 if(!input.isTTY||typeof input.setRawMode!=='function')throw Error('Utiliza una terminal interactiva para ingresar la contraseña sin mostrarla.');
 process.stdout.write(question);
 return await new Promise((resolve,reject)=>{
  let value='';
  const cleanup=()=>{input.off('data',onData);input.setRawMode(false);input.pause()};
  const onData=chunk=>{
   for(const char of chunk.toString('utf8')){
    if(char==='\\u0003'){cleanup();process.stdout.write('\\n');reject(Error('Cancelado'));return}
    if(char==='\\r'||char==='\\n'){cleanup();process.stdout.write('\\n');resolve(value);return}
    if(char==='\\u007f'||char==='\\b'){value=value.slice(0,-1);continue}
    if(char>=' '){value+=char;if(value.length>1024){cleanup();reject(Error('Contraseña demasiado larga'));return}}
   }
  };
  input.setRawMode(true);input.resume();input.on('data',onData);
 });
}
async function currentId(){
 const d=JSON.parse(await readFile(join(DATA_DIR,'active-profile.json'),'utf8'));
 const id=String(d.userId||'');
 if(!/^[A-Za-z0-9_.-]{1,128}$/.test(id))throw Error('Inicia sesión con tu GREÑA ID antes de crear o restaurar respaldos.');
 return id;
}
async function main(){
 const id=await currentId(),folder=join(DATA_DIR,'profiles',id);
 console.log('GREÑA ID:',id);
 console.log('Solo preferencias sin secretos: cuentas OAuth y Fish Audio requerirán reconexión.');
 console.log('Cierra GREÑA Live antes de continuar.');
 const passphrase=await ask('Contraseña de respaldo (mínimo 12 caracteres): ');
 if(action==='export'){
   const files=Object.create(null);
   for(const name of names){
     try{
       const source=join(folder,name);const info=await stat(source);
       if(info.size>1024*1024)continue;
       files[name]=JSON.parse(await readFile(source,'utf8'));
     }catch(e){if(e.code!=='ENOENT')console.warn('Omitido',name,':',e.message)}
   }
   if(Object.keys(files).length===0)throw Error('No hay preferencias locales para respaldar.');
   const payload=encryptProfileBackup({userId:id,passphrase,files});
   const destination=resolve(file);
   await mkdir(dirname(destination),{recursive:true});
   // wx impide reemplazar un respaldo válido por accidente.
   await writeFile(destination,payload,{encoding:'utf8',flag:'wx',mode:0o600});
   console.log('Respaldo cifrado creado:',destination);
 }else{
   const payload=await readFile(resolve(file),'utf8');
   const settings=decryptProfileBackup({userId:id,passphrase,backup:payload});
   const existing=[];
   for(const name of Object.keys(settings)){try{await stat(join(folder,name));existing.push(name)}catch(e){if(e.code!=='ENOENT')throw e}}
   if(existing.length)throw Error('Para proteger tus ajustes actuales, no se sobrescribe ninguno: '+existing.join(', ')+'. Restaura en un perfil vacío.');
   await mkdir(folder,{recursive:true});
   for(const [name,data] of Object.entries(safeSettings(settings))){
     const dst=join(folder,name),tmp=dst+'.'+randomBytes(5).toString('hex')+'.tmp';
     try{await writeFile(tmp,JSON.stringify(data,null,2),{flag:'wx',mode:0o600});await rename(tmp,dst)}
     finally{try{await import('node:fs/promises').then(fs=>fs.unlink(tmp))}catch{}}
   }
   console.log('Preferencias restauradas en GREÑA ID:',id);
 }
}
