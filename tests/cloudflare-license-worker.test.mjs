import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import worker,{PBKDF2_ITERATIONS} from '../cloudflare/licenses/src/worker.mjs';

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
       async first(){if(!/^\s*(SELECT|PRAGMA)/i.test(sql))throw Error('D1: first() requires a read query');return sqlite.prepare(sql).get(...values)||null},
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
test('Workerd producción: el costo PBKDF2 no supera el límite de 100.000 iteraciones',()=>{
 assert.equal(PBKDF2_ITERATIONS,100000);
});
test('Fish Audio: cada GREÑA ID vincula, cambia y quita únicamente su propia API cifrada',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN,FISH_CREDENTIALS_KEY:Buffer.alloc(32,7).toString('base64')};
 const secretYaqui='sk-fish-yaqui-test-not-real-0987654321',secretOther='sk-fish-other-test-not-real-1234567890';
 try{
   const owner=(await request(env,'/api/license/identity/register',{username:'grena_rd',email:'grena@example.test',password:'safe-owner-password'})).data;
   const yaqui=(await request(env,'/api/license/identity/register',{username:'yaqui_gr',email:'yaqui@example.test',password:'safe-yaqui-password'})).data;
   const other=(await request(env,'/api/license/identity/register',{username:'sofia',email:'sofia2@example.test',password:'safe-sofia-password'})).data;
   assert.equal((await request(env,'/api/license/owner/claim',{}, {token:owner.token,admin:ADMIN})).status,200);
   assert.equal((await request(env,'/api/license-admin/fish-credentials',{username:'yaqui_gr',action:'set',apiKey:secretYaqui},{token:yaqui.token})).status,403,'Solo propietario puede asignar');
   assert.equal((await request(env,'/api/license-admin/fish-credentials',{username:'grena_rd',action:'set',apiKey:secretYaqui},{token:owner.token})).status,409,'No tocar las APIs del propietario');
   const assigned=await request(env,'/api/license-admin/fish-credentials',{username:'yaqui_gr',action:'set',apiKey:secretYaqui},{token:owner.token});
   assert.equal(assigned.status,200);
   assert.equal(assigned.data.configured,true);
   assert.equal(assigned.data.verified,true);
   assert.ok(!JSON.stringify(assigned.data).includes(secretYaqui),'El administrador no recibe la API de vuelta');
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:yaqui.token})).data.apiKey,secretYaqui);
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:other.token})).data.apiKey,null,'No compartir API entre usuarios');
   const audit=await DB.prepare('SELECT target_user_id,action FROM fish_admin_audit WHERE target_user_id=?').bind(yaqui.user.id).first();
   assert.equal(audit.action,'set');

   const saved=await request(env,'/api/license/fish-credentials',{apiKey:secretYaqui},{token:yaqui.token});
   assert.equal(saved.status,200);
   assert.equal(saved.data.configured,true);
   assert.ok(!JSON.stringify(saved.data).includes(secretYaqui));
   const record=await DB.prepare('SELECT cipher_text,nonce FROM fish_credentials WHERE user_id=?').bind(yaqui.user.id).first();
   assert.ok(record?.cipher_text && record?.nonce);
   assert.ok(!record.cipher_text.includes(secretYaqui),'No se guarda API de texto plano');
   const listing=await request(env,'/api/license-admin/users',null,{token:owner.token});
   assert.equal(listing.data.users.find(x=>x.username==='yaqui_gr').fishConfigured,true);
   assert.equal((await request(env,'/api/license/fish-credentials',null,{token:yaqui.token})).data.configured,true);
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:yaqui.token})).data.apiKey,secretYaqui);
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:other.token})).data.apiKey,null);
   assert.equal((await request(env,'/api/license/fish-credentials',{apiKey:secretOther},{token:other.token})).status,200);
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:other.token})).data.apiKey,secretOther);
   const changed=await request(env,'/api/license/fish-credentials',{apiKey:secretOther},{token:yaqui.token});
   assert.equal(changed.status,200);
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:yaqui.token})).data.apiKey,secretOther);
   assert.equal((await request(env,'/api/license/fish-credentials',null,{token:yaqui.token,method:'DELETE'})).status,200);
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:yaqui.token})).data.apiKey,null);
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:other.token})).data.apiKey,secretOther);
   const noSecretEnv={DB,ADMIN_KEY:ADMIN};
   assert.equal((await request(noSecretEnv,'/api/license/fish-credentials',{apiKey:secretYaqui},{token:yaqui.token})).status,503);
   const adminNoSecret=await request(noSecretEnv,'/api/license-admin/fish-credentials',{username:'sofia',action:'set',apiKey:secretYaqui},{token:owner.token});
   assert.equal(adminNoSecret.status,503,'Admin must not falsely claim save without encryption secret');
   assert.equal((await request(env,'/api/license/fish-credentials/consume',null,{token:other.token})).data.apiKey,secretOther,'No secret provisioning failure may corrupt existing user key');
 }finally{close()}
});

