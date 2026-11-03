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
const WATCH_RETRY_MS=30_000;
async function stop(session,reason='Desconectado') {
  if(!session)return;
  session.watching=false;
  session.connected=false;
  session.connecting=false;
  session.state=reason;
  const conn=session.conn;
  session.conn=null;
  try{await conn?.disconnect();}catch{}
}
function info(session) {
  return {ok:true,platform:'tiktok',watching:session.watching===true,
    connected:session.connected===true,state:session.state,username:session.username,
    roomId:session.roomId||'',viewers:session.viewers||0,lastSeq:session.seq};
}
/**
 * TikTok watcher: an offline stream is NOT a successful live handshake.
 * It still keeps a lightweight session so it can retry without the user
 * reconnecting. One attempt per session at a time; no stale event queues.
 */
async function attemptConnection(session) {
  if(!session?.watching||session.connecting||session.connected)return;
  session.connecting=true;
  session.lastAttemptAt=Date.now();
  session.state='Comprobando TikTok LIVE...';
  const prior=session.conn;
  session.conn=null;
  try{await prior?.disconnect();}catch{}
  if(!session.watching){session.connecting=false;return;}
  const connection=new TikTokLiveConnection(session.username,{
    processInitialData:false,enableExtendedGiftInfo:false,
    ...(process.env.SIGN_API_KEY?{signApiKey:process.env.SIGN_API_KEY}:{})
  });
  session.conn=connection;
  const accept=()=>session.conn===connection&&session.watching;
  connection.on(WebcastEvent.CHAT,e=>{
    if(!accept()||!session.connected)return;
    const msg=text(e?.content,240);
    if(msg)add(session,{kind:'chat',platform:'tiktok',
      user:text(e?.user?.displayId||e?.user?.uniqueId||'Usuario',45),message:msg});
  });
  connection.on(WebcastEvent.FOLLOW,e=>{
    if(!accept()||!session.connected)return;
    add(session,{kind:'alert',action:'follow',platform:'tiktok',
      user:text(e?.user?.displayId||'Usuario',45),message:'te siguió'});
  });
  connection.on(WebcastEvent.GIFT,e=>{
    if(!accept()||!session.connected)return;
    const user=text(e?.user?.displayId||'Usuario',45);
    const gift=text(e?.gift?.name||e?.giftName||('Regalo '+(e?.giftId||'')),60);
    const amount=Math.min(Math.max(Number(e?.repeatCount||1)||1,1),9999);
    if(e?.gift?.streakable && e?.repeatEnd!==true && e?.repeatEnd!==1)return;
    add(session,{kind:'alert',action:'gift',platform:'tiktok',user,
      message:'envió '+gift+' x'+amount,amount,giftName:gift});
  });
  connection.on(WebcastEvent.SHARE,e=>{
    if(!accept()||!session.connected)return;
    add(session,{kind:'alert',action:'share',platform:'tiktok',
      user:text(e?.user?.displayId||'Usuario',45),message:'compartió el LIVE'});
  });
  connection.on(WebcastEvent.LIKE,e=>{
    if(!accept()||!session.connected)return;
    const amount=Math.min(99999,Math.max(1,Number(e?.likeCount||e?.count||1)||1));
    add(session,{kind:'alert',action:'likes',platform:'tiktok',
      user:text(e?.user?.displayId||'Usuario',45),message:'dio '+amount+' likes',amount});
  });
  connection.on(WebcastEvent.ROOM_USER,e=>{
    if(!accept())return;
    const count=Number(e?.totalUser??e?.viewerCount??e?.totalUserCount);
    if(Number.isFinite(count))session.viewers=Math.max(0,Math.floor(count));
  });
  connection.on(WebcastEvent.STREAM_END,()=>{
    if(!accept())return;
    session.connected=false;
    session.state='LIVE finalizado · esperando próxima transmisión';
    session.retryAt=Date.now()+WATCH_RETRY_MS;
    add(session,{kind:'status',state:'offline',message:'El LIVE terminó; sigue en vigilancia'});
  });
  connection.on(ControlEvent.ERROR,e=>{
    if(!accept())return;
    session.connected=false;
    session.state='Conexión perdida · se reintentará TikTok LIVE';
    session.retryAt=Date.now()+WATCH_RETRY_MS;
    add(session,{kind:'status',state:'retry',message:text(e?.info||'Reintentando con TikTok',160)});
  });
  try{
    const state=await connection.connect();
    if(!accept()){try{await connection.disconnect();}catch{}return;}
    session.roomId=String(state?.roomId||'');
    session.connected=true;
    session.state='Conectado a TikTok LIVE';
    session.retryAt=0;
    session.failures=0;
    add(session,{kind:'status',state:'connected',message:'LIVE confirmado por TikTok'});
  }catch(error){
    if(!accept())return;
    session.connected=false;
    session.failures=Math.min(10,(session.failures||0)+1);
    session.retryAt=Date.now()+Math.min(120_000,WATCH_RETRY_MS*session.failures);
    const message=text(error?.message||'Todavía no se pudo conectar con el LIVE.',160);
    session.state='Esperando LIVE · próxima comprobación automática';
    // Report this as an unavailable LIVE, never as connected.
    add(session,{kind:'status',state:'waiting',message:'LIVE no confirmado: '+message});
    try{await connection.disconnect();}catch{}
    if(session.conn===connection)session.conn=null;
  }finally{
    session.connecting=false;
  }
}
async function connect(key,username){
  const old=sessions.get(key);
  if(old&&old.username===username&&old.watching){
    old.activeAt=Date.now();
    return info(old);
  }
  if(old){
    sessions.delete(key);
    await stop(old,'Canal cambiado');
  }
  if(sessions.size>=MAX_ACTIVE)
    throw Object.assign(new Error('Límite temporal de transmisiones móviles alcanzado.'),{status:429});
  const session={
    username,watching:true,connected:false,connecting:false,
    state:'Preparando vigilancia de TikTok LIVE',activeAt:Date.now(),
    roomId:'',viewers:0,seq:0,events:[],conn:null,lastAttemptAt:0,retryAt:0,failures:0
  };
  sessions.set(key,session);
  await attemptConnection(session);
  return info(session);
}
setInterval(async()=>{
  for(const [key,session] of sessions){
    if(Date.now()-session.activeAt>IDLE_MS){
      sessions.delete(key);
      await stop(session,'Sesión móvil inactiva');
    }else if(session.watching&&!session.connected&&!session.connecting&&
             Date.now()>=(session.retryAt||0)){
      // Do not block other users on a slow TikTok handshake.
      void attemptConnection(session).catch(()=>{session.retryAt=Date.now()+WATCH_RETRY_MS;});
    }
  }
},CHECK_MS).unref();

