import http from 'node:http';
import { createHash } from 'node:crypto';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import { normalizeTikTokUsername, safeEventText } from './protocol.mjs';
import { PLATFORM_IDS, PLATFORM_INFO, platformId } from './platforms.mjs';

const PORT = Number(process.env.PORT || 8080);
const LICENSE_BASE = 'https://grena-live-licenses.omelicolon18.workers.dev';
const MAX_ACTIVE = 25;
const MAX_QUEUE = 100;
const MAX_BODY_BYTES = 4096;
const IDLE_MS = 2 * 60 * 1000;
const CHECK_MS = 20_000;
const sessions = new Map();
const validations = new Map();

function json(res, status, body) {
  if (res.writableEnded) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}
const text=safeEventText;
const publicUsername=normalizeTikTokUsername;
function digest(token) { return createHash('sha256').update(token).digest('hex'); }
function bearer(req) {
  const raw = req.headers.authorization || '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,100})$/.exec(raw);
  return match ? match[1] : '';
}
async function verify(token) {
  const key = digest(token);
  const current = validations.get(key);
  if (current && current.exp > Date.now()) return key;
  const ctrl = new AbortController();
  const cancel = setTimeout(() => ctrl.abort(), 10000);
  try {
    const remote = await fetch(LICENSE_BASE+'/api/license/community', {
      headers: {'Authorization': 'Bearer '+token, 'Accept':'application/json'},
      signal: ctrl.signal
    });
    if (!remote.ok) throw Object.assign(new Error('GREÑA ID inválido o sin conexión.'),{status:401});
    const body = await remote.json();
    if (body?.ok !== true) throw Object.assign(new Error('GREÑA ID rechazado.'),{status:401});
    validations.set(key,{exp:Date.now()+15_000});
    if(validations.size>1000)for(const [k,v] of validations)if(v.exp<Date.now())validations.delete(k);
    return key;
  } finally { clearTimeout(cancel); }
}
async function readBody(req) {
  let data='';
  for await (const chunk of req) {
    data+=chunk.toString();
    if(data.length>MAX_BODY_BYTES)throw Object.assign(new Error('Cuerpo demasiado grande.'),{status:413});
  }
  try { return JSON.parse(data || '{}'); } catch {throw Object.assign(new Error('JSON inválido.'),{status:400});}
}
function add(session,record) {
  const event={seq:++session.seq,at:Date.now(),...record};
  session.events.push(event);
  if(session.events.length>MAX_QUEUE)session.events.shift();
  return event;
}
async function stop(session,reason='Desconectado') {
  if(!session)return;
  session.connected=false;
  session.state=reason;
  try{await session.conn?.disconnect();}catch{}
  session.conn=null;
}
function info(session) {
  return {ok:true,platform:'tiktok',connected:session.connected,state:session.state,username:session.username,
    roomId:session.roomId||'',viewers:session.viewers||0,lastSeq:session.seq};
}
async function connect(key,username) {
  const old=sessions.get(key);
  if (old && old.username===username && old.connected){old.activeAt=Date.now();return info(old);}
  if (old && old.connecting) return {ok:false,connected:false,state:'Conexión en proceso',error:'Conexión en proceso'};
  if (old) await stop(old,'Canal cambiado');
  if (sessions.size>=MAX_ACTIVE && !sessions.has(key))throw Object.assign(new Error('Límite temporal de transmisiones móviles alcanzado.'),{status:429});
  const session={username,connected:false,connecting:true,state:'Conectando con TikTok LIVE',
    activeAt:Date.now(),roomId:'',viewers:0,seq:0,events:[],conn:null,lastConnectAt:Date.now()};
  sessions.set(key,session);
  const connection = new TikTokLiveConnection(username,{
    processInitialData:false,enableExtendedGiftInfo:false,
    ...(process.env.SIGN_API_KEY ? {signApiKey:process.env.SIGN_API_KEY}: {})
  });
  session.conn=connection;
  connection.on(WebcastEvent.CHAT,e=>{
    const msg=text(e?.content,240);
    if(msg)add(session,{kind:'chat',platform:'tiktok',user:text(e?.user?.displayId||e?.user?.uniqueId||'Usuario',45),message:msg});
  });
  connection.on(WebcastEvent.FOLLOW,e=>{
    add(session,{kind:'alert',action:'follow',platform:'tiktok',user:text(e?.user?.displayId||'Usuario',45),message:'te siguió'});
  });
  connection.on(WebcastEvent.GIFT,e=>{
    const user=text(e?.user?.displayId||'Usuario',45);
    const gift=text(e?.gift?.name||e?.giftName||('Regalo '+(e?.giftId||'')),60);
    const amount=Math.min(Math.max(Number(e?.repeatCount||1)||1,1),9999);
    // For streakable gifts, avoid emitting each intermediate rolling count as a new completed gift.
    if(e?.gift?.streakable && e?.repeatEnd!==true && e?.repeatEnd!==1)return;
    add(session,{kind:'alert',action:'gift',platform:'tiktok',user,message:'envió '+gift+' x'+amount,amount,giftName:gift});
  });
  connection.on(WebcastEvent.SHARE,e=>{
    add(session,{kind:'alert',action:'share',platform:'tiktok',user:text(e?.user?.displayId||'Usuario',45),message:'compartió el LIVE'});
  });
  connection.on(WebcastEvent.ROOM_USER,e=>{
    const count=Number(e?.totalUser || e?.viewerCount || e?.totalUserCount);
    if(Number.isFinite(count))session.viewers=Math.max(0,Math.floor(count));
  });
  connection.on(WebcastEvent.STREAM_END,()=>{
    session.connected=false;session.state='LIVE finalizado';
    add(session,{kind:'status',state:'offline',message:'El LIVE terminó'});
  });
  connection.on(ControlEvent.ERROR,e=>{
    session.state='TikTok no responde o perdió conexión';
    add(session,{kind:'status',state:'error',message:text(e?.info||'Error del conector',160)});
  });
  try {
    const state=await connection.connect();
    session.roomId=String(state?.roomId||'');
    session.connected=true;session.state='Conectado a TikTok LIVE';session.connecting=false;
    add(session,{kind:'status',state:'connected',message:'Conectado con el LIVE'});
    return info(session);
  } catch(error) {
    session.connected=false;session.connecting=false;
    session.state='TikTok LIVE no conectado';
    const message=text(error?.message||'El LIVE está desconectado o el proveedor rechazó la conexión.',160);
    add(session,{kind:'status',state:'error',message});
    try{await connection.disconnect();}catch{}
    return {ok:false,connected:false,state:session.state,error:message};
  }
}
setInterval(async()=>{
  for(const [key,session] of sessions) {
    if(Date.now()-session.activeAt>IDLE_MS){
      sessions.delete(key);
      await stop(session,'Sesión móvil inactiva');
    }
  }
},CHECK_MS).unref();

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/health'&&req.method==='GET'){
    return json(res,200,{ok:true,service:'GREÑA Mobile Relay BETA',activeSessions:sessions.size,
      platform:'tiktok',platforms:PLATFORM_IDS,pcServerModified:false});
  }
  if(!pathname.startsWith('/api/mobile/'))return json(res,404,{ok:false,error:'Ruta no encontrada'});
  const token=bearer(req);
  if(!token)return json(res,401,{ok:false,error:'Inicia sesión con GREÑA ID.'});
  let key;
  try{key=await verify(token);}
  catch(error){return json(res,error.status||503,{ok:false,error:error.status===401?'GREÑA ID inválido o vencido.':'No se pudo comprobar GREÑA ID.'});}
  const session=sessions.get(key);
  if(pathname==='/api/mobile/capabilities'&&req.method==='GET'){
    const platforms=Object.fromEntries(PLATFORM_IDS.map(id=>[id,{
      name:PLATFORM_INFO[id].name,
      auth:PLATFORM_INFO[id].auth,
      expectedEvents:PLATFORM_INFO[id].events,
      adapterImplemented:id==='tiktok',
      serverRunning:true,
      liveConfirmed:id==='tiktok'&&session?.connected===true,
      state:id==='tiktok'?(session?.connected===true?'live':'not_connected'):'adapter_unavailable'
    }]));
    return json(res,200,{ok:true,platforms,server:'independent-node',usesRailway:false});
  }
  if(pathname==='/api/mobile/connect'&&req.method==='POST'){
    try {
      const body=await readBody(req);
      const platform=platformId(body.platform||'tiktok');
      if(platform!=='tiktok')return json(res,501,{ok:false,connected:false,
        platform,error:'El adaptador móvil de '+PLATFORM_INFO[platform].name+' requiere autorización e implementación. El enlace guardado no es una conexión real.'});
      const name=publicUsername(body.username||body.url);
      if(session?.lastConnectAt&&Date.now()-session.lastConnectAt<10_000&&session.username!==name)
        return json(res,429,{ok:false,error:'Espera antes de cambiar de canal.'});
      const result=await connect(key,name);
      return json(res,result.ok?200:409,result);
    } catch(error){
      return json(res,error.status||400,{ok:false,connected:false,error:text(error.message,160)});
    }
  }
  if(pathname==='/api/mobile/events'&&req.method==='GET'){
    if(!session)return json(res,200,{ok:true,connected:false,state:'No conectado',events:[],lastSeq:0});
    session.activeAt=Date.now();
    const query=new URL(req.url,'http://localhost');
    const after=Number(query.searchParams.get('after')||0);
    const cursor=Number.isSafeInteger(after)&&after>=0?after:0;
    return json(res,200,{...info(session),events:session.events.filter(e=>e.seq>cursor).slice(-MAX_QUEUE)});
  }
  if(pathname==='/api/mobile/disconnect'&&req.method==='POST'){
    if(session){sessions.delete(key);await stop(session,'Desconectado desde Android');}
    return json(res,200,{ok:true,connected:false});
  }
  return json(res,404,{ok:false,error:'Ruta no encontrada'});
});
server.requestTimeout=30_000;
server.headersTimeout=15_000;
server.listen(PORT,'0.0.0.0',()=>{console.log('GREÑA Mobile Relay listening on port '+PORT);});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{
  server.close();
  for(const s of sessions.values())void stop(s,'Servidor detenido');
  setTimeout(()=>process.exit(0),2500).unref();
});