test('GitHub Actions: cuentas de prueba no aparecen en usuarios ni alteran las licencias visibles',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const owner=(await request(env,'/api/license/identity/register',{username:'grena_rd',email:'owner@grena.test',password:'safe-owner-password'})).data;
   const yaqui=await request(env,'/api/license/identity/register',{username:'yaqui_gr',email:'yaqui@grena.test',password:'safe-yaqui-password'});
   const bot=await request(env,'/api/license/identity/register',{username:'qa_runner',displayName:'Prueba GitHub Actions',email:'runner@grena.test',password:'strong-runner-password'});
   const bot2=await request(env,'/api/license/identity/register',{username:'github_actions_ci',displayName:'Robot',email:'ci@grena.test',password:'strong-actions-password'});
   assert.equal(yaqui.status,201);
   assert.equal(bot.status,201);
   assert.equal(bot2.status,201);
   assert.equal((await request(env,'/api/license/owner/claim',{}, {token:owner.token,admin:ADMIN})).status,200);
   const listing=await request(env,'/api/license-admin/users',null,{token:owner.token});
   assert.equal(listing.status,200);
   assert.deepEqual(listing.data.users.map(x=>x.username).sort(),['grena_rd','yaqui_gr']);
   assert.equal(listing.data.total,2);
   assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM users').first()).total,4,'No se borran cuentas de la base D1');
 }finally{close()}
});

test('Nuevas cuentas: prueba única de 3 días en D1, vinculada al dispositivo y sin alterar usuarios existentes',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const device='DEVICE123456789012345678901234567890';
   const other='ANOTHER123456789012345678901234567890';
   await DB.prepare('INSERT INTO users(id,username,display_name,email,salt,password_hash,registered_at) VALUES(?,?,?,?,?,?,?)')
     .bind('existing-legacy-id','legacy','Antiguo','legacy@example.org','legacy-salt','legacy-hash',Date.now()-7*DAY).run();
   const reg=await request(env,'/api/license/identity/register',{username:'trial_client',email:'trial@example.org',password:'trial-password-2026',deviceId:device});
   assert.equal(reg.status,201);
   assert.equal(reg.data.permanentAccess,false);
   assert.equal(reg.data.license.kind,'trial');
   assert.equal(reg.data.license.active,true);
   assert.equal(reg.data.license.expiresAt-reg.data.license.activatedAt,3*DAY);
   const originalExpiry=reg.data.license.expiresAt;
   const wrongDevice=await request(env,'/api/license/heartbeat',{deviceId:other},{token:reg.data.token});
   assert.equal(wrongDevice.status,200);
   assert.equal(wrongDevice.data.license,null);
   const correct=await request(env,'/api/license/heartbeat',{deviceId:device},{token:reg.data.token});
   assert.equal(correct.data.license.expiresAt,originalExpiry);
   const login=await request(env,'/api/license/identity/login',{username:'trial_client',password:'trial-password-2026',deviceId:device});
   assert.equal(login.status,200);
   assert.equal(login.data.license.expiresAt,originalExpiry,'No se reinicia la prueba al iniciar sesión');
   const legacy=await DB.prepare('SELECT license_expires_at,license_code_id FROM users WHERE username=?').bind('legacy').first();
   assert.equal(legacy.license_expires_at,null,'No regalar días ni alterar licencias históricas');
   assert.equal(legacy.license_code_id,null);
   const owner=await request(env,'/api/license/identity/register',{username:'owner_trial',email:'owner-trial@example.org',password:'owner-trial-password'});
   assert.equal((await request(env,'/api/license/owner/claim',{}, {token:owner.data.token,admin:ADMIN})).status,200);
   const ownerBeat=await request(env,'/api/license/heartbeat',{deviceId:device},{token:owner.data.token});
   assert.equal(ownerBeat.data.permanentAccess,true);
   assert.equal(ownerBeat.data.license,null,'La cuenta propietaria conserva acceso ilimitado');
   const grant=await request(env,'/api/license-admin/grant',{username:'trial_client',days:30},{token:owner.data.token});
   assert.equal(grant.status,200);
   assert.equal(grant.data.renewed,false,'Los 30 días comprados reemplazan y no extienden la prueba');
   const paid=await request(env,'/api/license/heartbeat',{deviceId:device},{token:reg.data.token});
   assert.equal(paid.data.license.kind,'license');
   assert.equal(paid.data.license.expiresAt-paid.data.license.activatedAt,30*DAY);
   assert.equal((await request(env,'/api/license/heartbeat',{deviceId:other},{token:reg.data.token})).data.license,null);
   const unbound=await request(env,'/api/license/identity/register',{username:'trial_unbound',email:'unbound@example.org',password:'unbound-password-123'});
   assert.equal(unbound.data.license.kind,'trial');
   const firstBeat=await request(env,'/api/license/heartbeat',{deviceId:device},{token:unbound.data.token});
   assert.equal(firstBeat.data.license.active,true);
   assert.equal((await request(env,'/api/license/heartbeat',{deviceId:other},{token:unbound.data.token})).data.license,null);
 }finally{close()}
});