const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/health'&&req.method==='GET'){
    return json(res,200,{ok:true,service:'GREÑA Mobile Relay BETA',activeSessions:sessions.size,
      platform:'tiktok',platforms:['tiktok'],pcServerModified:false});
  }
  if(!pathname.startsWith('/api/mobile/'))return json(res,404,{ok:false,error:'Ruta no encontrada'});
  const token=bearer(req);
  if(!token)return json(res,401,{ok:false,error:'Inicia sesión con GREÑA ID.'});
  let key;
  try{key=await verify(token);}
  catch(error){return json(res,error.status||503,{ok:false,error:error.status===401?'GREÑA ID inválido o vencido.':'No se pudo comprobar GREÑA ID.'});}
  const session=sessions.get(key);
  if(pathname==='/api/mobile/capabilities'&&req.method==='GET'){
    const platforms={tiktok:{
      name:'TikTok',auth:'public-live-connector',
      expectedEvents:['chat','follow','gift','share','likes','viewers'],
      adapterImplemented:true,serverRunning:true,
      liveConfirmed:session?.connected===true,
      state:session?.connected===true?'live':session?.watching===true?'watching':'not_connected'
    }};
    return json(res,200,{ok:true,platforms,server:'independent-node',usesRailway:false});
  }
  if(pathname==='/api/mobile/connect'&&req.method==='POST'){
    try {
      const body=await readBody(req);
      const platform=platformId(body.platform||'tiktok');
      if(platform!=='tiktok')return json(res,501,{ok:false,connected:false,
        platform,error:'GREÑA Mobile está en modo solo TikTok por ahora.'});
      const name=publicUsername(body.username||body.url);
      if(session?.lastConnectAt&&Date.now()-session.lastConnectAt<10_000&&session.username!==name)
        return json(res,429,{ok:false,error:'Espera antes de cambiar de canal.'});
      const result=await connect(key,name);
      return json(res,200,result);
    } catch(error){
      return json(res,error.status||400,{ok:false,connected:false,error:text(error.message,160)});
    }
  }
  if(pathname==='/api/mobile/events'&&req.method==='GET'){
    if(!session)return json(res,200,{ok:true,watching:false,connected:false,state:'No conectado',events:[],lastSeq:0});
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
