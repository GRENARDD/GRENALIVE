// GREÑA Live PRO · Registro central y licencias temporales.
// En Cloudflare D1 se guardan identidad, estado y licencias; nunca perfiles de streaming.
import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';

const DAY=24*60*60*1000;
const ONLINE_MS=135000;
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const normalizeUser=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,32);
const normalizeEmail=v=>String(v||'').trim().toLowerCase().slice(0,254);
const pwHash=(password,salt)=>new Promise((resolve,reject)=>scrypt(String(password),String(salt),64,(err,result)=>err?reject(err):resolve(result.toString('hex'))));
const same=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length>0&&x.length===y.length&&timingSafeEqual(x,y)};
const reply=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
const publicLicense=l=>!l?null:{activatedAt:l.activatedAt,expiresAt:l.expiresAt,revokedAt:l.revokedAt||null,expired:Date.now()>=l.expiresAt,active:!l.revokedAt&&Date.now()<l.expiresAt};
const limitMap=new Map();
function limited(req,bucket,max=15){
 const ip=String(req.socket?.remoteAddress||'unknown'),key=bucket+':'+ip,now=Date.now();
 for(const [k,v] of limitMap)if(now-v.since>60000)limitMap.delete(k);
 const v=limitMap.get(key)||{since:now,count:0};v.count++;limitMap.set(key,v);
 return v.count>max;
}
function decodeBearer(req){
 const h=String(req.headers.authorization||'');
 return /^Bearer [A-Za-z0-9_-]{32,100}$/.test(h)?h.slice(7):'';
}
async function readJson(file,fallback){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function writeJson(file,data){
 await mkdir(dirname(file),{recursive:true});
 const tmp=file+'.'+process.pid+'.'+randomBytes(5).toString('hex')+'.tmp';
 await writeFile(tmp,JSON.stringify(data,null,2),'utf8');
 await rename(tmp,file);
}
async function parseBody(req,readBody){
 const raw=await readBody(req,8192);
 try{const body=JSON.parse(raw||'{}');if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body}catch{throw Object.assign(Error('JSON no válido.'),{status:400})}
}
export async function makeLicensing({cloud,dataDir,profileFile,activeUser,readBody,remoteUrl}){
 const cloudFile=join(dataDir,'grena-license-registry.json'); // Legacy host implementation; el cliente local usa Cloudflare Worker.
 let registry=cloud?await readJson(cloudFile,{version:1,users:[],codes:[]}):null;
 if(cloud){
   if(!Array.isArray(registry.users))registry.users=[];
   if(!Array.isArray(registry.codes))registry.codes=[];
 }
 let chain=Promise.resolve();
 const locked=async fn=>{
   const next=chain.then(fn,fn);chain=next.then(()=>{},()=>{});return next;
 };
 const save=async()=>writeJson(cloudFile,registry);
 const byAuth=req=>{
   const t=decodeBearer(req);
   if(!t)return null;
   const h=sha(t),now=Date.now();
   for(const u of registry.users)for(const s of (u.sessions||[]))if(s.hash===h&&s.expiresAt>now)return u;
   return null;
 };
 const cloudUser=u=>({
   id:u.id,username:u.username,displayName:u.displayName,email:u.email,
   registeredAt:u.registeredAt,lastSeenAt:u.lastSeenAt||null,online:!!u.lastSeenAt&&Date.now()-u.lastSeenAt<ONLINE_MS,
   disabled:!!u.disabled,license:publicLicense(u.license)
 });
 const status=u=>({ok:true,registered:!!u,user:u?cloudUser(u):null,license:publicLicense(u?.license)});
 let cache=new Map(),installId='';
 if(!cloud){
   const installFile=join(dataDir,'license-installation.json');
   const saved=await readJson(installFile,{});
   installId=/^[A-Za-z0-9_-]{25,80}$/.test(saved.id||'')?saved.id:token();
   if(installId!==saved.id)await writeJson(installFile,{id:installId});
 }
 async function getCached(userId){
   const id=String(userId||'');if(!id)return null;
   if(!cache.has(id))cache.set(id,await readJson(profileFile('cloud-license.json',id),{connected:false,license:null}));
   return cache.get(id);
 }
 async function updateCached(userId,patch){
   const prev=await getCached(userId),next={...prev,...patch};
   cache.set(userId,next);await writeJson(profileFile('cloud-license.json',userId),next);
   return next;
 }
 async function callCloud(path,payload,cloudToken=''){
   if(!remoteUrl||!/^https:\/\//.test(remoteUrl))throw Error('Falta configurar la URL HTTPS de licencias.');
   const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),5500);
   try{
     const response=await fetch(remoteUrl+path,{
       method:'POST',headers:{'content-type':'application/json',...(cloudToken?{authorization:'Bearer '+cloudToken}:{})},
       body:JSON.stringify(payload),signal:ac.signal
     });
     const result=await response.json().catch(()=>({}));
     if(!response.ok||!result.ok)throw Object.assign(Error(result.error||'Servidor de licencias no disponible.'),{status:response.status});
     return result;
   }finally{clearTimeout(timer)}
 }
 async function onLocalAuth(user,password){
   if(cloud||!user||!remoteUrl)return;
   try{
     let result;
     try{result=await callCloud('/api/license/identity/login',{username:user.username,password,deviceId:installId})}
     catch(e){
       if(e.status!==404)throw e;
       result=await callCloud('/api/license/identity/register',{username:user.username,email:user.email,displayName:user.displayName,password,deviceId:installId});
     }
     await updateCached(user.id,{connected:true,token:result.token,license:result.license||null,lastValidatedAt:Date.now(),syncError:''});
   }catch(e){
     await updateCached(user.id,{connected:false,syncError:String(e.message||e).slice(0,180)}).catch(()=>{});
     console.warn('[GREÑA licencias] Identidad pendiente de sincronizar:',e?.message||e);
   }
 }
 async function heartbeat(userId){
   if(cloud||!remoteUrl||!userId)return;
   const local=await getCached(userId);if(!local?.token)return;
   try{
     const r=await callCloud('/api/license/heartbeat',{deviceId:installId},local.token);
     await updateCached(userId,{connected:true,license:r.license,lastValidatedAt:Date.now(),syncError:''});
   }catch(e){await updateCached(userId,{connected:false,syncError:String(e.message||e).slice(0,180)}).catch(()=>{})}
 }
 function localAllowed(local){
   // Hasta 24 horas sin conexión para una licencia YA VALIDADA y aún vigente.
   if(!local?.license||local.license.revokedAt||Date.now()>=Number(local.license.expiresAt||0))return false;
   return Date.now()-Number(local.lastValidatedAt||0)<24*60*60*1000;
 }
 async function canUse(userId){
   if(cloud||process.env.GRENA_LICENSE_REQUIRE!=='1')return true;
   return localAllowed(await getCached(userId));
 }
 async function handle(req,res,pathname){
   const remote=pathname.startsWith('/api/license/')||pathname.startsWith('/api/license-admin/');
   if(!remote)return false;
   try{
     // Endpoints heredados de hosting Node; la distribución usa Cloudflare Worker/D1.
     if(cloud){
       if(pathname.startsWith('/api/license-admin/')){
         const configured=String(process.env.GRENA_LICENSE_ADMIN_KEY||'');
         if(configured.length<32)return reply(res,503,{ok:false,error:'Configura la clave de administrador del servicio de licencias.'}),true;
         if(limited(req,'admin',80))return reply(res,429,{ok:false,error:'Demasiadas solicitudes.'}),true;
         if(!same(req.headers['x-grena-admin-key']||'',configured))return reply(res,401,{ok:false,error:'Clave de administrador incorrecta.'}),true;
         if(pathname==='/api/license-admin/users'&&req.method==='GET')
           return reply(res,200,{ok:true,users:registry.users.map(cloudUser),total:registry.users.length,online:registry.users.filter(u=>u.lastSeenAt&&Date.now()-u.lastSeenAt<ONLINE_MS).length,codes:registry.codes.map(c=>({id:c.id,suffix:c.suffix,days:Number(c.days)||30,redeemedAt:c.redeemedAt||null,createdAt:c.createdAt}))}),true;
         if(pathname==='/api/license-admin/create'&&req.method==='POST'){
           const b=await parseBody(req,readBody),count=Number(b.count),days=Number(b.days);
           if(!Number.isInteger(count)||count<1||count>25)return reply(res,400,{ok:false,error:'Selecciona de 1 a 25 códigos.'}),true;
           if(!Number.isInteger(days)||days<1||days>3650)return reply(res,400,{ok:false,error:'Duración inválida (1 a 3650 días).'}),true;
           return await locked(async()=>{
             const created=[];
             for(let i=0;i<count;i++){
               const plain='GRENA-'+randomBytes(5).toString('hex').toUpperCase()+'-'+randomBytes(5).toString('hex').toUpperCase();
               registry.codes.push({id:token(),hash:sha(plain),suffix:plain.slice(-5),days,createdAt:Date.now(),redeemedAt:null,usedBy:null});
               created.push(plain);
             }
             await save();reply(res,201,{ok:true,codes:created,days});return true;
           });
         }
         if(pathname==='/api/license-admin/revoke'&&req.method==='POST'){
           const b=await parseBody(req,readBody);
           return await locked(async()=>{
             const u=registry.users.find(u=>u.id===String(b.userId));
             if(!u)return reply(res,404,{ok:false,error:'Usuario no encontrado.'}),true;
             if(u.license)u.license.revokedAt=Date.now();
             await save();reply(res,200,{ok:true,user:cloudUser(u)});return true;
           });
         }
         if(pathname==='/api/license-admin/suspend'&&req.method==='POST'){
           const b=await parseBody(req,readBody);
           return await locked(async()=>{
             const u=registry.users.find(u=>u.id===String(b.userId));
             if(!u)return reply(res,404,{ok:false,error:'Usuario no encontrado.'}),true;
             u.disabled=b.disabled===true;await save();reply(res,200,{ok:true,user:cloudUser(u)});return true;
           });
         }
         return reply(res,404,{ok:false,error:'Ruta desconocida.'}),true;
       }
       if(req.method!=='POST')return reply(res,405,{ok:false,error:'Método no permitido.'}),true;
       if(pathname==='/api/license/identity/register'){
         if(limited(req,'register',12))return reply(res,429,{ok:false,error:'Demasiados registros.'}),true;
         const b=await parseBody(req,readBody),username=normalizeUser(b.username),email=normalizeEmail(b.email),password=String(b.password||''),displayName=String(b.displayName||username).trim().slice(0,40);
         if(username.length<3||email.length<5||!email.includes('@')||password.length<8)
           return reply(res,400,{ok:false,error:'Completa usuario, correo y contraseña válida.'}),true;
         if(registry.users.some(u=>u.username===username||u.email===email))
           return reply(res,409,{ok:false,error:'Este usuario o correo ya está registrado en GREÑA central.'}),true;
         const salt=randomBytes(16).toString('hex'),hash=await pwHash(password,salt),t=token();
         return await locked(async()=>{
           if(registry.users.some(u=>u.username===username||u.email===email))return reply(res,409,{ok:false,error:'Usuario o correo duplicado.'}),true;
           const u={id:token(),username,email,displayName,salt,passwordHash:hash,registeredAt:Date.now(),lastSeenAt:Date.now(),sessions:[{hash:sha(t),expiresAt:Date.now()+90*24*60*60*1000}],license:null,disabled:false};
           registry.users.push(u);await save();reply(res,201,{...status(u),token:t});return true;
         });
       }
       if(pathname==='/api/license/identity/login'){
         if(limited(req,'login',20))return reply(res,429,{ok:false,error:'Demasiados intentos.'}),true;
         const b=await parseBody(req,readBody),username=normalizeUser(b.username),password=String(b.password||''),u=registry.users.find(u=>u.username===username);
         if(!u)return reply(res,404,{ok:false,error:'Usuario central no registrado.'}),true;
         const hash=await pwHash(password,u.salt);
         if(!same(hash,u.passwordHash))return reply(res,401,{ok:false,error:'Credenciales de GREÑA central incorrectas.'}),true;
         if(u.disabled)return reply(res,403,{ok:false,error:'Cuenta suspendida por el administrador.'}),true;
         const t=token();
         return await locked(async()=>{
           u.sessions=(u.sessions||[]).filter(s=>s.expiresAt>Date.now()).slice(-5);
           u.sessions.push({hash:sha(t),expiresAt:Date.now()+90*24*60*60*1000});
           u.lastSeenAt=Date.now();await save();reply(res,200,{...status(u),token:t});return true;
         });
       }
       if(pathname==='/api/license/heartbeat'){
         const u=byAuth(req);if(!u||u.disabled)return reply(res,401,{ok:false,error:'La sesión central venció o fue suspendida.'}),true;
         return await locked(async()=>{u.lastSeenAt=Date.now();await save();reply(res,200,status(u));return true});
       }
       if(pathname==='/api/license/redeem'){
         if(limited(req,'redeem',12))return reply(res,429,{ok:false,error:'Demasiados intentos de activación.'}),true;
         const u=byAuth(req),b=await parseBody(req,readBody);
         if(!u||u.disabled)return reply(res,401,{ok:false,error:'Inicia sesión en GREÑA central.'}),true;
         const raw=String(b.code||'').trim().toUpperCase(),deviceId=String(b.deviceId||'');
         if(!/^GRENA-[A-F0-9]{10}-[A-F0-9]{10}$/.test(raw)||!/^[A-Za-z0-9_-]{25,80}$/.test(deviceId))
           return reply(res,400,{ok:false,error:'Código o dispositivo inválido.'}),true;
         return await locked(async()=>{
           const c=registry.codes.find(c=>c.hash===sha(raw));
           if(!c||c.redeemedAt)return reply(res,409,{ok:false,error:'Código inválido o ya utilizado.'}),true;
           if(u.license&&!u.license.revokedAt&&Date.now()<u.license.expiresAt&&u.license.deviceId!==deviceId)
             return reply(res,403,{ok:false,error:'La licencia actual está vinculada a otra computadora.'}),true;
           c.redeemedAt=Date.now();c.usedBy=u.id;
           const now=Date.now(),start=Math.max(now,!u.license?.revokedAt?Number(u.license?.expiresAt||0):0);
           u.license={activatedAt:now,expiresAt:start+(Number(c.days)||30)*DAY,deviceId,revokedAt:null,codeId:c.id};
           u.lastSeenAt=now;await save();reply(res,200,status(u));return true;
         });
       }
       return reply(res,404,{ok:false,error:'Ruta desconocida.'}),true;
     }
     // Endpoints locales: requieren la sesión de GREÑA ID comprobada por server.mjs.
     const u=activeUser(req);if(!u)return reply(res,401,{ok:false,error:'Inicia sesión en tu GREÑA ID.'}),true;
     if(pathname.startsWith('/api/license-admin/')){
       if(!remoteUrl||!/^https:\/\//.test(remoteUrl))return reply(res,503,{ok:false,error:'Configura la dirección HTTPS de licencias Cloudflare.'}),true;
       const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),6500);
       try{
         const key=String(req.headers['x-grena-admin-key']||'');
         if(key.length<32||key.length>512)return reply(res,401,{ok:false,error:'Clave de administrador incorrecta.'}),true;
         const payload=req.method==='POST'?await parseBody(req,readBody):undefined;
         const response=await fetch(remoteUrl+pathname,{method:req.method,headers:{'x-grena-admin-key':key,...(payload?{'content-type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,signal:ac.signal});
         const result=await response.json().catch(()=>({ok:false,error:'Respuesta no válida del servicio.'}));
         return reply(res,response.status,result),true;
       }finally{clearTimeout(timer)}
     }
     if(pathname==='/api/license/status'&&req.method==='GET'){
       const c=await getCached(u.id);
       return reply(res,200,{ok:true,registered:!!c?.token,connected:!!c?.connected,license:c?.license||null,allowed:localAllowed(c),syncError:remoteUrl?(c?.syncError||''):'Cloudflare aún no está configurado por el administrador.',lastValidatedAt:c?.lastValidatedAt||null}),true;
     }
     if(pathname==='/api/license/refresh'&&req.method==='POST'){
       await heartbeat(u.id);const c=await getCached(u.id);
       return reply(res,200,{ok:true,registered:!!c?.token,connected:!!c?.connected,license:c?.license||null,allowed:localAllowed(c),syncError:remoteUrl?(c?.syncError||''):'Cloudflare aún no está configurado por el administrador.'}),true;
     }
     if(pathname==='/api/license/redeem'&&req.method==='POST'){
       const c=await getCached(u.id);
       if(!c?.token)return reply(res,409,{ok:false,error:'Vuelve a iniciar sesión para sincronizar tu GREÑA ID con el servidor.'}),true;
       const b=await parseBody(req,readBody);
       const result=await callCloud('/api/license/redeem',{code:b.code,deviceId:installId},c.token);
       await updateCached(u.id,{connected:true,license:result.license,lastValidatedAt:Date.now(),syncError:''});
       return reply(res,200,{ok:true,license:result.license}),true;
     }
     return reply(res,404,{ok:false,error:'Ruta desconocida.'}),true;
   }catch(e){
     const status=Number(e.status)||503;
     reply(res,status>=400&&status<600?status:503,{ok:false,error:String(e.message||e).slice(0,190)});
     return true;
   }
 }
 return {handle,onLocalAuth,heartbeat,canUse,getCached};
}