test('Cloudflare D1: 30, 60, 90 y días personalizados; renovación acumulada',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const deviceId='DEVICE123456789012345678901234567890';
   const reg=await request(env,'/api/license/identity/register',{username:'sofia',displayName:'Sofía',email:'sofia@example.org',password:'clave-fuerte-2026',deviceId});
   assert.equal(reg.status,201);assert.ok(reg.data.token);
   const tk=reg.data.token;
   assert.equal((await request(env,'/api/license-admin/users')).status,401);
   const owner=await request(env,'/api/license/owner/claim',{}, {token:tk,admin:ADMIN});
   assert.equal(owner.status,200);
   assert.equal(owner.data.isOwner,true);
   const ownerStatus=await request(env,'/api/license/owner/status',null,{token:tk});
   assert.equal(ownerStatus.data.isOwner,true);
   const noLicense=await request(env,'/api/license/heartbeat',{deviceId},{token:tk});
   assert.equal(noLicense.data.license,null);
   const customer=await request(env,'/api/license/identity/register',{username:'viewer',email:'viewer@example.org',password:'buyer-test-password',deviceId});
   const ct=customer.data.token;
   let lastExpiry=0;
   for(const days of [30,60,90,17]){
     const r=await request(env,'/api/license-admin/create',{count:1,days},{token:tk});
     assert.equal(r.status,201);assert.equal(r.data.days,days);assert.equal(r.data.codes.length,1);
     const code=r.data.codes[0];
     const activation=await request(env,'/api/license/redeem',{code,deviceId},{token:ct});
     assert.equal(activation.status,200);assert.equal(activation.data.license.active,true);
     if(lastExpiry)assert.equal(activation.data.license.expiresAt-lastExpiry,days*DAY);
     else assert.equal(activation.data.license.expiresAt-activation.data.license.activatedAt,days*DAY);
     lastExpiry=activation.data.license.expiresAt;
     assert.equal((await request(env,'/api/license/redeem',{code,deviceId},{token:ct})).status,409);
   }
   const list=await request(env,'/api/license-admin/users',null,{token:tk});
   assert.equal(list.status,200);assert.equal(list.data.total,2);assert.equal(list.data.online,2);
   assert.deepEqual(list.data.codes.map(x=>x.days).sort((a,b)=>a-b),[17,30,60,90]);
   const dbUser=DB.prepare('SELECT * FROM users WHERE username=?').bind('viewer');const user=await dbUser.first();
   assert.ok(user.password_hash&&!user.password_hash.includes('clave-fuerte'));
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM user_sessions WHERE token_hash=?').bind(tk).first()).n,0);
   const other=await request(env,'/api/license/heartbeat',{deviceId:'ANOTHER1234567890123456789012345'},{token:ct});
   assert.equal(other.status,200);assert.equal(other.data.license,null);
   assert.equal((await request(env,'/api/license-admin/revoke',{userId:user.id},{token:tk})).data.user.license.active,false);
 }finally{close()}
});
test('Cloudflare D1: valida límites de duración y protege las credenciales de administrador',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const reg=await request(env,'/api/license/identity/register',{username:'owner',email:'owner@example.org',password:'strong-pass-123'});
   const tk=reg.data.token;
   const denied=await request(env,'/api/license/owner/claim',{}, {token:tk,admin:'wrong'});
   assert.equal(denied.status,401);
   assert.equal((await request(env,'/api/license/owner/claim',{}, {token:tk,admin:ADMIN})).status,200);
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:60},{admin:'wrong'})).status,401);
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:0},{token:tk})).status,400);
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:3651},{token:tk})).status,400);
   assert.equal((await request(env,'/api/license-admin/create',{count:26,days:30},{token:tk})).status,400);
   assert.equal((await request(env,'/api/license-admin/create',{count:1,days:3650},{token:tk})).status,201);
   const list=await request(env,'/api/license-admin/users',null,{token:tk});
   assert.equal(list.data.codes.length,1);
   assert.ok(!('hash' in list.data.codes[0]));
 }finally{close()}
});

