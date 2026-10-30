'use strict';
// Per-GREÑA ID Windows DPAPI backup for the user's OWN Fish Audio key.
// Never use this file for the owner's two-account vault.
const {readFile,writeFile,rename,unlink,mkdir,chmod}=require('node:fs/promises');
const {dirname}=require('node:path');
const {randomBytes}=require('node:crypto');
const {protectOtherFishKey,unprotectOtherFishKey,validFishKey}=require('./fish-owner-vault.cjs');
function accountMatches(record,localUserId,centralUserId){
 return record?.version===1&&record.localUserId===String(localUserId||'')&&
        record.centralUserId===String(centralUserId||'')&&!!centralUserId;
}
async function readUserFishKey(path,localUserId,centralUserId){
 if(process.platform!=='win32'||!centralUserId)return null;
 let record;
 try{record=JSON.parse(await readFile(path,'utf8'))}
 catch(error){if(error.code==='ENOENT')return null;throw Error('No fue posible leer la bóveda Fish Audio de este perfil.')}
 if(!accountMatches(record,localUserId,centralUserId))return null;
 return unprotectOtherFishKey(record.ciphertext);
}
async function saveUserFishKey(path,localUserId,centralUserId,apiKey){
 if(process.platform!=='win32')throw Error('La copia cifrada de Fish Audio solo está disponible en Windows.');
 if(!centralUserId||!localUserId||!validFishKey(apiKey))throw Error('No se puede guardar la API sin GREÑA ID central verificado.');
 const ciphertext=await protectOtherFishKey(apiKey);
 const data={version:1,localUserId:String(localUserId),centralUserId:String(centralUserId),ciphertext,savedAt:Date.now()};
 await mkdir(dirname(path),{recursive:true});
 const tmp=path+'.'+randomBytes(6).toString('hex')+'.tmp';
 await writeFile(tmp,JSON.stringify(data),{encoding:'utf8',flag:'wx',mode:0o600});
 await rename(tmp,path);
 await chmod(path,0o600).catch(()=>{});
 return true;
}
async function deleteUserFishKey(path,localUserId,centralUserId){
 let record;
 try{record=JSON.parse(await readFile(path,'utf8'))}
 catch(error){if(error.code==='ENOENT')return false;throw Error('No se pudo comprobar la bóveda Fish Audio.')}
 if(!accountMatches(record,localUserId,centralUserId))return false;
 await unlink(path);
 return true;
}
module.exports={readUserFishKey,saveUserFishKey,deleteUserFishKey};
