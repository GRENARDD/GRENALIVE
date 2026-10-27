import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import worker from '../cloudflare/licenses/src/worker.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const DAY=24*60*60*1000,ADMIN='grena-admin-testing-key-that-is-long-enough-123456789';
function mockD1(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../cloudflare/licenses/migrations/0001_init.sql',import.meta.url),'utf8'));
 const DB={
   prepare(sql){
     let values=[];
     const bound={
       bind(...args){values=args;return this},
       async first(){return sqlite.prepare(sql).get(...values)||null},
       async all(){return {results:sqlite.prepare(sql).all(...values)}},
       async run(){return {meta:{changes:sqlite.prepare(sql).run(...values).changes}}}
     };
     return bound;
   },
   async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result}catch(e){sqlite.exec('ROLLBACK');throw e}}
 };
 return {DB,close:()=>sqlite.close()};
}
async function request(env,path,body=null,{admin='',token='',method}={}){
 const headers=new Headers();if(body)headers.set('content-type','application/json');
 if(admin)headers.set('x-grena-admin-key',admin);
 if(token)headers.set('authorization','Bearer '+token);
 const result=await worker.fetch(new Request('https://license.test'+path,{method:method||(body?'POST':'GET'),headers,body:body?JSON.stringify(body):undefined}),env);
 return {status:result.status,data:await result.json()};
}
test('Cloudflare D1: 30, 60, 90 y días personalizados; renovación acumulada',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const deviceId='DEVICE123456789012345678901234567890';
   const reg=await request(env,'/api/license/identity/register',{username:'sofia',displayName:'Sofía',email:'sofia@example.org',password:'clave-fuerte-2026',deviceId});
   assert.equal(reg.status,201);assert.ok(reg.data.token);
   const tk=reg.data.token;
   assert.equal((await request(env,'/api/license-admin/users')).status,401);
   const noLicense=await request(env,'/api/license/heartbeat',{deviceId},{token:tk});
   assert.equal(noLicense.data.license,null);
   let lastExpiry=0;
   for(const days of [30,60,90,17]){
     const r=await request(env,'/api/license-admin/create',{count:1,days},{admin:ADMIN});
     assert.equal(r.status,201);assert.equal(r.data.days,days);assert.equal(r.data.codes.length,1);
     const code=r.data.codes[0];
     const activation=await request(env,'/api/license/redeem',{code,deviceId},{token:tk});
     assert.equal(activation.status,200);assert.equal(activation.data.license.active,true);
     if(lastExpiry)assert.equal(activation.data.license.expiresAt-lastExpiry,days*DAY);
     else assert.equal(activation.data.license.expiresAt-activation.data.license.activatedAt,days*DAY);
     lastExpiry=activation.data.license.expiresAt;
     assert.equal((await request(env,'/api/license/redeem',{code,deviceId},{token:tk})).status,409);
   }
   const list=await request(env,'/api/license-admin/users',null,{admin:ADMIN});
   assert.equal(list.status,200);assert.equal(list.data.total,1);assert.equal(list.data.online,1);
   assert.deepEqual(list.data.codes.map(x=>x.days).sort((a,b)=>a-b),[17,30,60,90]);
   const dbUser=DB.prepare('SELECT * FROM users WHERE username=?').bind('sofia');const user=await dbUser.first();
   assert.ok(user.password_hash&&!user.password_hash.includes('clave-fuerte'));
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM user_sessions WHERE token_hash=?').bind(tk).first()).n,0);
   const other=await request(env,'/api/license/heartbeat',{deviceId:'ANOTHER1234567890123456789012345'},{token:tk});
   assert.equal(other.status,200);assert.equal(other.data.license,null);
   assert.equal((await request(env,'/api/license-admin/revoke',{userId:user.id},{admin:ADMIN})).data.user.license.active,false);
 }finally{close()}
});
test('Cloudflare D1: valida límites de duración y protege las credenciales de administrador',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:60},{admin:'wrong'})).status,401);
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:0},{admin:ADMIN})).status,400);
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:3651},{admin:ADMIN})).status,400);
   assert.equal((await request(env,'/api/license-admin/create',{count:26,days:30},{admin:ADMIN})).status,400);
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:3650},{admin:ADMIN})).status,201);
   const list=await request(env,'/api/license-admin/users',null,{admin:ADMIN});
   assert.equal(list.data.codes.length,1);
   assert.ok(!('hash' in list.data.codes[0]));
 }finally{close()}
});