test('Cloudflare D1: propietario es único y comunidad opt-in privada',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const first=(await request(env,'/api/license/identity/register',{username:'admin',email:'admin@testing.net',password:'strong-pass-123'})).data;
   const second=(await request(env,'/api/license/identity/register',{username:'viewer',email:'viewer@testing.net',password:'strong-pass-123'})).data;
   assert.equal((await request(env,'/api/license/owner/claim',{}, {token:first.token,admin:ADMIN})).status,200);
   assert.equal((await request(env,'/api/license/owner/claim',{}, {token:second.token,admin:ADMIN})).status,409);
   assert.equal((await request(env,'/api/license-admin/users',null,{token:second.token})).status,403);
   assert.equal((await request(env,'/api/license-admin/users',null,{token:first.token})).status,200);
   const initial=await request(env,'/api/license/community',null,{token:second.token});
   assert.equal(initial.data.liveCount,0);
   const firstShare=await request(env,'/api/license/presence',{share:true,live:true,platforms:['twitch','kick'],viewers:120,avatar:''},{token:first.token});
   assert.equal(firstShare.status,200);
   const after=await request(env,'/api/license/community',null,{token:second.token});
   assert.equal(after.status,200);assert.equal(after.data.liveCount,1);assert.equal(after.data.totalViewers,120);
   assert.equal(after.data.users[0].name,'admin');
   assert.equal((await request(env,'/api/license/presence',{share:false},{token:first.token})).status,200);
   assert.equal((await request(env,'/api/license/community',null,{token:second.token})).data.liveCount,0);
 }finally{close()}
});

test('Cloudflare health and D1 readiness report actual table connectivity',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const online=await request(env,'/ready',null,{method:'GET'});
   assert.equal(online.status,200);
   assert.equal(online.data.databaseReady,true);
   assert.deepEqual(online.data.failedChecks,[]);
   const noSchema={DB:{prepare(sql){if(sql.includes('rate_limits'))throw Error('no such table: rate_limits');return DB.prepare(sql)}},ADMIN_KEY:ADMIN};
   const failed=await request(noSchema,'/ready',null,{method:'GET'});
   assert.equal(failed.status,503);
   assert.deepEqual(failed.data.failedChecks,['limits']);
   const health=await request(noSchema,'/health',null,{method:'GET'});
   assert.equal(health.status,200);
 }finally{close()}
});

