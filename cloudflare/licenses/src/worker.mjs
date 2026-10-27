// GREÑA Live PRO — Cloudflare Worker + D1.
// Only account identity, status and licensing metadata are stored here.
const DAY=86400000, ONLINE=135000, SESSION_AGE=90*DAY, MAX_DAYS=3650;
const encoder=new TextEncoder();
const now=()=>Date.now();
const hex=a=>[...new Uint8Array(a)].map(b=>b.toString(16).padStart(2,'0')).join('');
const random=n=>hex(crypto.getRandomValues(new Uint8Array(n)));
const b64=a=>btoa(String.fromCharCode(...new Uint8Array(a)));
const sha=async x=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(String(x))));
const same=(a,b)=>{const x=encoder.encode(String(a)),y=encoder.encode(String(b));let mismatch=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)mismatch|=(x[i]||0)^(y[i]||0);return mismatch===0};
async function passHash(password,salt){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:240000,hash:'SHA-256'},key,256));
}
const cleanUser=x=>String(x||'').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,32);
const cleanEmail=x=>String(x||'').trim().toLowerCase().slice(0,254);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','strict-transport-security':'max-age=31536000'}});
const fail=(error,status=400)=>json({ok:false,error},status);
const cleanLicense=(u,deviceId)=>{
 if(!u?.license_expires_at)return null;
 if(deviceId&&u.license_device_id!==deviceId)return null;
 const revokedAt=u.license_revoked_at||null,expiresAt=u.license_expires_at;
 return {activatedAt:u.license_activated_at,expiresAt,revokedAt,active:!revokedAt&&expiresAt>now(),expired:expiresAt<=now()};
};
const publicUser=u=>({
 id:u.id,username:u.username,displayName:u.display_name,email:u.email,
 registeredAt:u.registered_at,lastSeenAt:u.last_seen_at||null,
 online:!!u.last_seen_at&&now()-u.last_seen_at<ONLINE,disabled:!!u.disabled,
 license:cleanLicense(u)
});
const status=(u,deviceId)=>({ok:true,registered:!!u,user:publicUser(u),license:cleanLicense(u,deviceId)});
const deviceValid=d=>/^[A-Za-z0-9_-]{25,80}$/.test(String(d||''));
async function body(req){
 if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw {status:415,message:'Content-Type debe ser application/json'};
 if(Number(req.headers.get('content-length')||0)>8192)throw {status:413,message:'Solicitud demasiado grande'};
 const text=await req.text();
 if(text.length>8192)throw {status:413,message:'Solicitud demasiado grande'};
 let d;try{d=JSON.parse(text||'{}')}catch{throw {status:400,message:'JSON inválido'}}
 if(!d||typeof d!=='object'||Array.isArray(d))throw {status:400,message:'Datos inválidos'};
 return d;
}
async function limiter(env,req,kind,max){
 // D1-backed fixed-minute limit also works across all Worker instances.
 const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 const key=await sha(kind+':'+ip),window=Math.floor(now()/60000);
 const q=await env.DB.prepare('INSERT INTO rate_limits(key, minute, hits) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN minute = excluded.minute THEN hits + 1 ELSE 1 END, minute = excluded.minute RETURNING hits').bind(key,window).first();
 return Number(q?.hits||0)>max;
}
async function sessionUser(env,req){
 const match=/^Bearer ([A-Za-z0-9_-]{32,100})$/.exec(req.headers.get('authorization')||'');
 if(!match)return null;
 return env.DB.prepare('SELECT u.* FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > ? AND u.disabled=0')
   .bind(await sha(match[1]),now()).first();
}
async function issueSession(env,u){
 const key=random(32);
 await env.DB.prepare('INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').bind(await sha(key),u.id,now()+SESSION_AGE).run();
 return key;
}
async function ensureOwners(env){
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS license_owners (user_id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)').run();
}
async function ownerInfo(env,u){
 if(!u)return {ok:true,isOwner:false,configured:false};
 await ensureOwners(env);
 const owners=(await env.DB.prepare('SELECT user_id FROM license_owners LIMIT 1').first());
 return {ok:true,isOwner:owners?.user_id===u.id,configured:!!owners};
}
async function adminCheck(env,req){
 // Owner is authenticated with GREÑA ID; the private ADMIN_KEY is required only
 // once to claim the first owner, never stored on the customer PC or in GitHub.
 const u=await sessionUser(env,req);
 if(!u)return fail('Inicia sesión con tu GREÑA ID.',401);
 const state=await ownerInfo(env,u);
 if(!state.isOwner)return fail('Esta cuenta no está autorizada para administrar licencias.',403);
 return null;
}
async function communityTable(env){
 // Non-destructive lazy migration: no manual D1 changes required for existing users.
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS community_presence (user_id TEXT PRIMARY KEY, viewers INTEGER NOT NULL DEFAULT 0, platforms TEXT NOT NULL DEFAULT \'[]\', avatar TEXT NOT NULL DEFAULT \'\', live INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)').run();
}
async function communitySnapshot(env){
 await communityTable(env);
 const since=now()-90000,onlineSince=now()-ONLINE;
 const live=(await env.DB.prepare('SELECT p.user_id,p.viewers,p.platforms,p.avatar,u.display_name,u.username FROM community_presence p JOIN users u ON u.id=p.user_id WHERE p.live=1 AND p.updated_at>? AND u.disabled=0 ORDER BY p.viewers DESC LIMIT 100').bind(since).all()).results||[];
 const usersOnline=await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE last_seen_at>? AND disabled=0').bind(onlineSince).first();
 const users=live.map(row=>({name:row.display_name||row.username,viewers:row.viewers,avatar:row.avatar||'',platforms:JSON.parse(row.platforms||'[]')}));
 return {ok:true,usersOnline:Number(usersOnline?.n||0),liveCount:users.length,totalViewers:users.reduce((sum,x)=>sum+x.viewers,0),users};
}
async function handle(req,env){
 if(!env.DB)return fail('Falta configurar la base de datos D1.',503);
 const path=new URL(req.url).pathname;
 if(path==='/health'&&req.method==='GET')return json({ok:true,service:'GREÑA Licencias Cloudflare D1'});
 if(path==='/api/license/community'&&req.method==='GET'){
   const u=await sessionUser(env,req);
   if(!u)return fail('Cuenta GREÑA ID requerida.',401);
   return json(await communitySnapshot(env));
 }
 if(path==='/api/license/owner/status'&&req.method==='GET'){
   const u=await sessionUser(env,req);
   if(!u)return fail('Sesión GREÑA ID central requerida.',401);
   return json(await ownerInfo(env,u));
 }
 if(path==='/api/license/owner/claim'&&req.method==='POST'){
   if(await limiter(env,req,'claim-owner',6))return fail('Demasiados intentos.',429);
   const u=await sessionUser(env,req);
   if(!u)return fail('Inicia sesión en GREÑA ID.',401);
   if(String(env.ADMIN_KEY||'').length<32)return fail('Falta configurar ADMIN_KEY como secreto.',503);
   if(!same(req.headers.get('x-grena-admin-key')||'',env.ADMIN_KEY))return fail('Clave de propietario incorrecta.',401);
   await ensureOwners(env);
   const state=await ownerInfo(env,u);
   if(state.configured&&!state.isOwner)return fail('Ya existe una cuenta propietaria. No se puede reclamar otra.',409);
   if(!state.configured)await env.DB.prepare('INSERT INTO license_owners(user_id,created_at) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM license_owners)').bind(u.id,now()).run();
   const result=await ownerInfo(env,u);
   if(!result.isOwner)return fail('Otro propietario se vinculó primero.',409);
   return json({...result,message:'Cuenta propietaria vinculada correctamente.'});
 }
 if(path.startsWith('/api/license-admin/')){
   if(await limiter(env,req,'admin',90))return fail('Demasiadas solicitudes.',429);
   const denied=await adminCheck(env,req);if(denied)return denied;
   if(path==='/api/license-admin/users'&&req.method==='GET'){
     const users=(await env.DB.prepare('SELECT * FROM users ORDER BY registered_at DESC LIMIT 5000').all()).results||[];
     const codes=(await env.DB.prepare('SELECT id,suffix,days,created_at,redeemed_at FROM license_codes ORDER BY created_at DESC LIMIT 5000').all()).results||[];
     return json({ok:true,users:users.map(publicUser),total:users.length,online:users.filter(u=>u.last_seen_at&&now()-u.last_seen_at<ONLINE).length,
       codes:codes.map(c=>({id:c.id,suffix:c.suffix,days:c.days,createdAt:c.created_at,redeemedAt:c.redeemed_at}))});
   }
   if(req.method!=='POST')return fail('Método no permitido.',405);
   const b=await body(req);
   if(path==='/api/license-admin/create'){
     const count=Number(b.count),days=Number(b.days);
     if(!Number.isInteger(count)||count<1||count>25)return fail('Selecciona de 1 a 25 códigos.');
     if(!Number.isInteger(days)||days<1||days>MAX_DAYS)return fail('La duración debe ser de 1 a 3650 días.');
     const created=[],statements=[],time=now();
     for(let i=0;i<count;i++){
       const plain='GRENA-'+random(5).toUpperCase()+'-'+random(5).toUpperCase();
       statements.push(env.DB.prepare('INSERT INTO license_codes(id, code_hash, suffix, days, created_at) VALUES (?,?,?,?,?)')
         .bind(crypto.randomUUID(),await sha(plain),plain.slice(-5),days,time));
       created.push(plain);
     }
     await env.DB.batch(statements);
     return json({ok:true,codes:created,days},201);
   }
   if(path==='/api/license-admin/revoke'||path==='/api/license-admin/suspend'){
     const u=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(String(b.userId||'')).first();
     if(!u)return fail('Usuario no encontrado.',404);
     if(path.endsWith('/revoke'))await env.DB.prepare('UPDATE users SET license_revoked_at=? WHERE id=? AND license_expires_at IS NOT NULL').bind(now(),u.id).run();
     else await env.DB.prepare('UPDATE users SET disabled=? WHERE id=?').bind(b.disabled===true?1:0,u.id).run();
     const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first();
     return json({ok:true,user:publicUser(fresh)});
   }
   return fail('Ruta no encontrada.',404);
 }
 if(!path.startsWith('/api/license/')||req.method!=='POST')return fail('Ruta no encontrada.',404);
 if(path==='/api/license/identity/register'){
   if(await limiter(env,req,'register',10))return fail('Demasiados registros.',429);
   const b=await body(req),username=cleanUser(b.username),email=cleanEmail(b.email),password=String(b.password||''),display=String(b.displayName||username).trim().slice(0,40);
   if(username.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)||password.length<8||password.length>256)
     return fail('Completa usuario, correo y contraseña válida.');
   if((await env.DB.prepare('SELECT id FROM users WHERE username=? OR email=?').bind(username,email).first()))
     return fail('Usuario o correo ya registrado en GREÑA central.',409);
   const salt=random(16),hash=await passHash(password,salt),id=crypto.randomUUID(),time=now();
   try{await env.DB.prepare('INSERT INTO users(id,username,display_name,email,salt,password_hash,registered_at,last_seen_at) VALUES(?,?,?,?,?,?,?,?)')
     .bind(id,username,display||username,email,salt,hash,time,time).run()}
   catch{return fail('Usuario o correo ya registrado.',409)}
   const u=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
   return json({...status(u,String(b.deviceId||'')),token:await issueSession(env,u)},201);
 }
 if(path==='/api/license/identity/login'){
   if(await limiter(env,req,'login',20))return fail('Demasiados intentos de acceso.',429);
   const b=await body(req),username=cleanUser(b.username),password=String(b.password||'');
   const u=await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
   // Same KDF cost even for a non-existent account, to limit account enumeration.
   const derived=await passHash(password,u?.salt||'not-a-registered-user');
   if(!u)return fail('Usuario central no registrado.',404);
   if(!same(derived,u.password_hash))return fail('Credenciales centrales incorrectas.',401);
   if(u.disabled)return fail('Cuenta suspendida.',403);
   const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first();
   return json({...status(fresh,String(b.deviceId||'')),token:await issueSession(env,u)});
 }
 const u=await sessionUser(env,req);
 if(!u)return fail('La sesión central venció o está suspendida.',401);
 if(path==='/api/license/presence'){
   const b=await body(req);
   await communityTable(env);
   if(b.share!==true){
     await env.DB.prepare('DELETE FROM community_presence WHERE user_id=?').bind(u.id).run();
     return json({ok:true,share:false});
   }
   const platforms=Array.isArray(b.platforms)?[...new Set(b.platforms.map(String).filter(p=>['tiktok','twitch','kick','youtube','starvios'].includes(p)))].slice(0,5):[];
   const viewers=Number(b.viewers);
   const count=Number.isFinite(viewers)?Math.max(0,Math.min(10000000,Math.floor(viewers))):0;
   const live=b.live===true&&platforms.length>0;
   const avatar=typeof b.avatar==='string'&&b.avatar.length<20000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.avatar)?b.avatar:'';
   await env.DB.prepare('INSERT INTO community_presence(user_id,viewers,platforms,avatar,live,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET viewers=excluded.viewers,platforms=excluded.platforms,avatar=excluded.avatar,live=excluded.live,updated_at=excluded.updated_at')
     .bind(u.id,count,JSON.stringify(platforms),avatar,live?1:0,now()).run();
   return json({ok:true,share:true,live});
 }
 if(path==='/api/license/heartbeat'){
   const b=await body(req),deviceId=String(b.deviceId||'');
   if(!deviceValid(deviceId))return fail('Identificador de dispositivo inválido.');
   await env.DB.prepare('UPDATE users SET last_seen_at=? WHERE id=?').bind(now(),u.id).run();
   return json(status({...u,last_seen_at:now()},deviceId));
 }
 if(path==='/api/license/redeem'){
   if(await limiter(env,req,'redeem',12))return fail('Demasiados intentos de activación.',429);
   const b=await body(req),code=String(b.code||'').trim().toUpperCase(),deviceId=String(b.deviceId||'');
   if(!/^GRENA-[A-F0-9]{10}-[A-F0-9]{10}$/.test(code)||!deviceValid(deviceId))return fail('Código o dispositivo inválido.');
   if(u.license_expires_at>now()&&!u.license_revoked_at&&u.license_device_id!==deviceId)
     return fail('Tu licencia está vinculada a otra computadora.',403);
   const codeHash=await sha(code);
   const item=await env.DB.prepare('SELECT * FROM license_codes WHERE code_hash=?').bind(codeHash).first();
   if(!item||item.redeemed_at)return fail('Código inválido o utilizado.',409);
   const time=now(),expiresAt=Math.max(time,(!u.license_revoked_at&&u.license_expires_at)||0)+item.days*DAY;
   // Conditional update ensures that even concurrent requests cannot reuse a code.
   const claimed=await env.DB.prepare('UPDATE license_codes SET redeemed_at=?, used_by=? WHERE id=? AND redeemed_at IS NULL')
     .bind(time,u.id,item.id).run();
   if(Number(claimed.meta?.changes||0)!==1)return fail('Código ya utilizado.',409);
   await env.DB.prepare('UPDATE users SET license_activated_at=?,license_expires_at=?,license_device_id=?,license_revoked_at=NULL,license_code_id=?,last_seen_at=? WHERE id=?')
     .bind(time,expiresAt,deviceId,item.id,time,u.id).run();
   const fresh=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(u.id).first();
   return json(status(fresh,deviceId));
 }
 return fail('Ruta no encontrada.',404);
}
export default {
 async fetch(req,env){
   try{return await handle(req,env)}catch(e){
     console.error('GREÑA license worker request failed',e?.name||'error');
     return fail((e&&typeof e.status==='number')?e.message:'Error del servicio central de licencias.',
       (e&&e.status>=400&&e.status<600)?e.status:503);
   }
 }
};
