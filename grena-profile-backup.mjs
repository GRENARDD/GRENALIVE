// Capa de respaldo cifrado portable para futuras funciones de sincronización GREÑA ID.
// No exporta tokens OAuth ni claves Fish; no activa sincronización automáticamente.
import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
const allowed=new Set(['alert-designs.json','custom-alerts.json','social.json','afterglow-settings.json','auto-connect.json','chat-settings.json','counter-settings.json','loyalty.json','soundboard-settings.json','viewer-settings.json','widget-settings.json']);
const secret=/token|secret|password|api.?key|credential|oauth|authorization|private.?key/i;
const passCheck=x=>{if(typeof x!=='string'||x.length<12||x.length>1024)throw Error('Contraseña de respaldo inválida')};
const idCheck=x=>{if(typeof x!=='string'||!/^[a-zA-Z0-9_.-]{1,128}$/.test(x))throw Error('GREÑA ID inválido')};
function sanitize(value,depth=0){
 if(depth>16)throw Error('Configuración demasiado anidada');
 if(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return value;
 if(Array.isArray(value))return value.map(v=>sanitize(v,depth+1));
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw Error('Configuración inválida');
 const result=Object.create(null);
 for(const [k,v] of Object.entries(value))if(!secret.test(k)&&!['__proto__','constructor','prototype'].includes(k))result[k]=sanitize(v,depth+1);
 return result;
}
export function safeSettings(files){
 if(!files||typeof files!=='object'||Array.isArray(files))throw Error('Archivos inválidos');
 const out=Object.create(null);
 for(const [name,data] of Object.entries(files))if(allowed.has(name))out[name]=sanitize(data);
 return out;
}
function keyFor(pass,salt){return scryptSync(pass,salt,32,{N:16384,r:8,p:1,maxmem:64*1024*1024})}
function decode(s,len){
 if(typeof s!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('Respaldo inválido');
 const b=Buffer.from(s,'base64');if(len!==undefined&&b.length!==len)throw Error('Respaldo inválido');return b;
}
export function encryptProfileBackup({userId,passphrase,files}){
 idCheck(userId);passCheck(passphrase);
 const data=Buffer.from(JSON.stringify({format:'grena-profile',version:1,userId,files:safeSettings(files)}));
 if(data.length>2*1024*1024)throw Error('Respaldo demasiado grande');
 const salt=randomBytes(16),iv=randomBytes(12),key=keyFor(passphrase,salt);
 const cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(data),cipher.final()]),tag=cipher.getAuthTag();key.fill(0);
 return JSON.stringify({format:'grena-backup',version:1,kdf:'scrypt-N16384-r8-p1',cipher:'AES-256-GCM',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:tag.toString('base64'),data:encrypted.toString('base64')});
}
export function decryptProfileBackup({userId,passphrase,backup}){
 idCheck(userId);passCheck(passphrase);
 if(typeof backup!=='string'||backup.length>5*1024*1024)throw Error('Respaldo inválido');
 let b;try{b=JSON.parse(backup)}catch{throw Error('Respaldo inválido')}
 if(b?.format!=='grena-backup'||b.version!==1||b.cipher!=='AES-256-GCM'||b.kdf!=='scrypt-N16384-r8-p1')throw Error('Formato incompatible');
 const salt=decode(b.salt,16),iv=decode(b.iv,12),tag=decode(b.tag,16),encrypted=decode(b.data);
 if(encrypted.length>2*1024*1024+32)throw Error('Respaldo demasiado grande');
 const key=keyFor(passphrase,salt);let plain;
 try{const d=createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);plain=Buffer.concat([d.update(encrypted),d.final()])}
 catch{throw Error('Contraseña incorrecta o respaldo alterado')}finally{key.fill(0)}
 let data;try{data=JSON.parse(plain.toString('utf8'))}catch{throw Error('Respaldo inválido')}
 if(data?.format!=='grena-profile'||data.version!==1||data.userId!==userId)throw Error('El respaldo pertenece a otro GREÑA ID o versión');
 return safeSettings(data.files);
}