test('Administrador GREÑA asigna 30 días por nombre sin código, vincula primer dispositivo y renueva 60 días',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const owner=(await request(env,'/api/license/identity/register',{username:'grena_rd',email:'owner@grena.test',password:'owner-password-123'})).data;
   const user=(await request(env,'/api/license/identity/register',{username:'sofia_live',email:'sofia@grena.test',password:'creator-password-123'})).data;
   const device='DEVICE123456789012345678901234567890';
   const other='ANOTHER123456789012345678901234567890';
   assert.equal((await request(env,'/api/license/owner/claim',{}, {admin:ADMIN,token:owner.token})).status,200);
   assert.equal((await request(env,'/api/license-admin/grant',{username:'sofia_live',days:30},{token:user.token})).status,403);
   assert.equal((await request(env,'/api/license-admin/grant',{username:'missing_creator',days:30},{token:owner.token})).status,404);
   assert.equal((await request(env,'/api/license-admin/grant',{username:'sofia_live',days:0},{token:owner.token})).status,400);
   const first=await request(env,'/api/license-admin/grant',{username:'@sofia_live',days:30},{token:owner.token});
   assert.equal(first.status,200);
   assert.equal(first.data.days,30);
   assert.equal(first.data.renewed,false);
   assert.equal(first.data.user.license.active,true);
   assert.equal(first.data.user.deviceBound,false);
   assert.equal(first.data.expiresAt-first.data.user.license.activatedAt,30*DAY);
   // An authenticated heartbeat claims the license for this device without a code.
   const bound=await request(env,'/api/license/heartbeat',{deviceId:device},{token:user.token});
   assert.equal(bound.status,200);
   assert.equal(bound.data.license.active,true);
   const listing=await request(env,'/api/license-admin/users',null,{token:owner.token});
   assert.equal(listing.data.users.find(x=>x.username==='sofia_live').deviceBound,true);
   const otherDevice=await request(env,'/api/license/heartbeat',{deviceId:other},{token:user.token});
   assert.equal(otherDevice.status,200);
   assert.equal(otherDevice.data.license,null);
   const renewal=await request(env,'/api/license-admin/grant',{username:'sofia_live',days:60},{token:owner.token});
   assert.equal(renewal.status,200);
   assert.equal(renewal.data.renewed,true);
   assert.equal(renewal.data.expiresAt-first.data.expiresAt,60*DAY);
   assert.equal((await request(env,'/api/license/heartbeat',{deviceId:other},{token:user.token})).data.license,null);
   assert.equal((await request(env,'/api/license/heartbeat',{deviceId:device},{token:user.token})).data.license.active,true);
   assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM license_grants').first()).n,2);
   assert.equal((await request(env,'/api/license-admin/revoke',{userId:user.user.id},{token:owner.token})).status,200);
   const afterRevocation=await request(env,'/api/license-admin/grant',{username:'sofia_live',days:15},{token:owner.token});
   assert.equal(afterRevocation.status,200);
   assert.equal(afterRevocation.data.renewed,false);
   assert.equal(afterRevocation.data.user.deviceBound,false);
   assert.equal(afterRevocation.data.expiresAt-afterRevocation.data.user.license.activatedAt,15*DAY);
 }finally{close()}
});

test('Propietario autenticado conserva privilegio sin vencimiento',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 try{
   const owner=await request(env,'/api/license/identity/register',{username:'grena_rd',email:'owner@grena.test',password:'safe-owner-test-password'});
   const token=owner.data.token;
   assert.equal(owner.data.permanentAccess,false);
   const claimed=await request(env,'/api/license/owner/claim',{}, {token,admin:ADMIN});
   assert.equal(claimed.status,200);
   assert.equal(claimed.data.permanentAccess,true);
   const login=await request(env,'/api/license/identity/login',{username:'grena_rd',password:'safe-owner-test-password'});
   assert.equal(login.status,200);
   assert.equal(login.data.permanentAccess,true);
   assert.equal(login.data.license,null);
   const id='DEVICE123456789012345678901234567890';
   const beat=await request(env,'/api/license/heartbeat',{deviceId:id},{token:login.data.token});
   assert.equal(beat.data.permanentAccess,true);
   const list=await request(env,'/api/license-admin/users',null,{token:login.data.token});
   const record=list.data.users.find(u=>u.username==='grena_rd');
   assert.equal(record.permanentAccess,true);
   assert.equal(record.isOwner,true);
   for(const [path,payload] of [
      ['/api/license-admin/grant',{username:'grena_rd',days:30}],
      ['/api/license-admin/revoke',{userId:record.id}],
      ['/api/license-admin/suspend',{userId:record.id,disabled:true}]
   ])assert.equal((await request(env,path,payload,{token:login.data.token})).status,409,path);
 }finally{close()}
});

