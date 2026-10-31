import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {makeLicensing} from '../grena-licensing.mjs';
const require=createRequire(import.meta.url);
const realVault=require('../fish-user-vault.cjs');
const keyA='fish-test-credential-user-alfa-not-real-123456',keyB='fish-test-credential-user-beta-not-real-654321';
const mockCloud=()=>{
 const secrets=new Map(),usernameByToken=new Map(),centralIds=new Map();
 let offline=false,acceptWrite=true;
 const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 const fetch=async(url,opts={})=>{
   if(offline)throw Error('Cloudflare desconectado');
   const path=new URL(url).pathname,tk=String(opts.headers?.authorization||'').replace('Bearer ','');
   const id=usernameByToken.get(tk);
   if(!id)return response(401,{ok:false,error:'Unrecognized token'});
   if(path==='/api/license/fish-credentials'&&opts.method==='POST'){
     const data=JSON.parse(opts.body||'{}');
     if(acceptWrite)secrets.set(id,data.apiKey);
     return response(200,{ok:true,configured:true});
   }
   if(path==='/api/license/fish-credentials'&&opts.method==='DELETE'){
     secrets.delete(id);return response(200,{ok:true,configured:false});
   }
   if(path==='/api/license/fish-credentials'||path==='/api/license/fish-credentials/consume')
     return response(200,{ok:true,configured:secrets.has(id),
       ...(path.endsWith('/consume')?{apiKey:secrets.get(id)||null}:{updatedAt:Date.now()})});
   throw Error('Unexpected cloud endpoint '+path);
 };
 return {secrets,centralIds,usernameByToken,fetch,setOffline(v){offline=v},setAcceptWrite(v){acceptWrite=v}};
};
function fakeVault(){
 const map=new Map(),key=(p,l,c)=>p+'|'+l+'|'+c;
 return {
   async readUserFishKey(path,local,central){return map.get(key(path,local,central))||null},
   async saveUserFishKey(path,local,central,k){map.set(key(path,local,central),k);return true},
   async deleteUserFishKey(path,local,central){return map.delete(key(path,local,central))}
 };
}
function request(method,body){
 return {method,body:JSON.stringify(body||{}),headers:{},socket:{remoteAddress:'127.0.0.1'}};
}
async function call(svc,path,method='GET',body={}){
 let status=0,data=null;
 await svc.handle(request(method,body),{writeHead(code){status=code},end(json){data=JSON.parse(json)}},path);
 return {status,data};
}
test('Fish backup is profile-isolated, cloud save is verified, and lost cloud keys can be restored without sharing owner APIs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grena-fish-user-test-')),originalFetch=globalThis.fetch;
 const cloud=mockCloud(),vault=fakeVault(),events=[],users=[
   {id:'local-user-a',username:'usera'}, {id:'local-user-b',username:'userb'}
 ];
 cloud.usernameByToken.set('A'.repeat(43),'central-a');
 cloud.usernameByToken.set('B'.repeat(43),'central-b');
 let current=users[0];
 const make=()=>makeLicensing({cloud:false,dataDir:dir,profileFile:(name,user)=>join(dir,'profiles',user,name),
   activeUser:()=>current,readBody:async req=>req.body,remoteUrl:'https://license.test',
   onFishCredentialsChanged:async id=>{events.push(id)},fishVault:vault});
 try{
   globalThis.fetch=cloud.fetch;
   let svc=await make();
   await svc.attachCentralSession(users[0].id,{token:'A'.repeat(43),user:{username:'usera',id:'central-a'}},'usera');
   await svc.attachCentralSession(users[1].id,{token:'B'.repeat(43),user:{username:'userb',id:'central-b'}},'userb');
   const saved=await call(svc,'/api/license/fish-credentials','POST',{apiKey:keyA});
   assert.equal(saved.status,200);assert.equal(saved.data.source,'cloud');
   assert.equal(saved.data.needsSync,false);
   assert.equal(events.at(-1),users[0].id);
   assert.equal((await call(svc,'/api/license/fish-credentials')).data.configured,true);
   assert.equal((await svc.getFishCredential(users[0].id)).apiKey,keyA);
   current=users[1];
   assert.equal((await svc.getFishCredential(users[1].id)).apiKey,null,'Never use user A Fish key in user B');
   assert.equal((await call(svc,'/api/license/fish-credentials','POST',{apiKey:keyB})).status,200);
   assert.equal((await svc.getFishCredential(users[1].id)).apiKey,keyB);
   current=users[0];
   cloud.secrets.delete('central-a'); // Cloud key unexpectedly missing.
   const localStatus=await call(svc,'/api/license/fish-credentials');
   assert.equal(localStatus.data.configured,true);
   assert.equal(localStatus.data.source,'device');
   assert.equal(localStatus.data.needsSync,true);
   assert.equal((await svc.getFishCredential(users[0].id)).apiKey,keyA,'TTS works using user own encrypted backup');
   svc=await make(); // Restart reads only the matching profile's backup.
   assert.equal((await svc.getFishCredential(users[0].id)).apiKey,keyA);
   const restored=await call(svc,'/api/license/fish-credentials/sync','POST',{});
   assert.equal(restored.status,200);assert.equal(restored.data.source,'cloud');
   assert.equal(cloud.secrets.get('central-a'),keyA);
   assert.equal((await call(svc,'/api/license/fish-credentials','DELETE',{})).data.configured,false);
   assert.equal((await svc.getFishCredential(users[0].id)).apiKey,null);
   current=users[1];
   assert.equal((await svc.getFishCredential(users[1].id)).apiKey,keyB,'Delete must not affect another account');
 }finally{globalThis.fetch=originalFetch;await rm(dir,{recursive:true,force:true})}
});
test('False-positive Cloudflare saves must never be described as cloud-synced',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grena-fish-false-save-')),orig=globalThis.fetch;
 const cloud=mockCloud(),vault=fakeVault(),user={id:'local-x',username:'userx'};
 cloud.usernameByToken.set('X'.repeat(43),'central-x');cloud.setAcceptWrite(false);
 try{
   globalThis.fetch=cloud.fetch;
   const svc=await makeLicensing({cloud:false,dataDir:dir,profileFile:(n,id)=>join(dir,id,n),
     activeUser:()=>user,readBody:async req=>req.body,remoteUrl:'https://license.test',fishVault:vault});
   await svc.attachCentralSession(user.id,{token:'X'.repeat(43),user:{username:'userx',id:'central-x'}},user.username);
   const result=await call(svc,'/api/license/fish-credentials','POST',{apiKey:keyA});
   assert.equal(result.status,503,'Never report an unverified D1 write as success');
   assert.equal(result.data.ok,false);
   assert.equal(result.data.savedLocally,true);
   assert.equal(result.data.needsSync,true);
   assert.equal((await svc.getFishCredential(user.id)).apiKey,keyA);
   cloud.setOffline(true);
   assert.equal((await svc.getFishCredential(user.id)).apiKey,keyA,'Offline Fish uses only that user local backup');
   assert.equal((await call(svc,'/api/license/fish-credentials')).data.source,'device');
 }finally{globalThis.fetch=orig;await rm(dir,{recursive:true,force:true})}
});
test('A newer Fish API pending locally never gets overwritten by an older cloud credential',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grena-fish-pending-old-')),orig=globalThis.fetch;
 const cloud=mockCloud(),vault=fakeVault(),user={id:'local-p',username:'userp'};
 cloud.usernameByToken.set('P'.repeat(43),'central-p');cloud.secrets.set('central-p',keyA);
 try{
  globalThis.fetch=cloud.fetch;
  const svc=await makeLicensing({cloud:false,dataDir:dir,profileFile:(n,id)=>join(dir,id,n),
    activeUser:()=>user,readBody:async req=>req.body,remoteUrl:'https://license.test',fishVault:vault});
  await svc.attachCentralSession(user.id,{token:'P'.repeat(43),user:{username:'userp',id:'central-p'}},user.username);
  cloud.setAcceptWrite(false);
  const denied=await call(svc,'/api/license/fish-credentials','POST',{apiKey:keyB});
  assert.equal(denied.status,503);
  assert.equal(cloud.secrets.get('central-p'),keyA);
  const status=await call(svc,'/api/license/fish-credentials');
  assert.equal(status.data.source,'device');assert.equal(status.data.needsSync,true);
  assert.equal(status.data.verified,false);
  assert.equal((await svc.getFishCredential(user.id)).apiKey,keyB,'Keep latest key for local TTS');
  const retryFailure=await call(svc,'/api/license/fish-credentials/sync','POST');
  assert.notEqual(retryFailure.status,200);
  cloud.setAcceptWrite(true);
  const restored=await call(svc,'/api/license/fish-credentials/sync','POST');
  assert.equal(restored.status,200);assert.equal(restored.data.verified,true);
  assert.equal(cloud.secrets.get('central-p'),keyB);
  assert.equal((await call(svc,'/api/license/fish-credentials')).data.source,'cloud');
  assert.equal((await svc.getFishCredential(user.id)).apiKey,keyB);
 }finally{globalThis.fetch=orig;await rm(dir,{recursive:true,force:true})}
});
test('Windows DPAPI backup survives restart, stores no plaintext, and rejects another GREÑA ID', {skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grena-dpapi-test-')),path=join(dir,'profiles','local-1','fish-user-credential.json');
 try{
   await realVault.saveUserFishKey(path,'local-1','central-a',keyA);
   const raw=await readFile(path,'utf8');
   assert.ok(!raw.includes(keyA));
   assert.equal(await realVault.readUserFishKey(path,'local-1','central-a'),keyA);
   assert.equal(await realVault.readUserFishKey(path,'local-1','central-b'),null);
   assert.equal(await realVault.readUserFishKey(path,'local-2','central-a'),null);
   assert.equal(await realVault.deleteUserFishKey(path,'local-1','central-a'),true);
   assert.equal(await realVault.readUserFishKey(path,'local-1','central-a'),null);
 }finally{await rm(dir,{recursive:true,force:true})}
});
