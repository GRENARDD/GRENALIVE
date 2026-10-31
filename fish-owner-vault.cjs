// GREÑA owner-only Fish Audio vault. DPAPI CurrentUser keeps keys bound to the Windows
// account and outside the installer, source code, git and browser storage.
'use strict';
const {spawn}=require('node:child_process');
const {readFile,writeFile,mkdir,rename,chmod}=require('node:fs/promises');
const {join,dirname}=require('node:path');
const {randomBytes}=require('node:crypto');
const VAULT_FILE='owner-fish-vault.json';
const PS_SCRIPT = String.raw`
$ErrorActionPreference='Stop'
# Powershell's type resolver doesn't autoload System.Security on bare runners.
[void][System.Reflection.Assembly]::LoadWithPartialName('System.Security')
$request=[Console]::In.ReadToEnd() | ConvertFrom-Json
$result=@()
foreach($item in @($request.keys)){
 if([string]::IsNullOrWhiteSpace([string]$item)){ $result+= ''; continue }
 if($request.operation -eq 'protect'){
   $raw=[System.Text.Encoding]::UTF8.GetBytes([string]$item)
   $bytes=[System.Security.Cryptography.ProtectedData]::Protect($raw,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
   [Array]::Clear($raw,0,$raw.Length)
   $result+=[Convert]::ToBase64String($bytes)
 }elseif($request.operation -eq 'unprotect'){
   $bytes=[Convert]::FromBase64String([string]$item)
   $raw=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
   $result+=[System.Text.Encoding]::UTF8.GetString($raw)
   [Array]::Clear($raw,0,$raw.Length)
 }else{throw 'Invalid operation'}
}
@{keys=@($result)} | ConvertTo-Json -Compress -Depth 4
`;
function validFishKey(key){return typeof key==='string' && key.length>=20 && key.length<=512 && /^[\x21-\x7e]+$/.test(key)}
async function crypt(operation,keys){
 if(process.platform!=='win32')throw Error('La bóveda local Fish Audio requiere Windows DPAPI.');
 return new Promise((resolve,reject)=>{
  const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',PS_SCRIPT],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',error='',finished=false,timeoutHit=false;
  // GitHub Actions windows-latest may delay fresh PowerShell processes under
  // parallel Node tests. Keep the owner's desktop timeout unchanged (12 s).
  // Never bypass DPAPI or store either Fish key in plaintext.
  const timeoutMs=process.env.CI==='true'?45000:12000;
  const timer=setTimeout(()=>{timeoutHit=true;child.kill();},timeoutMs);
  child.stdout.on('data',b=>{output+=b.toString('utf8');if(output.length>15000)child.kill()});
  child.stderr.on('data',b=>{error+=b.toString('utf8').slice(0,300)});
  child.on('error',finishError);
  child.on('close',code=>{
   clearTimeout(timer);
   if(finished)return;finished=true;
   if(code!==0)return reject(Error('No se pudo abrir la bóveda protegida de Windows.'+(process.env.CI==='true'?' Diagnóstico CI: '+(timeoutHit?'PowerShell excedió '+timeoutMs+' ms. ':'')+String(error).slice(0,800).replace(/sk-fish-[A-Za-z0-9_-]+/gi,'[redacted]'):'')));
   try{
    const parsed=JSON.parse(output);
    if(!Array.isArray(parsed.keys)||parsed.keys.length!==keys.length)throw Error('bad response');
    resolve(parsed.keys);
   }catch{reject(Error('La bóveda respondió un formato no válido.'))}
  });
  function finishError(){clearTimeout(timer);if(finished)return;finished=true;reject(Error('PowerShell no está disponible para proteger las APIs.'))}
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify({operation,keys}));
 });
}
async function vaultRead(dataDir){
 let record;try{record=JSON.parse(await readFile(join(dataDir,VAULT_FILE),'utf8'))}catch(e){if(e.code==='ENOENT')return [];throw Error('No se pudo abrir la bóveda Fish Audio.')}
 if(record.version!==1||!Array.isArray(record.keys)||record.keys.length>2)throw Error('La bóveda Fish Audio tiene un formato no válido.');
 const keys=await crypt('unprotect',record.keys);
 if(keys.some(k=>k!==''&&!validFishKey(k)))throw Error('La bóveda contiene una clave Fish Audio no válida.');
 return keys;
}
// Shared, stable array so a verified owner's automatic migration becomes available
// immediately to the running GREÑA server, without reopening it or rerunning CMD.
const activeOwnerFishKeys=[];
async function readOwnerFishKeys(dataDir){
 const local=process.platform==='win32'?await vaultRead(dataDir):[];
 const env=[String(process.env.GRENA_FISH_API_KEY||'').trim(),String(process.env.GRENA_FISH_API_KEY_2||'').trim()];
 // A key explicitly configured in the owner's Windows vault must win over
 // a legacy environment key. Otherwise the UI says a new key was saved but
 // Fish still sends the old environment key and receives HTTP 401.
 // Environment credentials remain a fallback for installations without vault.
 const next=[0,1].map(i=>local[i]||env[i]||'');
 activeOwnerFishKeys.splice(0,activeOwnerFishKeys.length,...next);
 return activeOwnerFishKeys;
}
async function storeOwnerFishKey(dataDir,index,apiKey){
 if(process.platform!=='win32')throw Error('Este almacenamiento seguro solo está disponible en GREÑA Desktop para Windows.');
 if(!Number.isInteger(index)||index<1||index>2||!validFishKey(apiKey))throw Error('Introduce una API Fish Audio válida.');
 const keys=await vaultRead(dataDir);
 while(keys.length<2)keys.push('');
 keys[index-1]=apiKey;
 const encrypted=await crypt('protect',keys);
 const dest=join(dataDir,VAULT_FILE);
 await mkdir(dirname(dest),{recursive:true});
 const temp=dest+'.'+randomBytes(6).toString('hex')+'.tmp';
 await writeFile(temp,JSON.stringify({version:1,keys:encrypted,updatedAt:Date.now()}),{encoding:'utf8',mode:0o600,flag:'wx'});
 await rename(temp,dest);
 await chmod(dest,0o600).catch(()=>{});
 return keys.filter(Boolean).length;
}
// DPAPI helpers for independent per-user Fish vaults. The owner's two-slot
// vault file, format, and read/write behavior remain unchanged.
async function protectOtherFishKey(apiKey){
 if(!validFishKey(apiKey))throw Error('API Fish Audio no válida.');
 return (await crypt('protect',[apiKey]))[0];
}
async function unprotectOtherFishKey(ciphertext){
 if(typeof ciphertext!=='string'||ciphertext.length<24||ciphertext.length>8192)throw Error('Bóveda de usuario no válida.');
 const key=(await crypt('unprotect',[ciphertext]))[0];
 if(!validFishKey(key))throw Error('API Fish Audio guardada no válida.');
 return key;
}
module.exports={readOwnerFishKeys,storeOwnerFishKey,validFishKey,VAULT_FILE,protectOtherFishKey,unprotectOtherFishKey};