test('Actualizaciones: nadie recibe aviso hasta que el propietario publica oficialmente',async()=>{
 const {DB,close}=mockD1(),env={DB,ADMIN_KEY:ADMIN};
 const originalFetch=globalThis.fetch;
 try{
   const owner=(await request(env,'/api/license/identity/register',{username:'grena_rd',email:'updates-owner@grena.test',password:'safe-owner-password'})).data;
   const normal=(await request(env,'/api/license/identity/register',{username:'user_updates',email:'updates-client@grena.test',password:'safe-client-password'})).data;
   assert.equal((await request(env,'/api/license/owner/claim',{}, {token:owner.token,admin:ADMIN})).status,200);
   const initial=await request(env,'/api/updates/latest');
   assert.equal(initial.data.published,false);
   assert.equal(initial.data.release,null);
   const noAccess=await request(env,'/api/license-admin/updates/stage',{version:'5.1.0',notes:'Prueba'},{token:normal.token});
   assert.equal(noAccess.status,403);
   const draft=await request(env,'/api/license-admin/updates/stage',{version:'5.1.0',notes:'Arreglos del chat'},{token:owner.token});
   assert.equal(draft.status,200);
   assert.equal(draft.data.published,false);
   assert.equal((await request(env,'/api/updates/latest')).data.published,false);
   assert.equal((await request(env,'/api/updates/latest.yml')).status,404);
   const privateState=await request(env,'/api/license-admin/updates',null,{token:owner.token});
   assert.equal(privateState.data.draft.version,'5.1.0');
   assert.equal(privateState.data.published,null);
   const missing=await request(env,'/api/license-admin/updates/publish',{}, {token:owner.token});
   assert.equal(missing.status,409);
   assert.equal((await request(env,'/api/updates/latest')).data.published,false);
   const yaml='version: 5.1.0\nfiles:\n  - url: GRENA-LIVE-Setup-5.1.0.exe\n    sha512: '+('A'.repeat(87)+'=')+'\n    size: 10000002\npath: GRENA-LIVE-Setup-5.1.0.exe\nsha512: '+('A'.repeat(87)+'=')+'\n';
   globalThis.fetch=async (url)=>{
     if(String(url).startsWith('https://api.github.com'))return new Response(JSON.stringify({
       tag_name:'v5.1.0',draft:false,prerelease:false,assets:[
         {name:'latest.yml',size:yaml.length,browser_download_url:'https://github.com/updates/latest.yml'},
         {name:'GRENA-LIVE-Setup-5.1.0.exe',size:10000002}
       ]}),{status:200});
     if(String(url)==='https://github.com/updates/latest.yml')return new Response(yaml,{status:200});
     throw Error('unexpected URL: '+url);
   };
   const published=await request(env,'/api/license-admin/updates/publish',{}, {token:owner.token});
   assert.equal(published.status,200);
   assert.equal(published.data.release.version,'5.1.0');
   const publicState=await request(env,'/api/updates/latest');
   assert.equal(publicState.data.published,true);
   assert.equal(publicState.data.release.version,'5.1.0');
   const feed=await requestRaw('/api/updates/latest.yml');
   assert.equal(feed.status,200);
   assert.match(await feed.text(),/download\/GRENA-LIVE-Setup-5\.1\.0\.exe/);
   const redirect=await requestRaw('/api/updates/download/GRENA-LIVE-Setup-5.1.0.exe');
   assert.equal(redirect.status,302);
   assert.match(redirect.headers.get('location'),/releases\/download\/v5\.1\.0/);
   assert.equal((await request(env,'/api/license-admin/updates/stage',{version:'5.0.9',notes:'Antigua'},{token:owner.token})).status,409);
   assert.equal((await request(env,'/api/license-admin/updates/stage',{version:'5.2.0',notes:'Borrador siguiente'},{token:owner.token})).status,200);
   assert.equal((await request(env,'/api/updates/latest')).data.release.version,'5.1.0');
   function requestRaw(path){return worker.fetch(new Request('https://license.test'+path),env)}
 }finally{globalThis.fetch=originalFetch;close()}
});
