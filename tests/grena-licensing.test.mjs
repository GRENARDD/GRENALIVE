import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {makeLicensing} from '../grena-licensing.mjs';

const setup=async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grena-license-'));
 const svc=await makeLicensing({cloud:true,dataDir:dir,readBody:async req=>req.body||'{}'});
 async function call(path,body,opts={}){
   const req={method:opts.method||(body?'POST':'GET'),body:JSON.stringify(body||{}),headers:{authorization:opts.token?'Bearer '+opts.token:undefined,'x-grena-admin-key':opts.admin||''},socket:{remoteAddress:'127.0.0.1'}};
   let response={status:0,body:null},res={writeHead(status){response.status=status},end(value){response.body=JSON.parse(value)}};
   assert.equal(await svc.handle(req,res,path),true);
   return response;
 }
 return {dir,svc,call};
};
test('código único, 30 días desde activación, registro y un solo uso',async()=>{
 const old=process.env.GRENA_LICENSE_ADMIN_KEY;
 process.env.GRENA_LICENSE_ADMIN_KEY='super-secret-admin-key-for-test-only-123456789';
 const {dir,call}=await setup();
 try{
   let reg=await call('/api/license/identity/register',{username:'sofia',displayName:'Sofia Live',email:'sofia@example.net',password:'una-clave-segura',deviceId:'DEVICE123456789012345678901234567890'});
   assert.equal(reg.status,201);
   assert.equal(reg.body.user.username,'sofia');
   assert.equal(reg.body.license,null);
   const t=reg.body.token;
   const unauth=await call('/api/license-admin/users',null);
   assert.equal(unauth.status,401);
   const adm=process.env.GRENA_LICENSE_ADMIN_KEY;
   const codes=await call('/api/license-admin/create',{count:2},{admin:adm});
   assert.equal(codes.status,201);assert.equal(codes.body.codes.length,2);assert.notEqual(codes.body.codes[0],codes.body.codes[1]);
   let result=await call('/api/license/redeem',{code:codes.body.codes[0],deviceId:'DEVICE123456789012345678901234567890'},{token:t});
   assert.equal(result.status,200);assert.equal(result.body.license.active,true);
   assert.equal(result.body.license.expiresAt-result.body.license.activatedAt,30*24*60*60*1000);
   result=await call('/api/license/redeem',{code:codes.body.codes[0],deviceId:'DEVICE123456789012345678901234567890'},{token:t});
   assert.equal(result.status,409);
   result=await call('/api/license/heartbeat',{deviceId:'DEVICE123456789012345678901234567890'},{token:t});
   assert.equal(result.status,200);assert.equal(result.body.user.online,true);
   let listing=await call('/api/license-admin/users',null,{admin:adm});
   assert.equal(listing.status,200);assert.equal(listing.body.online,1);assert.equal(listing.body.users.length,1);
   let revoke=await call('/api/license-admin/revoke',{userId:listing.body.users[0].id},{admin:adm});
   assert.equal(revoke.status,200);assert.equal(revoke.body.user.license.active,false);
   const json=JSON.parse(await readFile(join(dir,'grena-license-registry.json'),'utf8'));
   assert.ok(json.codes.every(c=>!('code' in c)));assert.ok(json.users.every(u=>!('password' in u)));
 }finally{if(old===undefined)delete process.env.GRENA_LICENSE_ADMIN_KEY;else process.env.GRENA_LICENSE_ADMIN_KEY=old;await rm(dir,{recursive:true,force:true})}
});
test('cuenta central sobrevive al reinicio y requiere contraseña correcta',async()=>{
 const {dir,call}=await setup();
 try{
   const reg=await call('/api/license/identity/register',{username:'carlos',email:'carlos@example.org',displayName:'Carlos',password:'mi-pass-correcta'});
   assert.equal(reg.status,201);
   const restarted=await makeLicensing({cloud:true,dataDir:dir,readBody:async req=>req.body||'{}'});
   const request=async password=>{
     let response={};
     await restarted.handle({method:'POST',body:JSON.stringify({username:'carlos',password}),socket:{remoteAddress:'127.0.0.1'},headers:{}},{writeHead(s){response.status=s},end(v){response.body=JSON.parse(v)}},'/api/license/identity/login');
     return response;
   };
   assert.equal((await request('incorrecta')).status,401);
   const login=await request('mi-pass-correcta');
   assert.equal(login.status,200);assert.ok(login.body.token);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('cliente local sincroniza GREÑA ID y permite activar/renovar sin tocar perfiles',async()=>{
 const old=process.env.GRENA_LICENSE_ADMIN_KEY;
 process.env.GRENA_LICENSE_ADMIN_KEY='super-secret-admin-key-for-test-only-123456789';
 const {dir,call}=await setup(),localDir=await mkdtemp(join(tmpdir(),'grena-device-'));
 const oldFetch=globalThis.fetch;
 try{
   const code=(await call('/api/license-admin/create',{count:1},{admin:process.env.GRENA_LICENSE_ADMIN_KEY})).body.codes[0];
   globalThis.fetch=async(url,opts)=>{
     const req={method:'POST',body:opts.body,headers:opts.headers,socket:{remoteAddress:'127.0.0.1'}};
     let status,content;
     await (await makeLicensing({cloud:true,dataDir:dir,readBody:async r=>r.body||'{}'})).handle(req,{writeHead(s){status=s},end(v){content=JSON.parse(v)}},new URL(url).pathname);
     return {ok:status<400,status,json:async()=>content};
   };
   const user={id:'profile-123',username:'creator',email:'creator@example.net',displayName:'Creator'};
   const local=await makeLicensing({cloud:false,dataDir:localDir,profileFile:(name,id)=>join(localDir,id,name),activeUser:()=>user,readBody:async req=>req.body||'{}',remoteUrl:'https://license.test'});
   await local.onLocalAuth(user,'clave-segura-creador');
   let response={},req={method:'POST',body:JSON.stringify({code}),headers:{}};
   await local.handle(req,{writeHead(s){response.status=s},end(v){response.body=JSON.parse(v)}},'/api/license/redeem');
   assert.equal(response.status,200);assert.equal(response.body.license.active,true);
   assert.equal(await local.canUse(user.id),true);
   await local.heartbeat(user.id);
   assert.equal((await local.getCached(user.id)).connected,true);
 }finally{globalThis.fetch=oldFetch;if(old===undefined)delete process.env.GRENA_LICENSE_ADMIN_KEY;else process.env.GRENA_LICENSE_ADMIN_KEY=old;await rm(dir,{recursive:true,force:true});await rm(localDir,{recursive:true,force:true})}
});
