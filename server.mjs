import http from 'node:http';
import tls from 'node:tls';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, copyFile, unlink, access, rename, chmod, appendFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes, randomInt, createHash, createVerify, scryptSync, scrypt, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { TikTokLiveConnection, WebcastEvent, RoomIdRouteConfig, IsLiveRouteConfig } from 'tiktok-live-connector';
import { chromium } from 'playwright-core';

// GREÑA 3.1.7: evita los fallbacks premium de EulerStream para resolver Room ID / estado LIVE.
// La conexión de lectura usa primero las rutas públicas/directas de TikTok.
RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
IsLiveRouteConfig.skipFetchRoomIdFromEulerRoute = true;

const CLOUD_MODE=process.env.GRENA_CLOUD==='1';
const HOST=process.env.HOST||(CLOUD_MODE?'0.0.0.0':'127.0.0.1'), PORT=Number(process.env.PORT||8787), APP_ROOT=dirname(fileURLToPath(import.meta.url)), ROOT=APP_ROOT;
const PUBLIC_URL=String(process.env.GRENA_PUBLIC_URL||(process.env.RAILWAY_PUBLIC_DOMAIN?`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`:'')).trim().replace(/\/$/,'');
const BASE=PUBLIC_URL||`http://${HOST}:${PORT}`;

// ===== GREÑA FIX5: robustez y endurecimiento =====
// El proceso no debe morir por una petición/errores sueltos en pleno LIVE. El launcher captura stdout/stderr
// y además persistimos una copia de fallos de proceso dentro de la carpeta de datos cuando ya está disponible.
let PROCESS_ERROR_LOG='';
function logProcessFault(kind,e){
  const line=`[${new Date().toISOString()}] ${kind}: ${e?.stack||e?.message||String(e)}\n`;
  console.error(line.trim());
  if(PROCESS_ERROR_LOG)appendFile(PROCESS_ERROR_LOG,line,'utf8').catch(()=>{});
}
process.on('unhandledRejection',e=>logProcessFault('unhandledRejection',e));
process.on('uncaughtException',e=>logProcessFault('uncaughtException',e));
// Token aleatorio por arranque para el puente server<->chat. Lo genera el launcher; si se arranca
// server.mjs directamente se crea aquí y se hereda al proceso de chat que lanza server.mjs.
const BRIDGE_TOKEN=process.env.GRENA_BRIDGE_TOKEN||(process.env.GRENA_BRIDGE_TOKEN=randomBytes(24).toString('hex'));
const MAX_BODY_BYTES=1024*1024, MAX_AI_BODY_BYTES=9*1024*1024;
function bodyLimitFor(req){try{return new URL(String(req.url||'/'),'http://127.0.0.1').pathname==='/api/ai-alert'?MAX_AI_BODY_BYTES:MAX_BODY_BYTES}catch{return MAX_BODY_BYTES}}
function readBody(req,limit=bodyLimitFor(req)){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,over=false;
    req.on('data',c=>{if(over)return;const b=Buffer.isBuffer(c)?c:Buffer.from(c);size+=b.length;if(size>limit){over=true;chunks.length=0;return}chunks.push(b)});
    req.on('end',()=>{if(over){const e=new Error('El cuerpo de la petición es demasiado grande.');e.statusCode=413;reject(e)}else resolve(Buffer.concat(chunks).toString('utf8'))});
    req.on('error',reject);
    req.on('close',()=>{if(!req.complete)reject(new Error('Petición cancelada'))});
  });
}
const LOCAL_ORIGINS=new Set([`http://127.0.0.1:${PORT}`,`http://localhost:${PORT}`,'http://127.0.0.1:8788','http://localhost:8788']);
if(PUBLIC_URL)LOCAL_ORIGINS.add(PUBLIC_URL);
function requestHost(req){return String(req?.headers?.['x-forwarded-host']||req?.headers?.host||'').split(',')[0].trim().toLowerCase()}
function sameOriginRequest(req,origin){if(!origin)return true;try{return new URL(String(origin)).host.toLowerCase()===requestHost(req)}catch{return false}}
function localOriginOk(origin,req){return CLOUD_MODE?sameOriginRequest(req,origin):(!origin||LOCAL_ORIGINS.has(origin))}
const STATIC_EXT=new Set(['.html','.css','.js','.png','.jpg','.jpeg','.webp','.gif','.svg','.ico','.mp3','.wav','.ogg','.woff','.woff2','.ttf']);
// Lista blanca: solo archivos de la raíz con extensión web, o cualquier cosa dentro de /assets.
function resolveStaticFile(pathname){
  let rel;try{rel=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1))}catch{return null}
  if(!rel||rel.includes('\0')||rel.includes('\\'))return null;
  const parts=rel.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))return null;
  if(parts.length>1&&parts[0].toLowerCase()!=='assets')return null;
  if(!STATIC_EXT.has(extname(rel).toLowerCase()))return null;
  return rel;
}
function safeReqPath(u){return typeof u==='string'&&/^\/(?![\/\\])/.test(u)}
const OAUTH_BASE=PUBLIC_URL||`http://localhost:${PORT}`;
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg'};

// El servidor principal también levanta GREÑA Chat (8788). Así el multichat funciona
// incluso si el usuario ejecuta `node server.mjs` directamente en lugar de `npm start`.
let chatChild=null,chatEnsureTimer=null;
async function chatHealthy(){
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),900);
  try{const r=await fetch('http://127.0.0.1:8788/health',{cache:'no-store',signal:ac.signal});return r.ok}catch{return false}finally{clearTimeout(timer)}
}
async function ensureChatServer(){
  if(await chatHealthy())return true;
  if(chatChild && chatChild.exitCode===null)return false;
  try{
    chatChild=spawn(process.execPath,[join(APP_ROOT,'chat-server.mjs')],{cwd:APP_ROOT,windowsHide:true,stdio:'ignore',env:process.env});
    chatChild.once('exit',()=>{chatChild=null});
  }catch{chatChild=null}
  return false;
}
// Cuando GREÑA se abre con launcher.mjs, el launcher administra 8788 como servicio
// independiente. Si el usuario ejecuta `node server.mjs` manualmente, mantenemos
// el arranque de respaldo para que el chat también se levante.
const chatManagedByLauncher=process.env.GRENA_CHAT_MANAGED_BY_LAUNCHER==='1';
if(!chatManagedByLauncher){
  await ensureChatServer();
  chatEnsureTimer=setInterval(()=>ensureChatServer().catch(()=>{}),3000);
}
function stopOwnedChat(){if(chatEnsureTimer)clearInterval(chatEnsureTimer);try{chatChild?.kill()}catch{}}
function stopCamTunnelProcess(){try{camTunnelProcess?.kill()}catch{}}
// No anulamos la terminación normal del proceso: limpiamos hijos y dejamos terminar Node.
process.once('SIGINT',()=>{stopOwnedChat();stopCamTunnelProcess();process.exit(0)});
process.once('SIGTERM',()=>{stopOwnedChat();stopCamTunnelProcess();process.exit(0)});
process.once('exit',()=>{stopOwnedChat();stopCamTunnelProcess()});
// ===== Ciclo de vida de la ventana portable =====
// Solo se arma después de que la página principal/login envía su primer heartbeat.
// Una navegación interna cancela el cierre; cerrar la X deja expirar el aviso y apaga GREÑA.
let appWindowSeen=false,appWindowReadyNotified=false,appWindowLastHeartbeat=0,appWindowCloseTimer=null;
function notifyLauncher(type,extra={}){
  try{if(typeof process.send==='function'&&process.connected){process.send({type,...extra});return true}}catch{}
  return false;
}
function appWindowHeartbeat(){
  appWindowSeen=true;appWindowLastHeartbeat=Date.now();
  // Un heartbeat nuevo significa que la ventana sigue viva. Esto también cubre
  // navegación interna, reanudación tras suspensión de Windows y pausas temporales
  // del renderer por carga alta/TTS/WebRTC.
  if(appWindowCloseTimer){clearTimeout(appWindowCloseTimer);appWindowCloseTimer=null}
  if(!appWindowReadyNotified){appWindowReadyNotified=true;notifyLauncher('grena-app-window-ready')}
}
function requestFullShutdown(reason='ventana-cerrada'){
  console.log(`[GREÑA ciclo-vida] cierre solicitado: ${reason}`);
  if(notifyLauncher('grena-shutdown-request',{reason}))return;
  // Respaldo cuando server.mjs se ejecuta manualmente, sin launcher.
  stopOwnedChat();stopCamTunnelProcess();setTimeout(()=>process.exit(0),80);
}
function appWindowClosing(){
  // pagehide también puede ocurrir durante una navegación/reload. Damos margen
  // suficiente para que la página nueva vuelva a enviar heartbeat y cancele el cierre.
  if(appWindowCloseTimer)clearTimeout(appWindowCloseTimer);
  appWindowCloseTimer=setTimeout(()=>{
    appWindowCloseTimer=null;
    // Si hubo un heartbeat reciente, no era un cierre real de la app.
    if(appWindowLastHeartbeat && Date.now()-appWindowLastHeartbeat < 7000)return;
    requestFullShutdown('ventana-principal-cerrada');
  },10000);
}
// IMPORTANTE: no apagamos GREÑA solo porque falten heartbeats. Windows puede suspender
// el equipo, Edge puede congelar timers o una carga pesada puede pausar el renderer.
// Antes FIX7 interpretaba 12 s sin heartbeat como cierre y podía apagar la app sola.
// El cierre normal sigue cubierto por pagehide + appWindowClosing y por el botón Salir.

const status={tiktok:{connected:false,label:'No conectado'},twitch:{connected:false,label:'No conectado'},kick:{connected:false,label:'No conectado'}};
let tiktok=null,tiktokLoginContext=null,twitchWS=null,twitchCfg=null,twitchViewerTimer=null,twitchValidationTimer=null;
let counterTikTok=null,counterTikTokUser='',counterTikTokPollTimer=null,counterTikTokReconnectTimer=null,counterTikTokConnecting=false,counterTikTokLastSignalAt=0,counterTikTokPollFailures=0,tiktokBridgeDisconnectGraceTimer=null,counterTwitchLogin='',counterTwitchTimer=null;
const viewers={tiktok:0,twitch:0,kick:0};
const viewerMeta={tiktok:{lastGood:0,lastGoodAt:0,source:'waiting',zeroHits:0,lastZeroAt:0,spikeValue:0,spikeHits:0,spikeAt:0,spikeSources:[]},twitch:{lastGood:0,lastGoodAt:0,source:'waiting',zeroHits:0},kick:{lastGood:0,lastGoodAt:0,source:'waiting',zeroHits:0,lastZeroAt:0}};
const viewerTest={enabled:false,tiktok:0,twitch:0,kick:0};
let viewerTestTimer=null;
const clients=new Set(), oauthState=new Map(), twitchAvatarCache=new Map();
const camRooms=new Map(), camSocketMeta=new Map(), camRoomPeers=new Map(), camHostGraceTimers=new Map();
const TWITCH_SCOPES='moderator:read:followers channel:read:subscriptions bits:read moderator:manage:banned_users moderator:manage:chat_messages';
const KICK_SCOPES='user:read channel:read events:subscribe moderation:ban moderation:chat_message:manage kicks:read';
const twitchDeviceSessions=new Map();
// Datos persistentes fuera de la carpeta del programa. Así no se pierden al reemplazar/actualizar el ZIP.
// GREÑA LIVE 3.0: los datos del creador se separan por perfil. Las credenciales de la app
// (Client ID/Secret) siguen siendo globales y nunca tienen que escribirlas los usuarios finales.
const DATA_DIR=process.env.GRENA_DATA_DIR || join(process.env.APPDATA || join(homedir(),'AppData','Roaming'),'GREÑA LIVE PRO');
await mkdir(DATA_DIR,{recursive:true}).catch(()=>{});
const LOG_DIR=join(DATA_DIR,'logs');await mkdir(LOG_DIR,{recursive:true}).catch(()=>{});PROCESS_ERROR_LOG=join(LOG_DIR,'server-errors.log');
const PROFILES_DIR=join(DATA_DIR,'profiles');
const USERS_FILE=join(DATA_DIR,'grena-users.json');
const SESSIONS_FILE=join(DATA_DIR,'grena-sessions.json');
const ACTIVE_PROFILE_FILE=join(DATA_DIR,'active-profile.json');
const RECOVERY_FILE=join(DATA_DIR,'grena-recovery.json');
const CONFIG_FILE=join(DATA_DIR,'config.local.json');
const LEGACY_AUTH_FILE=join(DATA_DIR,'grena-auth.json');
const LEGACY_ALERTS_FILE=join(DATA_DIR,'grena-alert-designs.json');
const LEGACY_SOCIAL_FILE=join(DATA_DIR,'grena-social-gadget.json');
const LEGACY_AUTO_FILE=join(DATA_DIR,'grena-auto-connect.json');
await mkdir(PROFILES_DIR,{recursive:true}).catch(()=>{});
async function safeWriteJson(file,data){
  const text=JSON.stringify(data,null,2);
  JSON.parse(text);
  await mkdir(dirname(file),{recursive:true}).catch(()=>{});
  const tmp=`${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp,text,'utf8');
  try{await copyFile(file,`${file}.bak`)}catch{}
  try{await copyFile(tmp,file)}finally{await unlink(tmp).catch(()=>{})}
}
async function readJsonWithLegacy(primary,legacy,fallback={}){
  try{return JSON.parse(await readFile(primary,'utf8'))}catch{}
  try{const data=JSON.parse(await readFile(legacy,'utf8'));await safeWriteJson(primary,data).catch(()=>{});return data}catch{}
  return fallback;
}
async function readJson(file,fallback={}){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}

// ===== CATÁLOGO UNIVERSAL DE APOYOS / REGALOS =====
// TikTok: catálogo regional DO (metadatos + iconos estáticos) con caché local.
// Twitch: Cheermotes oficiales desde Helix cuando la cuenta está vinculada.
// Kick: niveles base + Gifts reales observados por el webhook kicks.gifted.
const GIFT_CATALOG_CACHE_FILE=join(DATA_DIR,'gift-catalog-cache.json');
const TIKTOK_GIFT_SOURCE_URL='https://beetgames.com/tiktok-gifts.json';
const TIKTOK_GIFT_IMAGE_BASE='https://beetgames.com';
const KICK_GIFT_ICON_BASE='/assets/kick-gifts';
const GIFT_CATALOG_REFRESH_MS=6*60*60*1000;
const TIKTOK_GIFT_ES={
 'rose':'Rosa','white rose':'Rosa blanca','finger heart':'Corazón con dedos','heart':'Corazón','heart me':'Corazón para mí','thumbs up':'Pulgar arriba','ice cream cone':'Cono de helado','cake slice':'Porción de pastel','birthday cake':'Pastel de cumpleaños','coffee':'Café','balloons':'Globos','chocolate':'Chocolate','friendship necklace':'Collar de amistad','perfume':'Perfume','doughnut':'Dona','cap':'Gorra','confetti':'Confeti','game controller':'Control de videojuego','hand hearts':'Corazones con las manos','sunglasses':'Gafas de sol','star goggles':'Gafas de estrella','music album':'Álbum de música','music bubbles':'Burbujas musicales','rose hand':'Mano con rosa','rose bear':'Oso de rosas','candy bouquet':'Ramo de dulces','boxing gloves':'Guantes de boxeo','butterfly for you':'Mariposa para ti','tiktok crown':'Corona de TikTok','live ranking crown':'Corona de clasificación LIVE','air dancer':'Bailarín inflable','night star':'Estrella nocturna','guitar':'Guitarra','panda climb':'Panda escalador','panda hug':'Abrazo de panda','fireworks':'Fuegos artificiales','firework':'Fuego artificial','money gun':'Pistola de dinero','galaxy':'Galaxia','lion':'León','tiktok universe':'Universo TikTok','paper crane':'Grulla de papel','little crown':'Corona pequeña','love glasses':'Gafas de amor','love painting':'Pintura de amor','marked with love':'Marcado con amor','mark of love':'Marca de amor','forever rosa':'Rosa para siempre','flower headband':'Diadema de flores','gold medal':'Medalla de oro','magic genie':'Genio mágico','tulip box':'Caja de tulipanes','cheer mic':'Micrófono de ánimo','dreamy strings':'Cuerdas de ensueño','forest elf':'Elfo del bosque','music mate':'Compañero musical','rock star':'Estrella de rock','united heart':'Corazón unido','super gg':'Súper GG','bravo!':'¡Bravo!','so cute':'Qué lindo','you\'re awesome':'Eres increíble','love you':'Te quiero','love you so much':'Te quiero mucho','congratulations':'Felicitaciones','maracas':'Maracas','glow stick':'Barra luminosa','team bracelet':'Pulsera de equipo','wave firework':'Fuego artificial de ola','cheer you up':'Animarte','super popular':'Súper popular','heart gaze':'Mirada de corazón','lucky pony':'Poni de la suerte','slow motion':'Cámara lenta','style me up':'Cámbiame el estilo','bubble gum':'Chicle','hat and mustache':'Sombrero y bigote','level-up sparks':'Chispas de nivel','greeting heart':'Corazón de saludo','balloon crown':'Corona de globos','big shout out':'Gran saludo','love call':'Llamada de amor','melody glasses':'Gafas musicales','play for you':'Tocar para ti','puppy kisses':'Besos de cachorro','spring bouquet':'Ramo de primavera','blossom fairy':'Hada de flores','confetti bear':'Oso de confeti'
};
function giftTextKey(v){return String(v||'').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ')}
function tiktokGiftSpanishName(name){const raw=String(name||'').trim();return TIKTOK_GIFT_ES[giftTextKey(raw)]||raw}
function catalogPlatform(v){const p=String(v||'').toLowerCase();return p==='tiktok'?'TikTok':p==='twitch'?'Twitch':p==='kick'?'Kick':String(v||'')}
function catalogItemKey(x={}){const p=catalogPlatform(x.platform);const id=String(x.id||'').trim();if(id)return `${p}|id:${id}`;return `${p}|name:${giftTextKey(x.name||x.nameEs)}|${Number(x.amount||0)||0}|${String(x.unit||'')}`}
function normalizeCatalogItem(x={}){
 const platform=catalogPlatform(x.platform),name=String(x.name||x.nameEs||'Apoyo').trim(),nameEs=String(x.nameEs||(platform==='TikTok'?tiktokGiftSpanishName(name):name)).trim();
 return {platform,id:String(x.id||''),name,nameEs,category:String(x.category||'gift'),giftKind:String(x.giftKind||''),amount:Math.max(0,Number(x.amount||0)||0),unit:String(x.unit||''),image:String(x.image||''),animatedImage:String(x.animatedImage||''),source:String(x.source||'GREÑA'),region:String(x.region||''),observed:!!x.observed,updatedAt:Number(x.updatedAt||Date.now()),meta:x.meta&&typeof x.meta==='object'?x.meta:{}};
}
let giftCatalogCache=await readJson(GIFT_CATALOG_CACHE_FILE,{version:1,updatedAt:0,sources:{},items:[]});
if(!giftCatalogCache||typeof giftCatalogCache!=='object')giftCatalogCache={version:1,updatedAt:0,sources:{},items:[]};
if(!Array.isArray(giftCatalogCache.items))giftCatalogCache.items=[];
if(!giftCatalogCache.sources||typeof giftCatalogCache.sources!=='object')giftCatalogCache.sources={};
giftCatalogCache.items=giftCatalogCache.items.map(normalizeCatalogItem);
let giftCatalogSaveTimer=null;
function scheduleGiftCatalogSave(){if(giftCatalogSaveTimer)return;giftCatalogSaveTimer=setTimeout(async()=>{giftCatalogSaveTimer=null;giftCatalogCache.updatedAt=Date.now();await safeWriteJson(GIFT_CATALOG_CACHE_FILE,giftCatalogCache).catch(e=>console.warn('Catálogo regalos:',e?.message||e))},400)}
function upsertCatalogItem(raw,{preferName=false}={}){
 const item=normalizeCatalogItem(raw);let i=giftCatalogCache.items.findIndex(x=>catalogItemKey(x)===catalogItemKey(item));
 if(i<0&&preferName)i=giftCatalogCache.items.findIndex(x=>x.platform===item.platform&&giftTextKey(x.name)===giftTextKey(item.name));
 if(i<0){giftCatalogCache.items.push(item);scheduleGiftCatalogSave();return item}
 const old=giftCatalogCache.items[i];const merged=normalizeCatalogItem({...old,...item,name:old.name||item.name,nameEs:item.nameEs||old.nameEs,image:item.image||old.image,animatedImage:item.animatedImage||old.animatedImage,observed:old.observed||item.observed,meta:{...(old.meta||{}),...(item.meta||{})}});giftCatalogCache.items[i]=merged;scheduleGiftCatalogSave();return merged;
}
function ensureBuiltInGiftCatalog(){
 const now=Date.now();
 if(!giftCatalogCache.items.some(x=>x.platform==='TikTok')){
  const fallback=[
   ['Cake Slice',1],['Club Cheers',1],['Congratulations',1],['Creeper',1],['Freestyle',1],['GG',1],['Glow Stick',1],['Go Popular',1],['Guardian Wings',1],['Heart',1],['Heart Me',1],['Ice Cream Cone',1],["It's corn",1],['Love you',1],['Love you so much',1],['Maracas',1],['Music Album',1],['Oldies',1],['Pop',1],['Rose',1],['So Cute',1],['Thumbs Up',1],['TikTok',1],['White Rose',1],['Wink Charm',1],['Wink wink',1],["You're awesome",1],['Team Bracelet',2],['Finger Heart',5],['Wave Firework',5],['Cheer You Up',9],['Club Power',9],['Super Popular',9],['Balloons',10],['Chocolate',10],['Friendship Necklace',10],['Furious Fire',10],['Heart Gaze',10],['Lucky Pony',10],['Rosa',10],['Bravo!',15],['Perfume',20],['Capybara',30],['Doughnut',30],['Bubble Gum',99],['Cap',99],['Hat and Mustache',99],['Little Crown',99],['Confetti',100],['Game Controller',100],['Hand Hearts',100],['Super GG',100],['Gold Medal',200],['Rose Bear',214],['Candy Bouquet',249],['Cheer Mic',249],['Star Goggles',249],['Boxing Gloves',299],['Butterfly for You',299],['LIVE Ranking Crown',299],['Music Mate',299],['Rock Star',299],['TikTok Crown',299],['United Heart',299],['Air Dancer',300],['Sunglasses',199],['Night Star',199]
  ];
  for(const [name,coins] of fallback){const slug=giftTextKey(name).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');upsertCatalogItem({platform:'TikTok',id:`fallback:${slug}`,name,nameEs:tiktokGiftSpanishName(name),category:'gift',giftKind:'tiktok-gift',amount:coins,unit:'coins',image:`${TIKTOK_GIFT_IMAGE_BASE}/images/gifts/${slug}.webp`,source:'GREÑA fallback',region:'DO',updatedAt:now})}
 }
 for(const amount of [1,10,50,100,500,1000,2000,5000,10000,50000])upsertCatalogItem({platform:'Kick',id:`kicks:${amount}`,name:`${amount.toLocaleString('en-US')} KICKs`,nameEs:`${amount.toLocaleString('es-DO')} KICKs`,category:'support',giftKind:'kicks',amount,unit:'KICKs',image:`${KICK_GIFT_ICON_BASE}/kicks-${amount}.svg`,source:'GREÑA · visual Kick',updatedAt:now});
 upsertCatalogItem({platform:'Kick',id:'subscription-gift',name:'Gifted subscription',nameEs:'Suscripción regalada',category:'subscription',giftKind:'subscription',amount:1,unit:'sub',image:`${KICK_GIFT_ICON_BASE}/subscription-gift.svg`,source:'GREÑA · visual Kick',updatedAt:now});
 for(const amount of [1,100,500,1000,5000,10000,100000])upsertCatalogItem({platform:'Twitch',id:`bits:${amount}`,name:`${amount.toLocaleString('en-US')} Bits`,nameEs:`${amount.toLocaleString('es-DO')} Bits`,category:'bits',giftKind:'bits',amount,unit:'bits',source:'Twitch',updatedAt:now});
 for(const tier of ['Tier 1','Tier 2','Tier 3'])upsertCatalogItem({platform:'Twitch',id:`sub:${tier.toLowerCase().replace(/\s+/g,'-')}`,name:`Gifted subscription · ${tier}`,nameEs:`Suscripción regalada · ${tier}`,category:'subscription',giftKind:'subscription',amount:1,unit:'sub',source:'Twitch',updatedAt:now});
}
ensureBuiltInGiftCatalog();
const socialDefaults={tiktokUser:'',twitchUser:'',kickUser:'',fontFamily:'Segoe UI',fontSize:34,iconSize:46,textColor:'#ffffff',accent:'#22d3ee',panelOpacity:78,holdSeconds:4,transitionSeconds:0.65,style:'glass',uppercase:false,showAt:true};
const autoDefaults={enabled:true,counterTikTok:'',counterTwitch:'',counterKick:'',counterTikTokEnabled:false,counterTwitchEnabled:false,counterKickEnabled:false,counterStyle:'classic',counterCardColor:'#18232c',alertStyle:'classic'};
let usersStore=await readJson(USERS_FILE,{version:1,users:[]});
if(!Array.isArray(usersStore.users))usersStore={version:1,users:[]};
let sessionsStore=await readJson(SESSIONS_FILE,{version:1,sessions:{}});
if(!sessionsStore.sessions||typeof sessionsStore.sessions!=='object')sessionsStore={version:1,sessions:{}};
let recoveryStore=await readJson(RECOVERY_FILE,{version:1,requests:{}});
if(!recoveryStore.requests||typeof recoveryStore.requests!=='object')recoveryStore={version:1,requests:{}};
const recoveryRate=new Map();
let activeUserId=String((await readJson(ACTIVE_PROFILE_FILE,{})).userId||'');
if(activeUserId&&!usersStore.users.some(u=>u.id===activeUserId))activeUserId='';
function profileDir(userId=activeUserId){return userId?join(PROFILES_DIR,String(userId)):DATA_DIR}
function profileFile(name,userId=activeUserId){return join(profileDir(userId),name)}
function stateFile(name,legacy,userId=activeUserId){return userId?profileFile(name,userId):legacy}
function currentTikTokProfileDir(){return activeUserId?join(profileDir(),'tiktok-browser-profile'):join(DATA_DIR,'tiktok-browser-profile')}
function publicUser(u){return u?{id:u.id,username:u.username,displayName:u.displayName||u.username,createdAt:u.createdAt}:null}
function accountUser(u){return u?{...publicUser(u),email:u.email||'',recoveryEmailConfigured:!!u.email}:null}
function normalizeGrenaUsername(v){return String(v||'').trim().toLowerCase().replace(/[^a-z0-9_.-]/g,'').slice(0,32)}
function normalizeEmail(v){return String(v||'').trim().toLowerCase().slice(0,254)}
function validEmail(v){const e=normalizeEmail(v);return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)}
function maskEmail(v){const e=normalizeEmail(v),i=e.indexOf('@');if(i<1)return '';const a=e.slice(0,i),d=e.slice(i+1);return `${a.slice(0,Math.min(2,a.length))}${'*'.repeat(Math.max(2,Math.min(6,a.length-2)))}@${d}`}
function hashPassword(password,salt){return scryptSync(String(password),salt,64).toString('hex')}
function verifyPassword(password,user){try{const a=Buffer.from(hashPassword(password,user.salt),'hex'),b=Buffer.from(user.passwordHash,'hex');return a.length===b.length&&timingSafeEqual(a,b)}catch{return false}}
// ===== GREÑA FIX4: límite de intentos y scrypt asíncrono =====
// scryptSync bloqueaba todo el servidor (overlays incluidos) en cada intento. El login usa scrypt asíncrono
// (mismos parámetros, mismo hash) y hay bloqueo progresivo por usuario + tope global de intentos por minuto.
const scryptAsync=(pw,salt)=>new Promise((ok,ko)=>scrypt(String(pw),String(salt),64,(e,k)=>e?ko(e):ok(k)));
async function verifyPasswordAsync(password,user){try{const a=await scryptAsync(password,user.salt),b=Buffer.from(user.passwordHash,'hex');return a.length===b.length&&timingSafeEqual(a,b)}catch{return false}}
const DUMMY_SALT=randomBytes(16).toString('hex');
const loginRate=new Map(),authWindow=[];
function authThrottle(){const now=Date.now();while(authWindow.length&&now-authWindow[0]>60e3)authWindow.shift();if(authWindow.length>=30)return Math.ceil((60e3-(now-authWindow[0]))/1000);authWindow.push(now);return 0}
function loginLockedSeconds(key){const r=loginRate.get(key);return r&&r.until>Date.now()?Math.ceil((r.until-Date.now())/1000):0}
function loginFailed(key){const now=Date.now();let r=loginRate.get(key);if(!r||now-r.last>15*60e3)r={fails:0,until:0,last:now};r.fails++;r.last=now;if(r.fails>=5)r.until=now+Math.min(15*60e3,30e3*2**(r.fails-5));loginRate.set(key,r)}
function tooMany(res,secs){res.setHeader('Retry-After',String(secs));return json(res,429,{ok:false,error:`Demasiados intentos. Espera ${secs>=60?Math.ceil(secs/60)+' min':secs+' s'} e inténtalo de nuevo.`})}
function sessionHash(token){return createHash('sha256').update(String(token||'')).digest('hex')}
function codeHash(code,id){return createHash('sha256').update(`${id}:${String(code||'')}`).digest('hex')}
function parseCookies(req){const out=Object.create(null),dec=x=>{try{return decodeURIComponent(x)}catch{return x}};for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)out[dec(part.slice(0,i).trim())]=dec(part.slice(i+1).trim())}return out}
function sessionUser(req){const token=parseCookies(req).grena_session;if(!token)return null;const rec=sessionsStore.sessions[sessionHash(token)];if(!rec||Number(rec.expiresAt||0)<Date.now())return null;return usersStore.users.find(u=>u.id===rec.userId)||null}
function purgeExpiredSessions(){const now=Date.now();let n=0;for(const [k,v] of Object.entries(sessionsStore.sessions||{}))if(!v||Number(v.expiresAt||0)<now){delete sessionsStore.sessions[k];n++}return n}
async function purgeSessionsAndPersist(){try{if(purgeExpiredSessions())await safeWriteJson(SESSIONS_FILE,sessionsStore);const now=Date.now();for(const [k,r] of loginRate)if(now-r.last>30*60e3)loginRate.delete(k)}catch(e){console.warn('Purga de sesiones:',e?.message||e)}}
async function createSession(res,user){const token=randomBytes(32).toString('base64url'),expiresAt=Date.now()+30*24*60*60*1000;/* GREÑA es de perfil activo único: invalida sesiones anteriores para que una pestaña vieja no controle otro perfil. */sessionsStore.sessions={};sessionsStore.sessions[sessionHash(token)]={userId:user.id,expiresAt};await safeWriteJson(SESSIONS_FILE,sessionsStore);res.setHeader('Set-Cookie',`grena_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30*24*60*60}${CLOUD_MODE?'; Secure':''}`);return token}
async function destroySession(req,res){const token=parseCookies(req).grena_session;if(token)delete sessionsStore.sessions[sessionHash(token)];await safeWriteJson(SESSIONS_FILE,sessionsStore).catch(()=>{});res.setHeader('Set-Cookie',`grena_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${CLOUD_MODE?'; Secure':''}`)}
async function migrateLegacyIntoProfile(userId){
  const copies=[
    [LEGACY_AUTH_FILE,profileFile('auth.json',userId)],
    [LEGACY_ALERTS_FILE,profileFile('alert-designs.json',userId)],
    [LEGACY_SOCIAL_FILE,profileFile('social.json',userId)],
    [LEGACY_AUTO_FILE,profileFile('auto-connect.json',userId)],
    [join(DATA_DIR,'grena-chat-connections.json'),profileFile('chat-connections.json',userId)],
    [join(APP_ROOT,'multichat-settings.json'),profileFile('chat-settings.json',userId)]
  ];
  await mkdir(profileDir(userId),{recursive:true});
  for(const [src,dst] of copies){try{await readFile(dst);continue}catch{}try{await copyFile(src,dst)}catch{}}
  // Solo el primer perfil puede importar el antiguo localStorage del chat de voz.
  await writeFile(profileFile('migrate-legacy-chat.flag',userId),'1','utf8').catch(()=>{});
}
let savedAuth={},savedAlertDesigns={},socialSettings={...socialDefaults},autoPrefs={...autoDefaults};

// ===== GREÑA FIDELIDAD · ESTADO =====
const loyaltyDefaults={rotateSeconds:8,topN:5,activeWindowMinutes:10};
let loyaltyState={version:1,settings:{...loyaltyDefaults},users:{tiktok:{},twitch:{},kick:{}}};
const loyaltyRuntime=new Map();

async function loadProfileState(userId=activeUserId){
  activeUserId=String(userId||'');
  if(activeUserId)await mkdir(profileDir(),{recursive:true}).catch(()=>{});
  savedAuth=activeUserId?await readJson(profileFile('auth.json'),{}):await readJsonWithLegacy(LEGACY_AUTH_FILE,join(ROOT,'.grena-auth.json'),{});
  savedAlertDesigns=activeUserId?await readJson(profileFile('alert-designs.json'),{}):await readJsonWithLegacy(LEGACY_ALERTS_FILE,join(ROOT,'.grena-alert-designs.json'),{});
  socialSettings={...socialDefaults,...(activeUserId?await readJson(profileFile('social.json'),{}):await readJsonWithLegacy(LEGACY_SOCIAL_FILE,join(ROOT,'.grena-social-gadget.json'),{}))};
  autoPrefs={...autoDefaults,...(activeUserId?await readJson(profileFile('auto-connect.json'),{}):await readJson(LEGACY_AUTO_FILE,{}))};
  const savedLoyalty=activeUserId?await readJson(profileFile('loyalty.json'),{}):{};
  loyaltyState={version:1,settings:{...loyaltyDefaults,...(savedLoyalty.settings||{})},users:{tiktok:{...(savedLoyalty.users?.tiktok||{})},twitch:{...(savedLoyalty.users?.twitch||{})},kick:{...(savedLoyalty.users?.kick||{})}}};
  loyaltyRuntime.clear();
  await safeWriteJson(ACTIVE_PROFILE_FILE,{userId:activeUserId,updatedAt:Date.now()}).catch(()=>{});
}
await loadProfileState(activeUserId);
async function persistAutoPrefs(){await safeWriteJson(stateFile('auto-connect.json',LEGACY_AUTO_FILE),autoPrefs).catch(()=>{})}
let oauthConfig={auth:{},tiktok:{},twitch:{},kick:{},openai:{},mail:{}};
oauthConfig={...oauthConfig,...await readJsonWithLegacy(CONFIG_FILE,join(ROOT,'config.local.json'),{})};
const packagedPublicConfig=await readJson(join(APP_ROOT,'grena-public-config.json'),{});
// Variables de entorno opcionales
Object.assign(oauthConfig.tiktok,{clientKey:process.env.TIKTOK_CLIENT_KEY||oauthConfig.tiktok.clientKey,clientSecret:process.env.TIKTOK_CLIENT_SECRET||oauthConfig.tiktok.clientSecret,researchClientKey:process.env.TIKTOK_RESEARCH_CLIENT_KEY||oauthConfig.tiktok.researchClientKey,researchClientSecret:process.env.TIKTOK_RESEARCH_CLIENT_SECRET||oauthConfig.tiktok.researchClientSecret});
Object.assign(oauthConfig.twitch,{clientId:process.env.TWITCH_CLIENT_ID||oauthConfig.twitch.clientId||packagedPublicConfig.twitchClientId,clientSecret:process.env.TWITCH_CLIENT_SECRET||oauthConfig.twitch.clientSecret});
Object.assign(oauthConfig.kick,{clientId:process.env.KICK_CLIENT_ID||oauthConfig.kick.clientId,clientSecret:process.env.KICK_CLIENT_SECRET||oauthConfig.kick.clientSecret,slug:process.env.KICK_CHANNEL||oauthConfig.kick.slug});
Object.assign(oauthConfig.openai,{apiKey:process.env.OPENAI_API_KEY||oauthConfig.openai?.apiKey});
Object.assign(oauthConfig.mail,{
  provider:process.env.GRENA_MAIL_PROVIDER||oauthConfig.mail?.provider||'gmail',
  apiKey:process.env.RESEND_API_KEY||process.env.GRENA_MAIL_API_KEY||oauthConfig.mail?.apiKey,
  from:process.env.GRENA_MAIL_FROM||oauthConfig.mail?.from,
  name:process.env.GRENA_MAIL_NAME||oauthConfig.mail?.name||'GREÑA ID',
  gmailUser:process.env.GRENA_GMAIL_USER||oauthConfig.mail?.gmailUser,
  gmailAppPassword:process.env.GRENA_GMAIL_APP_PASSWORD||oauthConfig.mail?.gmailAppPassword
});

// GREÑA Auth central: los usuarios finales nunca escriben Client ID ni Client Secret.
// El propietario de GREÑA configura esta URL una sola vez antes de distribuir la aplicación.
const AUTH_SERVICE_URL=String(process.env.GRENA_AUTH_URL||oauthConfig.auth?.serviceUrl||packagedPublicConfig.authServiceUrl||'').trim().replace(/\/+$/,'');
let authService={configured:!!AUTH_SERVICE_URL,reachable:false,providers:{},lastError:'',checkedAt:0};
function isBrokerProvider(p){return !!(AUTH_SERVICE_URL&&authService.providers?.[p]?.enabled)}
async function authServiceFetch(path,opts={}){
 if(!AUTH_SERVICE_URL)throw Error('GREÑA Auth todavía no está configurado por el administrador de la aplicación.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);let r;try{r=await fetch(AUTH_SERVICE_URL+path,{...opts,signal:opts.signal||controller.signal,headers:{'accept':'application/json',...(opts.headers||{})}})}finally{clearTimeout(timer)};
 const text=await r.text();let d={};try{d=text?JSON.parse(text):{}}catch{d={error:text}}
 if(!r.ok)throw Error(d.error||d.message||`GREÑA Auth HTTP ${r.status}`);return d;
}
async function loadAuthServiceConfig(){
 if(!AUTH_SERVICE_URL){authService={configured:false,reachable:false,providers:{},lastError:'Falta GRENA_AUTH_URL',checkedAt:Date.now()};return authService}
 try{
  const d=await authServiceFetch('/v1/config');
  authService={configured:true,reachable:true,providers:d.providers||{},lastError:'',checkedAt:Date.now()};
  // Los IDs son públicos; solo se mantienen en memoria para cabeceras API. Los secrets jamás llegan al PC del usuario.
  if(d.providers?.tiktok?.clientKey)oauthConfig.tiktok={...(oauthConfig.tiktok||{}),clientKey:d.providers.tiktok.clientKey};
  if(d.providers?.twitch?.clientId)oauthConfig.twitch={...(oauthConfig.twitch||{}),clientId:d.providers.twitch.clientId};
  if(d.providers?.kick?.clientId)oauthConfig.kick={...(oauthConfig.kick||{}),clientId:d.providers.kick.clientId};
 }catch(e){authService={configured:true,reachable:false,providers:{},lastError:e?.message||String(e),checkedAt:Date.now()}}
 return authService;
}
await loadAuthServiceConfig();
function normalizeKickSlug(value=''){const raw=String(value||'').trim();const m=raw.match(/kick\.com\/([^/?#]+)/i);return (m?.[1]||raw).replace(/^@/,'').trim()}
function currentKickSlug(){return normalizeKickSlug(savedAuth.kick?.slug||savedAuth.kick?.username||autoPrefs.counterKick||oauthConfig.kick?.slug||'')}
function mailConfigured(){
 const m=oauthConfig.mail||{},provider=String(m.provider||'gmail').toLowerCase();
 if(provider==='gmail')return !!(m.gmailUser&&m.gmailAppPassword);
 if(provider==='resend')return !!(m.apiKey&&m.from);
 return false;
}
function htmlEscape(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function smtpHeaderEncode(value=''){return '=?UTF-8?B?'+Buffer.from(String(value),'utf8').toString('base64')+'?='}
function createSmtpReader(socket){
 let buffer='',current=[],responses=[],waiters=[],failed=null;
 const settle=reply=>{
   if(waiters.length)waiters.shift().resolve(reply);
   else responses.push(reply);
 };
 const fail=err=>{
   failed=err instanceof Error?err:new Error(String(err||'Error SMTP'));
   while(waiters.length)waiters.shift().reject(failed);
 };
 socket.on('data',chunk=>{
   buffer+=chunk.toString('utf8');
   for(;;){
     const i=buffer.indexOf('\r\n');
     if(i<0)break;
     const line=buffer.slice(0,i);buffer=buffer.slice(i+2);
     if(!line)continue;
     current.push(line);
     const m=line.match(/^(\d{3})([ -])/);
     if(m&&m[2]===' '){
       const code=Number(m[1]),text=current.join('\n');current=[];
       settle({code,text});
     }
   }
 });
 socket.on('error',fail);
 socket.on('close',()=>{if(waiters.length)fail(new Error('La conexión SMTP se cerró antes de tiempo.'))});
 return {
   read(){
     if(responses.length)return Promise.resolve(responses.shift());
     if(failed)return Promise.reject(failed);
     return new Promise((resolve,reject)=>waiters.push({resolve,reject}));
   }
 };
}
async function gmailSmtpCommand(socket,reader,command,expected){
 if(command!==null)socket.write(command+'\r\n');
 const reply=await reader.read();
 const ok=(Array.isArray(expected)?expected:[expected]).includes(reply.code);
 if(!ok)throw Error('Gmail SMTP rechazó la operación ('+reply.code+').');
 return reply;
}
async function sendRecoveryEmailViaGmail(user,code,m){
 const gmailUser=String(m.gmailUser||'').trim();
 const appPassword=String(m.gmailAppPassword||'').replace(/\s+/g,'');
 if(!gmailUser||!appPassword)throw Error('Falta configurar el Gmail de recuperación de GREÑA.');

 const socket=tls.connect({host:'smtp.gmail.com',port:465,servername:'smtp.gmail.com',rejectUnauthorized:true});
 const reader=createSmtpReader(socket);
 await new Promise((resolve,reject)=>{
   if(socket.authorized||socket.encrypted&&socket.readyState==='open')return resolve();
   socket.once('secureConnect',resolve);
   socket.once('error',reject);
 });
 try{
   await gmailSmtpCommand(socket,reader,null,220);
   await gmailSmtpCommand(socket,reader,'EHLO grenalive',250);
   await gmailSmtpCommand(socket,reader,'AUTH LOGIN',334);
   await gmailSmtpCommand(socket,reader,Buffer.from(gmailUser).toString('base64'),334);
   await gmailSmtpCommand(socket,reader,Buffer.from(appPassword).toString('base64'),235);
   await gmailSmtpCommand(socket,reader,'MAIL FROM:<'+gmailUser.replace(/[<>\r\n]/g,'')+'>',250);
   await gmailSmtpCommand(socket,reader,'RCPT TO:<'+String(user.email).replace(/[<>\r\n]/g,'')+'>',[250,251]);
   await gmailSmtpCommand(socket,reader,'DATA',354);

   const fromName=String(m.name||'GREÑA ID').replace(/[\r\n<>]/g,'').trim()||'GREÑA ID';
   const subject=smtpHeaderEncode('Código para recuperar tu GREÑA ID');
   const username=htmlEscape(user.username),safeCode=htmlEscape(code);
   const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#141722"><h2 style="margin:0 0 14px">Recuperación de GREÑA ID</h2><p>Recibimos una solicitud para recuperar tu cuenta.</p><p><b>Usuario:</b> ${username}</p><p style="font-size:30px;letter-spacing:6px;font-weight:800;background:#f4f2ff;padding:16px 18px;border-radius:12px;text-align:center">${safeCode}</p><p>Este código vence en <b>10 minutos</b> y solo se puede usar una vez.</p><p style="color:#666">GREÑA nunca te enviará tu contraseña anterior. Si no pediste este código, ignora este mensaje.</p></div>`;
   const message=[
     'From: '+smtpHeaderEncode(fromName)+' <'+gmailUser.replace(/[<>\r\n]/g,'')+'>',
     'To: <'+String(user.email).replace(/[<>\r\n]/g,'')+'>',
     'Subject: '+subject,
     'Date: '+new Date().toUTCString(),
     'MIME-Version: 1.0',
     'Content-Type: text/html; charset=UTF-8',
     'Content-Transfer-Encoding: 8bit',
     '',
     html
   ].join('\r\n').replace(/\r\n\./g,'\r\n..');

   socket.write(message+'\r\n.\r\n');
   const sent=await reader.read();
   if(sent.code!==250)throw Error('Gmail SMTP no aceptó el correo ('+sent.code+').');
   try{await gmailSmtpCommand(socket,reader,'QUIT',221)}catch{}
   return {ok:true,provider:'gmail'};
 }finally{
   try{socket.end()}catch{}
 }
}
async function sendRecoveryEmail(user,code){
 const m=oauthConfig.mail||{};if(!mailConfigured())throw Error('El correo de recuperación todavía no está configurado por el administrador de GREÑA.');
 const provider=String(m.provider||'gmail').toLowerCase();
 if(provider==='gmail')return sendRecoveryEmailViaGmail(user,code,m);

 const fromName=String(m.name||'GREÑA ID').replace(/[\r\n<>]/g,'').trim()||'GREÑA ID';
 const from=`${fromName} <${String(m.from).trim()}>`;
 const subject='Código para recuperar tu GREÑA ID';
 const username=htmlEscape(user.username),safeCode=htmlEscape(code);
 const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#141722"><h2 style="margin:0 0 14px">Recuperación de GREÑA ID</h2><p>Recibimos una solicitud para recuperar tu cuenta.</p><p><b>Usuario:</b> ${username}</p><p style="font-size:30px;letter-spacing:6px;font-weight:800;background:#f4f2ff;padding:16px 18px;border-radius:12px;text-align:center">${safeCode}</p><p>Este código vence en <b>10 minutos</b> y solo se puede usar una vez.</p><p style="color:#666">GREÑA nunca te enviará tu contraseña anterior. Si no pediste este código, ignora este mensaje.</p></div>`;
 const text=`Recuperación GREÑA ID\n\nUsuario: ${user.username}\nCódigo: ${code}\n\nEl código vence en 10 minutos y solo se puede usar una vez. GREÑA nunca envía la contraseña anterior.`;
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${m.apiKey}`,'content-type':'application/json'},body:JSON.stringify({from,to:[user.email],subject,html,text,tags:[{name:'category',value:'password_reset'}]})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d?.message||d?.error?.message||`No se pudo enviar el correo (HTTP ${r.status}).`);return d;
}
async function persistRecovery(){await safeWriteJson(RECOVERY_FILE,recoveryStore)}
function clearExpiredRecovery(){const now=Date.now();for(const [id,r] of Object.entries(recoveryStore.requests||{}))if(!r||Number(r.expiresAt||0)<now||r.used)delete recoveryStore.requests[id]}
function invalidateUserSessions(userId){for(const [k,v] of Object.entries(sessionsStore.sessions||{}))if(v?.userId===userId)delete sessionsStore.sessions[k]}

function broadcast(payload){const m=JSON.stringify(payload);for(const ws of clients)if(ws.readyState===1)ws.send(m)}

// ===== GREÑA FIDELIDAD =====
// Ranking separado por plataforma. El "tiempo" es tiempo activo estimado entre señales del usuario,
// no tiempo de visualización exacto: TikTok/Twitch/Kick no exponen una identidad fiable de cada viewer silencioso.
function loyaltyPlatform(v=''){const p=String(v||'').toLowerCase();return p==='tiktok'?'tiktok':p==='twitch'?'twitch':p==='kick'?'kick':''}
function loyaltyKey(v=''){return String(v||'').trim().replace(/^@/,'').toLowerCase().slice(0,80)}
function loyaltyDay(ts=Date.now()){const d=new Date(ts);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function loyaltyLevel(score=0){const n=Number(score)||0;if(n>=6000)return {name:'Leyenda',icon:'★',next:null};if(n>=3000)return {name:'Diamante',icon:'◆',next:6000};if(n>=1500)return {name:'Platino',icon:'⬟',next:3000};if(n>=700)return {name:'Oro',icon:'●',next:1500};if(n>=250)return {name:'Plata',icon:'◈',next:700};return {name:'Bronce',icon:'◇',next:250}}
function publicLoyaltyUser(u={}){const score=Math.round((Number(u.score)||0)*10)/10;return {...u,score,level:loyaltyLevel(score)}}
function loyaltyTop(platform,limit=10){const p=loyaltyPlatform(platform);if(!p)return [];return Object.values(loyaltyState.users[p]||{}).map(publicLoyaltyUser).sort((a,b)=>(b.score-a.score)||(b.lastSeen-a.lastSeen)).slice(0,Math.max(1,Math.min(50,Number(limit)||10))).map((u,i)=>({...u,rank:i+1,platform:p}))}
function publicLoyaltyState(limit=10){return {settings:{...loyaltyState.settings},tops:{tiktok:loyaltyTop('tiktok',limit),twitch:loyaltyTop('twitch',limit),kick:loyaltyTop('kick',limit)},updatedAt:Date.now()}}
async function persistLoyalty(){if(activeUserId)await safeWriteJson(profileFile('loyalty.json'),loyaltyState).catch(()=>{})}
let loyaltySaveTimer=null;
function scheduleLoyaltySave(){clearTimeout(loyaltySaveTimer);loyaltySaveTimer=setTimeout(()=>persistLoyalty(),700)}
function pushLoyalty(){broadcast({type:'loyalty-update',loyalty:publicLoyaltyState(Math.max(10,loyaltyState.settings.topN||5))})}
function ensureLoyaltyUser(platform,user,nickname='',avatar=''){
 const p=loyaltyPlatform(platform),key=loyaltyKey(user||nickname);if(!p||!key)return null;
 const bucket=loyaltyState.users[p]||(loyaltyState.users[p]={});
 const u=bucket[key]||(bucket[key]={id:key,user:key,nickname:String(nickname||user||key).slice(0,80),avatar:String(avatar||''),score:0,firstSeen:Date.now(),lastSeen:0,activeDays:0,lastDay:'',stats:{minutes:0,comments:0,likes:0,shares:0,follows:0,subs:0,gifts:0,support:0,raids:0}});
 if(nickname)u.nickname=String(nickname).slice(0,80);if(avatar)u.avatar=String(avatar);u.stats=u.stats||{};return {p,key,u};
}
function loyaltyAdd(u,points,stat='',amount=1){const pts=Math.max(0,Number(points)||0);u.score=(Number(u.score)||0)+pts;if(stat)u.stats[stat]=(Number(u.stats[stat])||0)+(Number(amount)||0);return pts}
function estimateActiveTime(u,now){const last=Number(u.lastSeen||0);if(last>0){const mins=Math.min(Number(loyaltyState.settings.activeWindowMinutes||10),Math.max(0,(now-last)/60000));if(mins>=0.35){loyaltyAdd(u,mins*0.6,'minutes',mins)}}u.lastSeen=now}
function recordLoyaltyEvent(evt={}){
 const p=loyaltyPlatform(evt.platform),kind=String(evt.kind||evt.event||'').toLowerCase();
 const rec=ensureLoyaltyUser(p,evt.user||evt.name,evt.nickname||evt.name||evt.user,evt.avatar||'');if(!rec)return null;
 const {key,u}=rec,now=Date.now();estimateActiveTime(u,now);
 const day=loyaltyDay(now);if(u.lastDay!==day){u.lastDay=day;u.activeDays=(Number(u.activeDays)||0)+1;loyaltyAdd(u,10);}
 const runtimeKey=`${p}:${key}`,rt=loyaltyRuntime.get(runtimeKey)||{lastCommentAt:0,lastText:'',lastLikeAt:0};
 let awarded=0;
 if(kind==='chat'||kind==='comment'){
  const text=String(evt.text||'').trim().replace(/\s+/g,' ').toLowerCase();
  const same=text&&text===rt.lastText&&now-rt.lastCommentAt<120000;
  if(text&&!same&&now-rt.lastCommentAt>=18000){awarded+=loyaltyAdd(u,2.5,'comments',1);rt.lastCommentAt=now;rt.lastText=text}
 }else if(kind==='like'){
  const n=Math.max(1,Number(evt.amount??evt.likes??1)||1);u.stats.likes=(Number(u.stats.likes)||0)+n;
  // Rendimiento decreciente: 1 tap casi no pesa; una ráfaga grande suma, pero no domina el ranking.
  awarded+=loyaltyAdd(u,Math.min(8,0.28*Math.sqrt(n)), '',0);rt.lastLikeAt=now;
 }else if(kind==='share'){awarded+=loyaltyAdd(u,12,'shares',1)}
 else if(kind==='follow'){awarded+=loyaltyAdd(u,25,'follows',1)}
 else if(kind==='sub'||kind==='subscribe'){awarded+=loyaltyAdd(u,60,'subs',Math.max(1,Number(evt.count)||1))}
 else if(kind==='gift'||kind==='cheer'||kind==='support'){
  const count=Math.max(1,Number(evt.count)||1),value=Math.max(0,Number(evt.value??evt.totalDiamonds??evt.bits??evt.amount??0)||0);
  let pts=value>0?10+Math.min(80,4*Math.sqrt(value)):18+Math.min(50,count*8);
  awarded+=loyaltyAdd(u,pts,'gifts',count);u.stats.support=(Number(u.stats.support)||0)+value;
 }else if(kind==='raid'){
  const viewers=Math.max(0,Number(evt.viewers)||0);awarded+=loyaltyAdd(u,20+Math.min(80,3*Math.sqrt(viewers)),'raids',1)
 }else if(kind==='join'||kind==='presence'){awarded+=0}
 loyaltyRuntime.set(runtimeKey,rt);scheduleLoyaltySave();pushLoyalty();return {platform:p,user:key,awarded,score:u.score};
}


// ===== GREÑA RADAR · SOLO DATOS REALES =====
// Este módulo no usa números simulados. Cada métrica procede de APIs oficiales y el
// crecimiento se calcula comparando snapshots reales guardados por GREÑA.
// Si una fuente oficial no está configurada o no permite el tipo de consulta, devuelve
// "sin datos" en lugar de inventar un valor.

const RADAR_HISTORY_KEEP_MS=35*24*60*60*1000;
const RADAR_LATAM=['DO','MX','CO','AR','CL','PE','BR','VE','EC','GT','CU','BO','HT','HN','PY','SV','NI','CR','PA','UY','PR'];
const RADAR_STOPWORDS=new Set(('a al algo an and are as at con como de del el en es esta este esto for from gaming game games gameplay gaminglive hashtag i is la las live lo los mi my no of on para por que se sin su the to tu un una y yo you your shorts short video videos stream streaming twitch kick tiktok youtube oficial nuevo nueva ahora hoy ayer muy mas más todo todos todas uno dos tres vs').split(/\s+/));
const RADAR_NICHE_WORDS={
 'Gaming':['gaming','game','gameplay','gamer','videojuego','videogame'],
 'IRL / Vida real':['irl','vida','vlog','calle','daily','lifestyle'],
 'Just Chatting':['chatting','charla','podcast','talk','opinion','debate'],
 'Entretenimiento':['entertainment','entretenimiento','viral','challenge','reto'],
 'Humor / Comedia':['comedy','comedia','humor','meme','funny'],
 'Reacciones':['reaction','reaccion','reacción','react'],
 'Música':['music','musica','música','song','cancion','canción','cover'],
 'Baile':['dance','baile','coreografia','coreografía'],
 'Tecnología':['tech','tecnologia','tecnología','gadget','pc','phone'],
 'Inteligencia Artificial':['ai','ia','artificial intelligence','chatgpt'],
 'Educación / Tutoriales':['tutorial','howto','education','educacion','educación','aprende'],
 'Idiomas':['language','idioma','english','ingles','inglés','spanish','español'],
 'Ciencia':['science','ciencia','space','espacio'],
 'Historia / Curiosidades':['history','historia','curiosidad','facts'],
 'Deportes':['sports','deportes','sport'],
 'Fútbol':['football','soccer','futbol','fútbol'],
 'Fitness / Gimnasio':['fitness','gym','gimnasio','workout'],
 'Salud y Bienestar':['wellness','health','salud','bienestar'],
 'Cocina / Recetas':['food','cooking','cocina','receta','recipe'],
 'Belleza / Maquillaje':['beauty','makeup','belleza','maquillaje'],
 'Moda':['fashion','moda','outfit','style'],
 'Viajes':['travel','viaje','viajes','tourism'],
 'Naturaleza / Aventuras':['nature','naturaleza','adventure','aventura'],
 'Autos / Motor':['cars','car','autos','auto','motor'],
 'Anime / Manga':['anime','manga'],
 'Cine / Series':['movies','movie','cine','series','tv'],
 'Arte / Diseño':['art','arte','design','diseño'],
 'Fotografía / Video':['photography','fotografia','fotografía','camera','video'],
 'Mascotas':['pets','pet','mascotas','dog','cat'],
 'Negocios / Emprendimiento':['business','negocio','startup','emprendimiento'],
 'Finanzas personales':['finance','finanzas','money','dinero'],
 'Productividad':['productivity','productividad','focus'],
 'Motivación / Desarrollo personal':['motivation','motivacion','motivación','self improvement'],
 'Podcasts / Entrevistas':['podcast','interview','entrevista'],
 'ASMR':['asmr'],
 'DIY / Manualidades':['diy','craft','manualidades'],
 'Familia / Lifestyle':['family','familia','lifestyle'],
 'Noticias / Actualidad':['news','noticias','actualidad'],
 'Memes / Cultura de Internet':['meme','memes','internet','viral'],
 'Libros / Lectura':['books','book','libros','lectura']
};
const RADAR_LANGUAGE_BY_COUNTRY={
 DO:'es',MX:'es',CO:'es',AR:'es',CL:'es',PE:'es',VE:'es',EC:'es',GT:'es',CU:'es',BO:'es',HN:'es',
 PY:'es',SV:'es',NI:'es',CR:'es',PA:'es',UY:'es',PR:'es',ES:'es',BR:'pt',PT:'pt',US:'en',GB:'en',
 CA:'en',AU:'en',NZ:'en',FR:'fr',DE:'de',IT:'it',JP:'ja',KR:'ko',CN:'zh',TW:'zh',IN:'hi'
};
let radarTikTokToken='',radarTikTokTokenExp=0;

function radarNorm(v=''){
 return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function radarKey(v=''){return radarNorm(v).replace(/\s+/g,'-').slice(0,120)}
function radarWords(text=''){
 return radarNorm(text).split(/\s+/).filter(w=>w.length>=3&&!RADAR_STOPWORDS.has(w)&&!/^\d+$/.test(w));
}
function radarRegion(params={}){
 const mode=String(params.region||'Global');
 const country=String(params.country||'').toUpperCase();
 if(mode==='Estados Unidos')return {label:'Estados Unidos',countryCodes:['US'],languages:['en'],key:'US'};
 if(mode==='Latinoamérica')return {label:'Latinoamérica',countryCodes:RADAR_LATAM,languages:['es','pt'],key:'LATAM'};
 if(mode==='Otro país'&&country)return {label:country,countryCodes:[country],languages:[RADAR_LANGUAGE_BY_COUNTRY[country]].filter(Boolean),key:country};
 return {label:'Global',countryCodes:[],languages:[],key:'GLOBAL'};
}
function radarNicheWords(niche='Gaming'){return RADAR_NICHE_WORDS[niche]||[String(niche||'').toLowerCase()]}
function radarRelevant(text,niche){
 const t=radarNorm(text);
 if(!niche)return true;
 if(niche==='Gaming'){
  const obviousNonGaming=['just chatting','music','musica','sports','deportes','pools hot tubs','slots','casino','irl','art','arte','asmr','talk shows','podcast'];
  return !obviousNonGaming.some(k=>t.includes(radarNorm(k)));
 }
 return radarNicheWords(niche).some(k=>t.includes(radarNorm(k)));
}
function radarMetricLabel(platform){
 if(platform==='Twitch'||platform==='Kick')return 'viewers observados';
 if(platform==='TikTok')return 'vistas observadas';
 return 'actividad observada';
}
function radarFormatNumber(n){
 const x=Number(n)||0;
 if(x>=1e9)return `${(x/1e9).toFixed(x>=1e10?1:2)}B`;
 if(x>=1e6)return `${(x/1e6).toFixed(x>=1e7?1:2)}M`;
 if(x>=1e3)return `${(x/1e3).toFixed(x>=1e4?1:2)}K`;
 return String(Math.round(x));
}
function radarAdd(map,topic,metric=0,extra={}){
 const name=String(topic||'').trim();const key=radarKey(name);if(!key||name.length<2)return;
 const row=map.get(key)||{key,topic:name,metric:0,count:0,engagementNumerator:0,engagementDenominator:0,velocity:0,keywords:new Map()};
 row.metric+=Math.max(0,Number(metric)||0);row.count+=Number(extra.count||1);
 row.engagementNumerator+=Math.max(0,Number(extra.engagementNumerator)||0);
 row.engagementDenominator+=Math.max(0,Number(extra.engagementDenominator)||0);
 row.velocity+=Math.max(0,Number(extra.velocity)||0);
 for(const k of extra.keywords||[]){const w=String(k||'').trim();if(w)row.keywords.set(w,(row.keywords.get(w)||0)+1)}
 map.set(key,row);
}
function radarRows(map,limit=35){
 return [...map.values()].map(r=>({
  key:r.key,topic:r.topic,metric:Math.round(r.metric),count:r.count,
  engagementPct:r.engagementDenominator>0?Math.round((r.engagementNumerator/r.engagementDenominator)*10000)/100:null,
  velocity:Math.round(r.velocity),
  keywords:[...r.keywords.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0])
 })).sort((a,b)=>(b.metric-a.metric)||(b.velocity-a.velocity)).slice(0,limit);
}
function radarSourceError(platform,error,coverage=''){
 return {platform,ok:false,source:'API oficial',coverage,error:String(error?.message||error||'Fuente no disponible'),sampleCount:0,items:[],observedAt:Date.now()};
}
async function radarFetchTwitch(params){
 const platform='Twitch',region=radarRegion(params),token=savedAuth.twitch?.access_token;
 if(!token)throw Error('Conecta Twitch en GREÑA para consultar Helix.');
 if(!oauthConfig.twitch?.clientId)throw Error('Falta el Client ID público de Twitch.');
 const cfg={token};const streams=[];const languages=region.languages.length?region.languages:[null];
 for(const lang of languages){
  let after='';
  for(let page=0;page<3;page++){
   const q=new URLSearchParams({first:'100'});if(lang)q.set('language',lang);if(after)q.set('after',after);
   const d=await twitchHelix(`/streams?${q}`,cfg);
   streams.push(...(d.data||[]));after=d.pagination?.cursor||'';if(!after)break;
  }
 }
 const unique=[...new Map(streams.map(x=>[x.id,x])).values()];
 const map=new Map();
 for(const st of unique){
  const topic=st.game_name||'Sin categoría',viewers=Number(st.viewer_count||0);
  if(!radarRelevant(`${topic} ${st.title||''} ${(st.tags||[]).join(' ')}`,params.niche))continue;
  radarAdd(map,topic,viewers,{keywords:[...(st.tags||[]),...radarWords(st.title||'').slice(0,5)]});
 }
 return {platform,ok:true,source:'Twitch Helix · Get Streams',coverage:region.languages.length?`Muestra oficial de streams LIVE filtrada por idioma (${region.languages.join(', ')}). Twitch no expone país del stream.`:'Muestra oficial de hasta 300 streams LIVE globales por idioma consultado.',sampleCount:unique.length,items:radarRows(map,40),observedAt:Date.now(),metricLabel:radarMetricLabel(platform)};
}
async function radarFetchKick(params){
 const platform='Kick',region=radarRegion(params),all=[];let cursor='';
 if(!savedAuth.kick?.access_token)throw Error('Conecta Kick en GREÑA antes de usarlo en Radar.');
 for(let page=0;page<2;page++){
  const q=new URLSearchParams({limit:'1000'});
  for(const lang of region.languages)q.append('language_code',lang);
  if(cursor)q.set('cursor',cursor);
  const d=await kickApi(`/public/v2/livestreams?${q}`);
  all.push(...(Array.isArray(d?.data)?d.data:[]));cursor=String(d?.pagination?.next_cursor||'');if(!cursor)break;
 }
 const unique=[...new Map(all.map(x=>[x.id,x])).values()];
 const map=new Map();
 for(const st of unique){
  const topic=st.category?.name||'Sin categoría',viewers=Number(st.viewer_count||0);
  if(!radarRelevant(`${topic} ${st.title||''} ${(st.tags||[]).join(' ')}`,params.niche))continue;
  radarAdd(map,topic,viewers,{keywords:[...(st.tags||[]),...radarWords(st.title||'').slice(0,5)]});
 }
 return {platform,ok:true,source:'Kick Public API · Livestreams v2',coverage:region.languages.length?`Livestreams oficiales filtrados por idioma (${region.languages.join(', ')}). Kick no expone país del stream en este endpoint.`:'Hasta 2,000 livestreams oficiales consultados con paginación.',sampleCount:unique.length,items:radarRows(map,40),observedAt:Date.now(),metricLabel:radarMetricLabel(platform)};
}
async function radarFetchTikTok(params){
 const platform='TikTok',auth=savedAuth.tiktok||{},token=String(auth.access_token||'').trim(),username=String(auth.username||auth.displayName||'').trim();
 if(!token&&!username&&!auth.sessionId)throw Error('Conecta TikTok en GREÑA antes de usarlo en Radar.');
 const map=new Map();
 if(token){
  try{
   const fields='id,title,video_description,duration,create_time,view_count,like_count,comment_count,share_count';
   const r=await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(fields)}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({max_count:20})});
   const d=await r.json().catch(()=>({}));
   if(r.ok&&(!d.error?.code||d.error.code==='ok')){
    const videos=d.data?.videos||[];
    for(const v of videos){
     const views=Number(v.view_count||0),likes=Number(v.like_count||0),comments=Number(v.comment_count||0),shares=Number(v.share_count||0);
     const text=`${v.title||''} ${v.video_description||''}`.trim(),words=radarWords(text).slice(0,10);
     const topic=words.slice(0,3).join(' ')||'Contenido propio de TikTok';
     if(!radarRelevant(text,params.niche)&&params.niche!=='Gaming')continue;
     radarAdd(map,topic,views,{engagementNumerator:likes+comments+shares,engagementDenominator:views,keywords:words});
    }
    return {platform,ok:true,source:'TikTok · cuenta vinculada',coverage:`Datos reales de videos de la cuenta vinculada${username?' @'+username:''}.`,sampleCount:videos.length,items:radarRows(map,30),observedAt:Date.now(),metricLabel:radarMetricLabel(platform),scope:'linked-account'};
   }
  }catch{}
 }
 return {platform,ok:true,source:'TikTok · cuenta vinculada',coverage:`TikTok está vinculado${username?' como @'+username:''}, pero la sesión actual no expone un feed global de tendencias para Radar. GREÑA no inventa métricas de TikTok.`,sampleCount:0,items:[],observedAt:Date.now(),metricLabel:radarMetricLabel(platform),scope:'linked-account',linkedOnly:true};
}
async function radarHistory(){
 if(!activeUserId)return {series:{}};
 const d=await readJson(profileFile('radar-history.json'),{series:{}});if(!d.series)d.series={};return d;
}
function radarGrowthFor(history,key,current,windowHours,now=Date.now()){
 const arr=(history.series?.[key]||[]).filter(x=>Number(x.at)<now-5*60*1000&&Number(x.metric)>=0);
 if(!arr.length)return {growthPct:null,growthHours:null,growthStatus:'baseline'};
 const target=now-Math.max(1,Number(windowHours)||24)*3600000;
 const prev=arr.slice().sort((a,b)=>Math.abs(Number(a.at)-target)-Math.abs(Number(b.at)-target))[0];
 const pm=Number(prev.metric)||0,cm=Number(current)||0,hours=Math.max(.1,(now-Number(prev.at))/3600000);
 if(pm<=0)return {growthPct:null,growthHours:Math.round(hours*10)/10,growthStatus:cm>0?'new':'baseline'};
 return {growthPct:Math.round(((cm-pm)/pm)*1000)/10,growthHours:Math.round(hours*10)/10,growthStatus:'measured'};
}
async function radarApplyGrowth(sources,params){
 const history=await radarHistory(),now=Date.now(),region=radarRegion(params),niche=radarKey(params.niche||'all');
 for(const src of sources){
  if(!src.ok)continue;
  for(const item of src.items||[]){
   const hk=`${radarKey(src.platform)}|${region.key}|${niche}|${item.key}`;
   Object.assign(item,radarGrowthFor(history,hk,item.metric,params.windowHours,now));
   const arr=history.series[hk]||(history.series[hk]=[]);arr.push({at:now,metric:item.metric});
   history.series[hk]=arr.filter(x=>Number(x.at)>now-RADAR_HISTORY_KEEP_MS).slice(-90);
  }
 }
 if(activeUserId)await safeWriteJson(profileFile('radar-history.json'),history).catch(()=>{});
}
function radarMergeOpportunities(sources,params){
 const merged=new Map();
 for(const src of sources){
  if(!src.ok)continue;
  (src.items||[]).slice(0,30).forEach((item,rank)=>{
   const key=item.key,row=merged.get(key)||{key,topic:item.topic,platforms:{},keywords:new Map(),rankScore:0};
   row.platforms[src.platform]={metric:item.metric,metricLabel:src.metricLabel||radarMetricLabel(src.platform),growthPct:item.growthPct,growthHours:item.growthHours,growthStatus:item.growthStatus,count:item.count,engagementPct:item.engagementPct,velocity:item.velocity};
   row.rankScore+=Math.max(0,35-rank);
   for(const k of item.keywords||[])row.keywords.set(k,(row.keywords.get(k)||0)+1);
   merged.set(key,row);
  })
 }
 const result=[...merged.values()].map(row=>{
  const ps=Object.values(row.platforms),growths=ps.map(x=>x.growthPct).filter(Number.isFinite);
  const avgGrowth=growths.length?growths.reduce((a,b)=>a+b,0)/growths.length:null;
  const engagement=ps.map(x=>x.engagementPct).filter(Number.isFinite);
  const avgEng=engagement.length?engagement.reduce((a,b)=>a+b,0)/engagement.length:null;
  const cross=ps.length;
  // Índice GREÑA: derivado, no es una estadística de las plataformas.
  let score=20+cross*18+Math.min(25,row.rankScore/4);
  if(avgGrowth!==null)score+=Math.max(-10,Math.min(25,avgGrowth/4));
  if(avgEng!==null)score+=Math.min(10,avgEng/2);
  score=Math.max(0,Math.min(100,Math.round(score)));
  const keywords=[...row.keywords.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(x=>x[0]);
  return {...row,score,avgGrowth:avgGrowth===null?null:Math.round(avgGrowth*10)/10,avgEngagement:avgEng===null?null:Math.round(avgEng*100)/100,keywords};
 }).sort((a,b)=>b.score-a.score);
 return result.slice(0,30).map((x,i)=>{
  const hot=x.avgGrowth!==null&&x.avgGrowth>20,kw=x.keywords[0]||'reto';
  const title=i%3===0?`${x.topic}: probé ${kw} antes de que se sature`
   :i%3===1?`Esto está creciendo en ${x.topic} y quise comprobar por qué`
   :`${x.topic}: el momento que puede convertirse en tu próximo clip`;
  const short=i%3===0?`${x.topic} está subiendo… mira esto`
   :i%3===1?`No esperaba que ${x.topic} estuviera creciendo así`
   :`La oportunidad que vi en ${x.topic}`;
  const hook=hot?`Esto está creciendo ahora mismo y todavía no parece totalmente saturado: ${x.topic}.`
   :`Vi una señal interesante en ${x.topic}; vamos a convertirla en una historia, no solo en otro video.`;
  const availableGrowth=Object.entries(x.platforms).filter(([,v])=>Number.isFinite(v.growthPct)).map(([p,v])=>`${p} ${v.growthPct>=0?'+':''}${v.growthPct}%/${v.growthHours}h`);
  const why=availableGrowth.length?`Crecimiento medido: ${availableGrowth.join(' · ')}. Coincide en ${Object.keys(x.platforms).length} plataforma(s).`
   :`Hay señal real de actividad en ${Object.keys(x.platforms).length} plataforma(s), pero GREÑA todavía está creando el historial necesario para calcular crecimiento porcentual.`;
  return {...x,title,short,hook,why,concept:`Usa ${x.topic} como tema central y construye una pieza con una misión, conflicto o comparación concreta. Abre con el resultado o el problema; evita una introducción larga.`,execution:`Directo: plantea un objetivo verificable alrededor de ${x.topic}. Clip/Short: abre con el momento fuerte, da contexto en una frase y termina con una consecuencia clara.`,hashtags:[`#${String(x.topic).replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g,'')}`,'#Trending','#Creator','#Contenido'].filter(x=>x.length>1)};
 });
}
function radarHotWords(sources){
 const m=new Map();
 for(const src of sources)if(src.ok)for(const item of (src.items||[]).slice(0,25)){
  for(const w of [item.topic,...(item.keywords||[])]){const k=String(w||'').trim();if(k)m.set(k,(m.get(k)||0)+1)}
 }
 return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,28).map(([word,count])=>({word,count}));
}
function radarConfigPublic(){
 return {
  realOnly:true,usesLinkedAccounts:true,
  sources:{
   tiktok:{ready:!!(savedAuth.tiktok?.access_token||savedAuth.tiktok?.sessionId||savedAuth.tiktok?.username),label:'TikTok',account:accountFromAuth('tiktok'),note:'Usa la cuenta TikTok ya vinculada en GREÑA.'},
   kick:{ready:!!savedAuth.kick?.access_token,label:'Kick',account:accountFromAuth('kick'),note:'Usa la sesión de Kick ya vinculada en GREÑA.'},
   twitch:{ready:!!savedAuth.twitch?.access_token,label:'Twitch',account:accountFromAuth('twitch'),note:'Usa la sesión de Twitch ya vinculada en GREÑA.'}
  }
 };
}
async function radarAnalyze(params={}){
 const enabled=Array.isArray(params.platforms)?params.platforms.map(x=>String(x).toLowerCase()):['tiktok','kick','twitch'];
 const jobs=[];
 if(enabled.includes('twitch'))jobs.push(radarFetchTwitch(params).catch(e=>radarSourceError('Twitch',e)));
 if(enabled.includes('kick'))jobs.push(radarFetchKick(params).catch(e=>radarSourceError('Kick',e)));
 if(enabled.includes('tiktok'))jobs.push(radarFetchTikTok(params).catch(e=>radarSourceError('TikTok',e)));
 const sources=await Promise.all(jobs);await radarApplyGrowth(sources,params);
 const opportunities=radarMergeOpportunities(sources,params);
 return {ok:true,realOnly:true,generatedAt:Date.now(),region:radarRegion(params),niche:params.niche||'Gaming',windowHours:Number(params.windowHours)||24,sources,opportunities,hotWords:radarHotWords(sources),sourceConfig:radarConfigPublic()};
}

const bridgeRuntime={tiktok:false,twitch:false,kick:false};
const bridgeSignals={
 tiktok:{lastSeenAt:0,lastEventAt:0,lastKind:'',counts:{}},
 twitch:{lastSeenAt:0,lastEventAt:0,lastKind:'',counts:{}},
 kick:{lastSeenAt:0,lastEventAt:0,lastKind:'',counts:{}}
};
function bridgeKey(v=''){const p=String(v||'').toLowerCase();return ['tiktok','twitch','kick'].includes(p)?p:''}
function noteBridgeSignal(platform,kind,meta={}){
 const p=bridgeKey(platform);if(!p)return;
 const s=bridgeSignals[p],k=String(kind||'signal').toLowerCase(),now=Date.now();
 s.lastSeenAt=now;s.lastKind=k;s.counts[k]=(Number(s.counts[k])||0)+1;
 if(k==='event'||k==='follow'||k==='gift'||k==='sub'||k==='share'||k==='like'||k==='cheer'||k==='raid')s.lastEventAt=now;
 if(meta&&typeof meta==='object')s.lastMeta={...meta,at:now};
}
const twitchFollowerCache=new Map();
const twitchEventHealth={ready:false,active:[],failed:[],lastError:'',updatedAt:0};
const kickEventHealth={subscriptionsReady:false,active:[],failed:[],lastError:'',updatedAt:0,lastWebhookAt:0};
function eventHealthSnapshot(){
 const ps=publicStatus(),now=Date.now();
 const stateFor=(ok,waiting='waiting')=>ok?'ready':waiting;
 const sig=p=>{const x=bridgeSignals[p]||{};return {lastSeenAt:Number(x.lastSeenAt||0),lastEventAt:Number(x.lastEventAt||0),lastKind:x.lastKind||'',counts:{...(x.counts||{})},ageSeconds:x.lastSeenAt?Math.round((now-x.lastSeenAt)/1000):null}};
 const twitchEvents=!ps.twitch?.authenticated?'off':twitchEventHealth.ready?'ready':twitchEventHealth.active.length?'degraded':(twitchCfg?'connecting':'waiting');
 const ttSig=sig('tiktok'),ttEvents=!ps.tiktok?.authenticated?'off':!bridgeRuntime.tiktok?'waiting':ttSig.lastEventAt?'ready':'waiting';
 const kickSig=sig('kick'),kickEvents=!ps.kick?.authenticated?'off':kickEventHealth.lastWebhookAt?'ready':bridgeRuntime.kick?'fallback':kickEventHealth.subscriptionsReady?'degraded':'waiting';
 return {
  tiktok:{account:ps.tiktok?.authenticated?'ready':'off',chat:stateFor(bridgeRuntime.tiktok,ps.tiktok?.authenticated?'waiting':'off'),events:ttEvents,source:'TikTok LIVE connector · FOLLOW + SOCIAL fallback · SUB_NOTIFY',diagnostics:ttSig},
  twitch:{account:ps.twitch?.authenticated?'ready':'off',chat:stateFor(bridgeRuntime.twitch,ps.twitch?.authenticated?'waiting':'off'),events:twitchEvents,source:'Twitch EventSub + IRC',active:[...twitchEventHealth.active],failed:[...twitchEventHealth.failed],lastError:twitchEventHealth.lastError||'',diagnostics:sig('twitch')},
  kick:{account:ps.kick?.authenticated?'ready':'off',chat:stateFor(bridgeRuntime.kick,ps.kick?.authenticated?'waiting':'off'),events:kickEvents,source:'Kick Events API + browser/Pusher realtime fallback',active:[...kickEventHealth.active],failed:[...kickEventHealth.failed],lastError:kickEventHealth.lastError||'',subscriptionsReady:!!kickEventHealth.subscriptionsReady,lastWebhookAt:Number(kickEventHealth.lastWebhookAt||0),diagnostics:kickSig}
 };
}
function pushEventHealth(){broadcast({type:'event-health',eventHealth:eventHealthSnapshot()})}

// ===== TAP TAP TOP =====
// Top 5 por likes reales de TikTok. Se alimenta del mismo evento LIKE que GREÑA Chat,
// por lo que no depende del milestone de 100 usado para la alerta sonora.
const tapTapUsers=new Map();
let tapTapUpdatedAt=0,tapTapSessionRoomId='',tapTapPreviewTimer=null;
function beginTapTapSession(roomId=''){
 const next=String(roomId||'').trim();
 if(!next)return false;
 if(tapTapSessionRoomId===next)return false;
 tapTapSessionRoomId=next;resetTapTap();
 return true;
}
function endTapTapSession(){tapTapSessionRoomId='';return resetTapTap()}
function tapTapKey(v=''){return String(v||'').trim().replace(/^@/,'').toLowerCase().slice(0,100)}
function publicTapTapState(){
 const leaderboard=[...tapTapUsers.values()].sort((a,b)=>(b.likes-a.likes)||(b.updatedAt-a.updatedAt)).slice(0,5).map((x,i)=>({...x,rank:i+1}));
 return {type:'taptap',leaderboard,updatedAt:tapTapUpdatedAt||Date.now(),sessionRoomId:tapTapSessionRoomId};
}
function recordTapTap(evt={}){
 const id=tapTapKey(evt.userId||evt.user||evt.nickname||evt.name);if(!id)return null;
 const n=Math.max(1,Number(evt.amount??evt.likes??1)||1),now=Date.now();
 const old=tapTapUsers.get(id)||{userId:id,name:String(evt.nickname||evt.name||evt.user||id).slice(0,80),avatar:String(evt.avatar||''),likes:0,updatedAt:0};
 old.likes=(Number(old.likes)||0)+n;old.updatedAt=now;if(evt.nickname||evt.name)old.name=String(evt.nickname||evt.name).slice(0,80);if(evt.avatar)old.avatar=String(evt.avatar);
 tapTapUsers.set(id,old);tapTapUpdatedAt=now;const state=publicTapTapState();broadcast(state);return old;
}
function resetTapTap(){tapTapUsers.clear();tapTapUpdatedAt=Date.now();const state=publicTapTapState();broadcast(state);return state}
function tapTapPreviewState(amount=0){const names=['GreñaFan','TapMaster','LunaXF','TeamGreña','JugadorRD'];const leaderboard=names.map((name,i)=>({userId:`preview_${i}`,name,avatar:'',likes:Math.max(1,Number(amount)||((5-i)*137+i*19)),updatedAt:Date.now(),rank:i+1}));return {type:'taptap',leaderboard,updatedAt:Date.now(),preview:true,sessionRoomId:tapTapSessionRoomId}}
const activityHistory=[];
const recentAlerts=new Map();
function accountFromAuth(p){if(p==='tiktok')return savedAuth.tiktok?.username||'';if(p==='twitch')return twitchCfg?.displayName||twitchCfg?.login||savedAuth.twitch?.displayName||savedAuth.twitch?.login||'';if(p==='kick')return savedAuth.kick?.username||savedAuth.kick?.slug||'';return ''}
function publicStatus(){const out={};for(const p of ['tiktok','twitch','kick']){const raw=status[p]||{};const authenticated=p==='tiktok'?!!(savedAuth.tiktok?.username||savedAuth.tiktok?.sessionId||savedAuth.tiktok?.access_token):p==='twitch'?!!savedAuth.twitch?.access_token:p==='kick'?!!savedAuth.kick?.access_token:false;const account=raw.account||accountFromAuth(p);const runtimeLabel=raw.label||'No conectado';let label=runtimeLabel;if(authenticated&&!raw.connected)label=`${account?account+' · ':''}cuenta vinculada${p==='tiktok'?' · esperando LIVE':' · sesión guardada'}`;out[p]={...raw,connected:!!raw.connected||authenticated,authenticated,runtimeConnected:!!raw.connected,account,label,runtimeLabel}}return out}
function pushStatus(){broadcast({type:'platform-status',status:publicStatus()})}
function normalizeCounterWidgetSettings(input={}){
 const style=['classic','trio','vertical'].includes(String(input.counterStyle||input.style||''))?String(input.counterStyle||input.style):'classic';
 const raw=String(input.counterCardColor||input.cardColor||'').trim();
 const counterCardColor=/^#[0-9a-fA-F]{6}$/.test(raw)?raw.toLowerCase():'#18232c';
 return {style,counterCardColor};
}
function publicCounterSettings(){return normalizeCounterWidgetSettings({counterStyle:autoPrefs.counterStyle,counterCardColor:autoPrefs.counterCardColor})}
function currentViewers(){return viewerTest.enabled?{tiktok:viewerTest.tiktok,twitch:viewerTest.twitch,kick:viewerTest.kick}:{...viewers}}
function pushViewers(){const v=currentViewers();broadcast({type:'viewers',viewers:v,total:v.tiktok+v.twitch+v.kick,testMode:viewerTest.enabled,updatedAt:Date.now()})}
function tiktokViewerSourceFamily(source=''){
 const x=String(source||'').toLowerCase();
 if(x.includes('room_user')||x.includes('room user')||x.includes('live fallback'))return 'roomUser';
 if(x.includes('room/info'))return 'roomInfo';
 if(x.includes('conexión inicial')||x.includes('conexion inicial'))return 'initial';
 if(x.includes('bridge'))return 'bridge';
 return 'other';
}
function acceptTikTokViewerJump(n,source,meta,now){
 const prev=Math.max(0,Number(viewers.tiktok)||0);
 // Solo vigilamos saltos GRANDES hacia arriba. Las bajadas reales deben verse de inmediato.
 if(prev<=0||n<=prev){meta.spikeValue=0;meta.spikeHits=0;meta.spikeAt=0;meta.spikeSources=[];return true}
 const gap=n-prev,ratio=n/Math.max(1,prev);
 if(gap<120||ratio<3.5){meta.spikeValue=0;meta.spikeHits=0;meta.spikeAt=0;meta.spikeSources=[];return true}
 const tolerance=Math.max(10,Math.round(n*0.08));
 const same=Math.abs(Number(meta.spikeValue||0)-n)<=tolerance&&now-Number(meta.spikeAt||0)<30000;
 const family=tiktokViewerSourceFamily(source);
 if(!same){meta.spikeValue=n;meta.spikeHits=1;meta.spikeAt=now;meta.spikeSources=[family]}
 else{meta.spikeHits=(Number(meta.spikeHits)||0)+1;if(!Array.isArray(meta.spikeSources))meta.spikeSources=[];if(!meta.spikeSources.includes(family))meta.spikeSources.push(family)}
 // Un salto enorme se acepta si ROOM_USER y room/info coinciden, o si persiste durante varios ciclos.
 const confirmed=meta.spikeSources.includes('roomUser')&&meta.spikeSources.includes('roomInfo');
 const persistent=(Number(meta.spikeHits)||0)>=4&&now-Number(meta.spikeAt||0)>=20000;
 if(confirmed||persistent){meta.spikeValue=0;meta.spikeHits=0;meta.spikeAt=0;meta.spikeSources=[];return true}
 meta.source=`${source} · pico ${n} descartado provisionalmente`;
 return false;
}
function setViewers(platform,count,source='live'){
 const raw=Number(count);if(!Number.isFinite(raw)||!viewerMeta[platform])return false;
 const n=Math.max(0,Math.trunc(raw)),meta=viewerMeta[platform],now=Date.now();
 const forceZero=/offline|desconect|disconnect|reset|apagado|stopped|stream_end/i.test(String(source||''));
 // TikTok/Kick a veces entregan un 0 transitorio entre dos cifras reales. No borramos
 // un dato sano por un único paquete vacío; exigimos tres ceros separados salvo offline real.
 if(n===0&&!forceZero&&(platform==='tiktok'||platform==='kick')&&viewers[platform]>0&&now-Number(meta.lastGoodAt||0)<30000){
   if(now-Number(meta.lastZeroAt||0)>=3000)meta.zeroHits=(Number(meta.zeroHits)||0)+1;
   meta.lastZeroAt=now;meta.source=`${source} · 0 pendiente (${meta.zeroHits||1}/3)`;
   if((meta.zeroHits||0)<3)return false;
 }
 // TikTok puede mezclar contadores acumulados con viewers actuales. Un salto absurdo no
 // llega al overlay hasta ser confirmado por las dos fuentes reales o mantenerse estable.
 if(platform==='tiktok'&&n>0&&!acceptTikTokViewerJump(n,source,meta,now))return false;
 if(n>0){meta.lastGood=n;meta.lastGoodAt=now;meta.zeroHits=0;meta.lastZeroAt=0}
 else if(forceZero){meta.zeroHits=0;meta.lastZeroAt=now;meta.spikeValue=0;meta.spikeHits=0;meta.spikeAt=0;meta.spikeSources=[]}
 meta.source=source;
 if(viewers[platform]!==n){viewers[platform]=n;pushViewers()}
 return true;
}
function readTikTokViewerCount(d,{roomUser=false}={}){
 // Solo usamos campos que significan espectadores ACTUALES. totalUser/memberCount son
 // acumulados/auxiliares en ciertos payloads y provocaban saltos falsos (ej. 20 -> 700 -> 20).
 const candidates=[
  d?.viewerCount,d?.viewer_count,d?.userCount,d?.user_count,
  d?.stats?.viewerCount,d?.stats?.viewer_count,d?.stats?.userCount,d?.stats?.user_count,
  d?.roomInfo?.viewerCount,d?.roomInfo?.viewer_count,d?.roomInfo?.userCount,d?.roomInfo?.user_count,
  d?.roomInfo?.data?.viewerCount,d?.roomInfo?.data?.viewer_count,d?.roomInfo?.data?.userCount,d?.roomInfo?.data?.user_count,
  d?.data?.viewerCount,d?.data?.viewer_count,d?.data?.userCount,d?.data?.user_count,
  d?.data?.stats?.viewerCount,d?.data?.stats?.viewer_count,d?.data?.stats?.userCount,d?.data?.stats?.user_count,
  d?.data?.room?.viewerCount,d?.data?.room?.viewer_count,d?.data?.room?.userCount,d?.data?.room?.user_count,
  d?.liveRoomStats?.viewerCount,d?.liveRoomStats?.viewer_count,d?.liveRoomStats?.userCount,d?.liveRoomStats?.user_count,
  d?.live_room_stats?.viewerCount,d?.live_room_stats?.viewer_count,d?.live_room_stats?.userCount,d?.live_room_stats?.user_count,
  d?.data?.liveRoomStats?.viewerCount,d?.data?.liveRoomStats?.viewer_count,d?.data?.liveRoomStats?.userCount,d?.data?.liveRoomStats?.user_count,
  d?.data?.live_room_stats?.viewerCount,d?.data?.live_room_stats?.viewer_count,d?.data?.live_room_stats?.userCount,d?.data?.live_room_stats?.user_count,
  // tiktok-live-connector 2.5/proto v3 llama `total` al campo #3 que en v2 era viewerCount.
  ...(roomUser?[d?.total]:[])
 ];
 let sawExplicitZero=false;
 for(const v of candidates){
  if(v===null||v===undefined||v===''||typeof v==='boolean')continue;
  const n=Number(v);if(!Number.isFinite(n)||n<0)continue;
  if(n>0)return Math.trunc(n);
  if(n===0)sawExplicitZero=true;
 }
 return sawExplicitZero?0:null;
}
function setTikTokViewersFromEvent(d,source='TikTok ROOM_USER'){const n=readTikTokViewerCount(d,{roomUser:true});if(n!==null){counterTikTokLastSignalAt=Date.now();counterTikTokPollFailures=0;setViewers('tiktok',n,source);return true}return false}
function tiktokDedicatedCounterHealthy(){
 const c=counterTikTok;if(!c)return false;
 try{if(c.isConnected===true)return true}catch{}
 const last=Number(counterTikTokLastSignalAt||0);
 return !!last&&Date.now()-last<30000;
}
function clearTikTokBridgeDisconnectGrace(){
 if(tiktokBridgeDisconnectGraceTimer)clearTimeout(tiktokBridgeDisconnectGraceTimer);
 tiktokBridgeDisconnectGraceTimer=null;
}
function scheduleTikTokBridgeDisconnectGrace(account=''){
 if(tiktokBridgeDisconnectGraceTimer)return;
 tiktokBridgeDisconnectGraceTimer=setTimeout(()=>{
  tiktokBridgeDisconnectGraceTimer=null;
  if(bridgeRuntime.tiktok||tiktokDedicatedCounterHealthy()||tiktok)return;
  setViewers('tiktok',0,'TikTok chat desconectado confirmado');
  const who=String(account||accountFromAuth('tiktok')||'').trim();
  setStatus('tiktok',false,`${who?`@${who.replace(/^@/,'')} · `:''}chat desconectado`,who);
 },15000);
 tiktokBridgeDisconnectGraceTimer.unref?.();
}
function clearTikTokCounterTimers(){
 if(counterTikTokPollTimer)clearInterval(counterTikTokPollTimer);counterTikTokPollTimer=null;
 if(counterTikTokReconnectTimer)clearTimeout(counterTikTokReconnectTimer);counterTikTokReconnectTimer=null;
}
async function refreshCounterTikTok(c=counterTikTok,source='TikTok room/info'){
 if(!c||counterTikTok!==c)return false;
 const info=await c.fetchRoomInfo();
 if(counterTikTok!==c)return false;
 const n=readTikTokViewerCount(info);
 if(n===null){viewerMeta.tiktok.source=`${source} · respuesta sin viewer count`;return false}
 counterTikTokLastSignalAt=Date.now();counterTikTokPollFailures=0;
 setViewers('tiktok',n,source);return true;
}
function scheduleTikTokCounterReconnect(username=''){
 if(counterTikTokReconnectTimer||!autoPrefs.enabled||!autoPrefs.counterTikTokEnabled||!autoPrefs.counterTikTok)return;
 counterTikTokReconnectTimer=setTimeout(async()=>{
  counterTikTokReconnectTimer=null;
  if(counterTikTok||counterTikTokConnecting||!autoPrefs.counterTikTokEnabled)return;
  try{await connectCounterTikTok(autoPrefs.counterTikTok||username)}catch(e){viewerMeta.tiktok.source='reconexión pendiente';console.warn('Reconexión contador TikTok:',e?.message||e)}
 },2500);
 counterTikTokReconnectTimer.unref?.();
}
function restartTikTokCounterIfStuck(c,username='',reason='sin datos'){
 if(!c||counterTikTok!==c)return false;
 const silence=Date.now()-Number(counterTikTokLastSignalAt||0);
 // No reiniciar por un fallo aislado. Tres fallos de room/info o ~24 s sin una sola
 // cifra válida indican una conexión zombi aunque TikTok no haya emitido disconnected.
 if(counterTikTokPollFailures<3&&counterTikTokLastSignalAt&&silence<24000)return false;
 counterTikTok=null;
 if(counterTikTokPollTimer){clearInterval(counterTikTokPollTimer);counterTikTokPollTimer=null}
 viewerMeta.tiktok.source=`contador atascado · ${reason} · reconectando`;
 try{c.disconnect()}catch{}
 scheduleTikTokCounterReconnect(username);
 return true;
}
function setStatus(p,connected,label,account){status[p]={...(status[p]||{}),connected:!!connected,label:String(label|| (connected?'Conectado':'No conectado')),...(account?{account}: {})};pushStatus()}
const INTERNAL_BRIDGE_KEY=BRIDGE_TOKEN;
function internalBridgeAllowed(req){return String(req.headers['x-grena-internal']||'')===INTERNAL_BRIDGE_KEY}
function requireInternalBridge(req,res){if(internalBridgeAllowed(req))return true;json(res,403,{ok:false,error:'Forbidden'});return false}
const SOUND_PROFILE_VERSION=3;
const LEGACY_DEFAULT_ALERT_SOUNDS={follow:'/assets/sounds/follow.wav',sub:'/assets/sounds/sub.wav',gift:'/assets/sounds/gift.wav',cheer:'/assets/sounds/cheer.wav',share:'/assets/sounds/share.wav',raid:'/assets/sounds/raid.wav',like:'/assets/sounds/like.wav',superchat:'/assets/sounds/superchat.wav',supersticker:'/assets/sounds/supersticker.wav',membergift:'/assets/sounds/membergift.wav'};
const DEFAULT_ALERT_SOUNDS={follow:'/assets/sounds/follow-grena.mp3',sub:'/assets/sounds/gift-bits-v2.mp3',gift:'/assets/sounds/gift-bits-v2.mp3',cheer:'/assets/sounds/gift-bits-v2.mp3',share:'/assets/sounds/share-grena.mp3',raid:'/assets/sounds/gift-bits-v2.mp3',like:'/assets/sounds/like-grena.mp3',superchat:'/assets/sounds/gift-bits-v2.mp3',supersticker:'/assets/sounds/gift-bits-v2.mp3',membergift:'/assets/sounds/gift-bits-v2.mp3'};
function resolveAlertSound(savedPreset,event){const raw=typeof savedPreset?.sound==='string'?savedPreset.sound.trim():'';const needsProfileMigration=Number(savedPreset?.soundProfileVersion||0)<SOUND_PROFILE_VERSION;const wasDefault=needsProfileMigration||!raw||savedPreset?.soundName==='Predeterminado'||raw===LEGACY_DEFAULT_ALERT_SOUNDS[event]||raw===DEFAULT_ALERT_SOUNDS[event]||raw==='/assets/sounds/gift-bits-grena.mp3';return wasDefault?(DEFAULT_ALERT_SOUNDS[event]||DEFAULT_ALERT_SOUNDS.follow):raw;}
function eventLabel(event){return ({follow:'Nuevo seguidor',sub:'Suscripción',gift:'Regalo',cheer:'Bits',share:'Compartió el LIVE',raid:'Raid',like:'Likes'})[event]||'Evento'}
let alertSoundProfilesMigrated=false;
for(const [ev,preset] of Object.entries(savedAlertDesigns||{})){
 if(Number(preset?.soundProfileVersion||0)<SOUND_PROFILE_VERSION){
  savedAlertDesigns[ev]={...preset,sound:DEFAULT_ALERT_SOUNDS[ev]||DEFAULT_ALERT_SOUNDS.follow,soundName:'Predeterminado',soundProfileVersion:SOUND_PROFILE_VERSION};
  alertSoundProfilesMigrated=true;
 }
}
if(alertSoundProfilesMigrated)await safeWriteJson(stateFile('alert-designs.json',LEGACY_ALERTS_FILE),savedAlertDesigns).catch(()=>{});

function extractFirstMediaUrl(value,depth=0,seen=new Set()){
 if(!value||depth>5)return '';
 if(typeof value==='string')return /^(https?:\/\/|data:image\/)/i.test(value)?value:'';
 if(typeof value!=='object')return '';
 if(seen.has(value))return '';
 seen.add(value);
 if(Array.isArray(value)){
  for(const item of value){const url=extractFirstMediaUrl(item,depth+1,seen);if(url)return url}
  return '';
 }
 const priority=['url','urlList','url_list','uri','imageUrl','image_url','pictureUrl','picture_url','iconUrl','icon_url','src'];
 for(const key of priority){if(key in value){const url=extractFirstMediaUrl(value[key],depth+1,seen);if(url)return url}}
 for(const [key,val] of Object.entries(value)){
  if(/(gift|image|img|icon|picture|thumbnail)/i.test(key)){
   const url=extractFirstMediaUrl(val,depth+1,seen);if(url)return url;
  }
 }
 return '';
}
function extractTikTokGiftImage(d={}){
 const candidates=[
  d?.giftPictureUrl,d?.giftPictureUrlNoWebp,d?.giftPicture,
  d?.giftImage,d?.giftIcon,d?.giftDetails?.giftPictureUrl,
  d?.giftDetails?.giftPictureUrlNoWebp,d?.giftDetails?.giftPicture,
  d?.giftDetails?.giftImage,d?.giftDetails?.giftIcon,d?.giftDetails?.image,
  d?.giftDetails?.icon,d?.gift?.giftPicture,d?.gift?.giftImage,
  d?.gift?.image,d?.gift?.icon,d?.gift?.previewImage,d?.gift?.giftLabelIcon,
  d?.giftInfo,d?.giftDetails,d?.extendedGiftInfo,
  d?.extendedGiftInfo?.image,d?.extendedGiftInfo?.giftImage,d?.extendedGiftInfo?.icon
 ];
 for(const candidate of candidates){const url=extractFirstMediaUrl(candidate);if(url)return url}
 return '';
}
function extractAnimatedMediaUrl(value,depth=0,seen=new Set(),hint=''){
 if(!value||depth>6)return '';
 if(typeof value==='string'){
  if(!/^(https?:\/\/|data:image\/)/i.test(value))return '';
  return (/\.gif(?:$|\?)/i.test(value)||/(animat|effect|motion|webm|lottie)/i.test(hint))?value:'';
 }
 if(typeof value!=='object'||seen.has(value))return '';
 seen.add(value);
 if(Array.isArray(value)){for(const v of value){const u=extractAnimatedMediaUrl(v,depth+1,seen,hint);if(u)return u}return ''}
 const priority=['animatedImage','animated_image','animationUrl','animation_url','gifUrl','gif_url','webmUrl','webm_url','effectUrl','effect_url','animation','effect'];
 for(const key of priority){if(key in value){const u=extractAnimatedMediaUrl(value[key],depth+1,seen,key);if(u)return u}}
 for(const [key,val] of Object.entries(value)){if(/(animat|effect|gif|motion|webm|lottie)/i.test(key)){const u=extractAnimatedMediaUrl(val,depth+1,seen,key);if(u)return u}}
 return '';
}
function extractTikTokGiftAnimatedImage(d={}){return extractAnimatedMediaUrl(d)||extractAnimatedMediaUrl(d?.giftDetails)||extractAnimatedMediaUrl(d?.gift)||extractAnimatedMediaUrl(d?.extendedGiftInfo)||''}
function normalizeTikTokGift(d={},connection=tiktok){
 const giftId=String(d?.giftId||d?.giftDetails?.giftId||d?.gift?.id||d?.extendedGiftInfo?.id||'');
 const cached=Array.isArray(connection?.availableGifts)?connection.availableGifts.find(g=>String(g?.id??g?.giftId??'')===giftId):null;
 const ext=d?.extendedGiftInfo||cached||{};
 const giftNameOriginal=String(d?.giftDetails?.giftName||d?.giftName||d?.gift?.name||d?.gift?.describe||ext?.giftName||ext?.name||ext?.displayName||'Regalo de TikTok').trim();
 const giftName=tiktokGiftSpanishName(giftNameOriginal);
 const count=Math.max(1,Number(d?.repeatCount||d?.repeat_count||1)||1);
 const unitDiamonds=Math.max(0,Number(d?.giftDetails?.diamondCount??d?.diamondCount??d?.gift?.diamondCount??ext?.diamondCount??ext?.diamond_count??ext?.cost??ext?.price??0)||0);
 const giftImage=extractTikTokGiftImage({...d,extendedGiftInfo:ext});
 const giftAnimatedImage=extractTikTokGiftAnimatedImage({...d,extendedGiftInfo:ext});
 return {giftId,giftName,giftNameOriginal,count,unitDiamonds,totalDiamonds:unitDiamonds*count,giftImage,giftAnimatedImage};
}
function absoluteGiftUrl(v){const raw=String(v||'').trim();if(!raw)return '';if(/^https?:\/\//i.test(raw)||/^data:image\//i.test(raw))return raw;return raw.startsWith('/')?TIKTOK_GIFT_IMAGE_BASE+raw:''}
function sourceIsFresh(key){return Date.now()-Number(giftCatalogCache.sources?.[key]?.updatedAt||0)<GIFT_CATALOG_REFRESH_MS}
async function refreshTikTokGiftCatalog(force=false){
 if(!force&&sourceIsFresh('tiktok')&&giftCatalogCache.items.filter(x=>x.platform==='TikTok'&&x.region==='DO').length>100)return {ok:true,cached:true,count:giftCatalogCache.items.filter(x=>x.platform==='TikTok'&&x.region==='DO').length};
 const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),12000);
 try{
  const r=await fetch(TIKTOK_GIFT_SOURCE_URL,{headers:{'User-Agent':'GRENA-LIVE/4.0 Gift Catalog','Accept':'application/json'},signal:ac.signal,cache:'no-store'});if(!r.ok)throw Error(`TikTok catálogo HTTP ${r.status}`);
  const data=await r.json();const gifts=Array.isArray(data?.gifts)?data.gifts:[];const rows=gifts.filter(g=>Array.isArray(g?.regions)&&g.regions.includes('DO')).map(g=>normalizeCatalogItem({platform:'TikTok',id:`beet:${g.slug||giftTextKey(g.name).replace(/[^a-z0-9]+/g,'-')}`,name:g.name,nameEs:tiktokGiftSpanishName(g.name),category:'gift',giftKind:'tiktok-gift',amount:g.coins,unit:'coins',image:absoluteGiftUrl(g.image_url),animatedImage:'',source:'BeetGames',region:'DO',updatedAt:Date.now(),meta:{slug:g.slug||'',pageUrl:g.page_url?absoluteGiftUrl(g.page_url):'',sourceUpdatedAt:g.updated_at||''}}));
  giftCatalogCache.items=giftCatalogCache.items.filter(x=>!(x.platform==='TikTok'&&x.region==='DO'&&(x.source==='BeetGames'||x.source==='GREÑA fallback')));
  giftCatalogCache.items.push(...rows);giftCatalogCache.sources.tiktok={updatedAt:Date.now(),sourceUpdatedAt:data?.updated_at||'',source:TIKTOK_GIFT_SOURCE_URL,count:rows.length,error:''};scheduleGiftCatalogSave();return {ok:true,cached:false,count:rows.length};
 }finally{clearTimeout(timer)}
}
function twitchCheermoteImage(tier={},format='static'){
 const imgs=tier?.images||{};const theme=imgs.dark||imgs.light||{};const fmt=theme[format]||theme.static||{};return String(fmt['4']||fmt['3']||fmt['2']||fmt['1.5']||fmt['1']||'')
}
async function refreshTwitchGiftCatalog(force=false){
 if(!twitchCfg?.token){giftCatalogCache.sources.twitch={...(giftCatalogCache.sources.twitch||{}),updatedAt:Number(giftCatalogCache.sources.twitch?.updatedAt||0),source:'Twitch Helix',error:'Conecta Twitch para cargar Cheermotes oficiales.'};return {ok:false,count:giftCatalogCache.items.filter(x=>x.platform==='Twitch').length,error:giftCatalogCache.sources.twitch.error}}
 if(!force&&sourceIsFresh('twitch')&&giftCatalogCache.items.some(x=>x.platform==='Twitch'&&x.source==='Twitch Helix'&&x.image))return {ok:true,cached:true,count:giftCatalogCache.items.filter(x=>x.platform==='Twitch').length};
 let d;try{d=await twitchHelix(`/bits/cheermotes?broadcaster_id=${encodeURIComponent(twitchCfg.userId)}`,twitchCfg)}catch{d=await twitchHelix('/bits/cheermotes',twitchCfg)}
 const rows=[];for(const c of d.data||[]){for(const tier of c.tiers||[]){const amount=Math.max(0,Number(tier.min_bits||tier.id||0)||0);rows.push(normalizeCatalogItem({platform:'Twitch',id:`cheermote:${c.prefix}:${tier.id||amount}`,name:`${c.prefix} ${amount.toLocaleString('en-US')} Bits`,nameEs:`${amount.toLocaleString('es-DO')} Bits · ${c.prefix}`,category:'bits',giftKind:'bits',amount,unit:'bits',image:twitchCheermoteImage(tier,'static'),animatedImage:twitchCheermoteImage(tier,'animated'),source:'Twitch Helix',updatedAt:Date.now(),meta:{prefix:c.prefix||'Cheer',tier:String(tier.id||amount),type:c.type||'',color:tier.color||'',lastUpdated:c.last_updated||''}}))}}
 giftCatalogCache.items=giftCatalogCache.items.filter(x=>!(x.platform==='Twitch'&&x.source==='Twitch Helix'));giftCatalogCache.items.push(...rows);giftCatalogCache.sources.twitch={updatedAt:Date.now(),source:'Twitch Helix',count:rows.length,error:''};scheduleGiftCatalogSave();return {ok:true,cached:false,count:rows.length};
}
function catalogMatch(platform,{name='',amount=0,event='gift'}={}){
 const p=catalogPlatform(platform),n=giftTextKey(name),num=Math.max(0,Number(amount)||0),items=giftCatalogCache.items.filter(x=>x.platform===p);
 if(n){const exact=items.find(x=>giftTextKey(x.name)===n||giftTextKey(x.nameEs)===n);if(exact)return exact}
 if(p==='Twitch'&&event==='cheer'&&num>0){return items.filter(x=>x.giftKind==='bits'&&Number(x.amount)<=num).sort((a,b)=>Number(b.amount)-Number(a.amount))[0]||null}
 if(p==='Kick'&&num>0){return items.find(x=>x.giftKind==='kicks'&&Number(x.amount)===num)||null}
 return null;
}
function rememberObservedCatalogGift(platform,event,extra={}){
 if(event!=='gift'&&event!=='cheer')return;const p=catalogPlatform(platform);const amount=p==='Twitch'?Number(extra.bits||0):p==='Kick'?Number(extra.amount||0):Number(extra.unitDiamonds||0);const name=String(extra.giftNameOriginal||extra.giftName||(event==='cheer'?'Bits':'Regalo')).trim();let hit=catalogMatch(p,{name,amount,event});
 if(p==='Kick'&&name&&!/^\d[\d,.]*\s*KICKs?$/i.test(name)&&hit?.id?.startsWith('kicks:'))hit=null;
 const liveId=extra.giftId?`live:${extra.giftId}`:(p==='Kick'&&name?`live:${giftTextKey(name).replace(/[^a-z0-9]+/g,'-')}:${amount}`:'');
 const raw={platform:p,id:hit?.id||liveId,name:hit?.name||name,nameEs:p==='TikTok'?tiktokGiftSpanishName(name):(hit?.nameEs||name),category:event==='cheer'?'bits':'gift',giftKind:extra.giftKind||hit?.giftKind||'',amount:hit?.amount||amount,unit:hit?.unit||(p==='Twitch'?'bits':p==='Kick'?'KICKs':'diamonds'),image:extra.giftImage||hit?.image||'',animatedImage:extra.giftAnimatedImage||extra.animatedImage||hit?.animatedImage||'',source:hit?.source||'LIVE observado',region:hit?.region||'',observed:true,updatedAt:Date.now(),meta:{...(hit?.meta||{}),liveGiftId:extra.giftId||'',lastSeenAt:Date.now()}};
 upsertCatalogItem(raw,{preferName:true});
}
function enrichAlertMedia(platform,event,extra={}){
 const p=catalogPlatform(platform),amount=p==='Twitch'?Number(extra.bits||0):p==='Kick'?Number(extra.amount||0):Number(extra.unitDiamonds||0),name=String(extra.giftNameOriginal||extra.giftName||'');const hit=catalogMatch(p,{name,amount,event});if(!hit)return extra;
 const out={...extra};if(!out.giftImage&&hit.image)out.giftImage=hit.image;if(!out.giftAnimatedImage&&hit.animatedImage)out.giftAnimatedImage=hit.animatedImage;if(p==='TikTok'&&hit.nameEs){out.giftNameOriginal=out.giftNameOriginal||out.giftName||hit.name;out.giftName=hit.nameEs}return out;
}
function publicGiftCatalog({platform='',q='',animatedOnly=false}={}){
 const pf=catalogPlatform(platform),query=giftTextKey(q);let items=giftCatalogCache.items.slice();if(platform)items=items.filter(x=>x.platform===pf);if(query)items=items.filter(x=>[x.name,x.nameEs,x.unit,x.giftKind].some(v=>giftTextKey(v).includes(query)));if(animatedOnly)items=items.filter(x=>x.animatedImage);items.sort((a,b)=>a.platform.localeCompare(b.platform)||Number(a.amount)-Number(b.amount)||a.nameEs.localeCompare(b.nameEs,'es'));
 const stats={total:items.length,tiktok:items.filter(x=>x.platform==='TikTok').length,twitch:items.filter(x=>x.platform==='Twitch').length,kick:items.filter(x=>x.platform==='Kick').length,animated:items.filter(x=>x.animatedImage).length,observed:items.filter(x=>x.observed).length};return {version:1,updatedAt:giftCatalogCache.updatedAt,sources:giftCatalogCache.sources,stats,items};
}
function rememberActivity(a){activityHistory.unshift(a);if(activityHistory.length>120)activityHistory.length=120}
const FOLLOWER_GOALS_FILE=path.join(DATA_DIR,'follower-goals.json');
let followerGoals={settings:{tiktok:{start:0,goal:100,show:true},twitch:{start:0,goal:10,show:true},kick:{start:0,goal:10,show:true}},gained:{tiktok:0,twitch:0,kick:0}};
try{const fg=JSON.parse(fs.readFileSync(FOLLOWER_GOALS_FILE,'utf8'));followerGoals={settings:{...followerGoals.settings,...(fg.settings||{})},gained:{...followerGoals.gained,...(fg.gained||{})}}}catch{}
function publicFollowerGoals(){return {settings:followerGoals.settings,gained:followerGoals.gained}}
async function persistFollowerGoals(){await safeWriteJson(FOLLOWER_GOALS_FILE,followerGoals).catch(()=>{})}
function followerGoalFollow(platform){const p=String(platform||'').toLowerCase();if(!(p in followerGoals.gained))return;followerGoals.gained[p]=Math.max(0,Number(followerGoals.gained[p]||0))+1;persistFollowerGoals();broadcast({type:'follower-goals',state:publicFollowerGoals()})}
function alert(platform,event,name,message='',extra={}){
 extra=enrichAlertMedia(platform,event,extra);
 rememberObservedCatalogGift(platform,event,extra);
 const savedPreset=savedAlertDesigns[event]||{};
 const resolvedSound=resolveAlertSound(savedPreset,event);
 const preset={soundEnabled:true,...savedPreset,sound:resolvedSound,soundName:(resolvedSound===(DEFAULT_ALERT_SOUNDS[event]||DEFAULT_ALERT_SOUNDS.follow))?'Predeterminado':(savedPreset.soundName||'Personalizado'),soundProfileVersion:SOUND_PROFILE_VERSION};
 const thanks=preset.message||({follow:'¡Gracias por seguirme!',sub:'¡Gracias por suscribirte!',gift:'¡Gracias por el regalo!',cheer:'¡Gracias por los Bits!',share:'¡Gracias por compartir!',raid:'¡Gracias por la raid!',like:'¡Gracias por el apoyo!'})[event]||'¡Gracias por el apoyo!';
 let action=message||({follow:'te siguió',sub:'se suscribió',gift:'envió un regalo',cheer:'envió Bits',share:'compartió el LIVE',raid:'hizo una raid',like:'apoyó el LIVE'})[event]||'apoyó el stream';
 const count=Math.max(1,Number(extra.count||1)||1),unitDiamonds=Math.max(0,Number(extra.unitDiamonds??extra.diamondCount??0)||0),totalDiamonds=Math.max(0,Number(extra.totalDiamonds||0)||unitDiamonds*count);
 if(event==='gift'&&extra.giftName){
  if(platform==='TikTok')action=`envió ${extra.giftName}${count>1?' × '+count:''}${totalDiamonds>0?' · '+totalDiamonds.toLocaleString('es-DO')+' diamantes':''}`;
  else if(platform==='Twitch'&&extra.giftKind==='subscription')action=`regaló ${count} ${count===1?'suscripción':'suscripciones'}${extra.tier?' · '+extra.tier:''}${extra.recipient?' · para '+extra.recipient:''}`;
  else if(platform==='Kick'&&extra.giftKind==='kicks')action=`envió ${extra.giftName}${Number(extra.amount)>0?' · '+Number(extra.amount).toLocaleString('es-DO')+' KICKs':''}`;
  else if(!message)action=`envió ${extra.giftName}${count>1?' × '+count:''}`;
 }
 if(event==='cheer'&&Number(extra.bits)>0)action=`envió ${Number(extra.bits).toLocaleString('es-DO')} Bits`;
 const a={...preset,platform,event,eventLabel:eventLabel(event),name:name||'Usuario',message:thanks,action,...extra,count,unitDiamonds,totalDiamonds,alertStyle:(extra.alertStyle||autoPrefs.alertStyle||'classic'),receivedAt:Date.now()};
 a.summary=`${platform} · ${a.name} ${action}`;
 const eventIdentity=String(extra.bridgeEventId||extra.eventId||extra.messageId||extra.msgId||extra.transactionId||extra.notificationId||'').trim();
 const coarseKey=[platform,event,String(a.name).toLowerCase(),extra.giftName||'',count,extra.bits||'',action.replace(/\d+/g,'#')].join('|');
 const key=eventIdentity?`id|${platform}|${event}|${eventIdentity}`:`coarse|${coarseKey}`;
 const now=Date.now(),last=recentAlerts.get(key)||0;
 // Los regalos legítimos pueden ser idénticos y llegar en menos de 1.8 s. Solo se deduplican por ID real;
 // para follow/sub/share/raid conservamos una ventana corta cuando la plataforma no entrega ID.
 const coarseWindow=event==='gift'||event==='cheer'?0:1800;if(last&&(eventIdentity?now-last<2*60*1000:coarseWindow&&now-last<coarseWindow))return;
 recentAlerts.set(key,now);for(const [k,t] of recentAlerts)if(now-t>2*60*1000)recentAlerts.delete(k);
 noteBridgeSignal(platform,event,{name:a.name,event,source:extra.tiktokSource||extra.kickEvent||extra.source||'alert'});pushEventHealth();
 rememberActivity(a);
 if(['TikTok','Twitch','Kick'].includes(platform)&&event!=='like'&&!['GREÑA_FAN','USUARIO_PRUEBA'].includes(String(a.name||'').toUpperCase()))recordLoyaltyEvent({platform,kind:event,user:a.name,nickname:a.name,avatar:a.avatar||'',count:a.count,totalDiamonds:a.totalDiamonds,bits:a.bits,amount:a.amount,viewers:a.viewers});
 if(event==='follow')followerGoalFollow(platform);
 broadcast({type:'alert',alert:a});broadcast({type:'activity',activity:a})
}
function json(res,code,obj){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(obj))}
async function persistAuth(){await safeWriteJson(stateFile('auth.json',LEGACY_AUTH_FILE),savedAuth).catch(()=>{})}
function b64url(buf){return Buffer.from(buf).toString('base64url')}
function configured(p){const c=oauthConfig[p]||{};if(['tiktok','twitch','kick'].includes(p)&&isBrokerProvider(p))return true;if(p==='tiktok')return !!(c.clientKey&&c.clientSecret);if(p==='twitch')return !!c.clientId;if(p==='kick')return !!(c.clientId&&c.clientSecret);return false}
async function persistOAuthConfig(){await safeWriteJson(CONFIG_FILE,oauthConfig)}
function callbackPage(res,ok,message){res.writeHead(ok?200:400,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><meta charset="utf-8"><title>GREÑA LIVE</title><body style="background:#090b10;color:white;font-family:Arial;text-align:center;padding:70px"><h2>${ok?'✓ Cuenta conectada':'No se pudo conectar'}</h2><p>${String(message||'').replace(/[<>&]/g,'')}</p><p>Ya puedes cerrar esta ventana.</p><script>setTimeout(()=>window.close(),1200)</script></body>`)}
async function postForm(url,params,headers={}){const r=await fetch(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(params)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error_description||d.message||d.error||`HTTP ${r.status}`);return d}

// Twitch exige validar los tokens de sesiones OAuth al iniciar y, como mínimo, una vez por hora.
// Si no hay internet no borramos la sesión: solo la invalidamos cuando Twitch responde 401.
async function validateTwitchAccessToken(token){
 if(!token)return {reachable:true,valid:false};
 try{
  const r=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:`OAuth ${token}`}});
  if(r.status===401)return {reachable:true,valid:false};
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.message||`Twitch validate HTTP ${r.status}`);
  return {reachable:true,valid:true,data};
 }catch(e){
  console.warn('Twitch validate:',e?.message||e);
  return {reachable:false,valid:null};
 }
}
async function refreshBrokerToken(platform){
 const cur=savedAuth[platform]||{};if(!cur.refresh_token||!isBrokerProvider(platform))throw Error(`La sesión de ${platform} necesita autorización de nuevo.`);
 const d=await authServiceFetch(`/v1/refresh/${platform}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refresh_token:cur.refresh_token})});
 const tok=d.tokens||d;if(!tok.access_token)throw Error(`GREÑA Auth no devolvió un access token de ${platform}.`);
 savedAuth[platform]={...cur,...tok,refresh_token:tok.refresh_token||cur.refresh_token,obtained_at:Date.now(),mode:'grena-auth'};await persistAuth();return savedAuth[platform];
}
async function refreshTwitchPublicToken(){
 const cur=savedAuth.twitch||{},clientId=String(oauthConfig.twitch?.clientId||'').trim();
 if(!clientId||!cur.refresh_token)throw Error('La sesión de Twitch necesita autorización de nuevo.');
 const tok=await postForm('https://id.twitch.tv/oauth2/token',{client_id:clientId,grant_type:'refresh_token',refresh_token:cur.refresh_token});
 if(!tok.access_token)throw Error('Twitch no devolvió un access token nuevo.');
 savedAuth.twitch={...cur,...tok,refresh_token:tok.refresh_token||cur.refresh_token,obtained_at:Date.now(),mode:'device-code-public'};
 await persistAuth();return savedAuth.twitch;
}
async function maintainTwitchAuth(){
 let token=savedAuth.twitch?.access_token;
 if(!token)return;
 let check=await validateTwitchAccessToken(token);
 if(check.valid!==false)return;
 if(savedAuth.twitch?.refresh_token&&oauthConfig.twitch?.clientId){
  try{const fresh=await refreshTwitchPublicToken();token=fresh.access_token;await startTwitch(token);return}catch(e){console.warn('Twitch public refresh:',e?.message||e)}
 }
 if(savedAuth.twitch?.refresh_token&&isBrokerProvider('twitch')){
  try{const fresh=await refreshBrokerToken('twitch');token=fresh.access_token;await startTwitch(token);return}catch(e){console.warn('Twitch broker refresh:',e?.message||e)}
 }
 delete savedAuth.twitch;
 await persistAuth();
 if(twitchViewerTimer)clearInterval(twitchViewerTimer);
 twitchViewerTimer=null;
 twitchCfg=null;
 if(twitchWS)try{twitchWS.close()}catch{}
 twitchWS=null;
 setViewers('twitch',0);
 setStatus('twitch',false,'Sesión de Twitch vencida · vuelve a iniciar sesión');
}
async function restoreTwitchSession(){
 const token=savedAuth.twitch?.access_token;if(!token)return;
 const check=await validateTwitchAccessToken(token);
 if(check.valid===false){await maintainTwitchAuth();return}
 await startTwitch(token);
}
function startTwitchValidation(){
 if(twitchValidationTimer)clearInterval(twitchValidationTimer);
 maintainTwitchAuth();
 twitchValidationTimer=setInterval(maintainTwitchAuth,60*60*1000);
}


let kickAppToken='',kickTokenExpiresAt=0,kickViewerTimer=null;
async function kickAppAccessToken(){
 const c=oauthConfig.kick||{};if(!c.clientId||!c.clientSecret)throw Error(isBrokerProvider('kick')?'Inicia sesión con Kick para activar el contador oficial.':'Falta configurar Kick Client ID / Client Secret.');
 if(kickAppToken&&Date.now()<kickTokenExpiresAt-60000)return kickAppToken;
 const r=await fetch('https://id.kick.com/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:c.clientId,client_secret:c.clientSecret})});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error_description||d.message||d.error||`Kick OAuth HTTP ${r.status}`);
 kickAppToken=d.access_token||'';kickTokenExpiresAt=Date.now()+Math.max(60,Number(d.expires_in||3600))*1000;return kickAppToken;
}
async function kickApi(path){
 let token=savedAuth.kick?.access_token||'';
 if(!token)token=await kickAppAccessToken();
 const request=tok=>fetch(`https://api.kick.com${path}`,{headers:{Authorization:`Bearer ${tok}`,'Accept':'application/json'}});
 let r=await request(token);
 if(r.status===401&&savedAuth.kick?.refresh_token&&isBrokerProvider('kick')){
  try{const fresh=await refreshBrokerToken('kick');token=fresh.access_token;r=await request(token)}catch(e){console.warn('Kick refresh:',e?.message||e)}
 }
 // Para endpoints públicos (canal/viewers), si la sesión de usuario expiró y no se pudo
 // refrescar, intentamos el token de aplicación antes de declarar el contador roto.
 if(r.status===401&&oauthConfig.kick?.clientId&&oauthConfig.kick?.clientSecret){
  try{token=await kickAppAccessToken();r=await request(token)}catch{}
 }
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error_description||d.error||`Kick API HTTP ${r.status}`);return d;
}
async function refreshKick(){
 const slug=currentKickSlug();if(!slug)return;
 try{
  const ch=await kickApi(`/public/v1/channels?slug=${encodeURIComponent(slug)}`);
  const channel=Array.isArray(ch?.data)?ch.data[0]:ch?.data?.[0]||ch?.data;
  const broadcasterId=channel?.broadcaster_user_id||channel?.user_id||channel?.id;
  if(!broadcasterId)throw Error('Kick no encontró ese canal.');
  const ls=await kickApi(`/public/v1/livestreams?broadcaster_user_id=${encodeURIComponent(broadcasterId)}`);
  const stream=Array.isArray(ls?.data)?ls.data[0]:ls?.data?.[0]||ls?.data;
  const n=Number(stream?.viewer_count??stream?.viewers??0);
  setViewers('kick',Number.isFinite(n)?n:0,stream?'Kick Public API':'Kick Public API · offline');
  setStatus('kick',true,stream?`${slug} · cuenta vinculada · LIVE activo`:`${slug} · cuenta vinculada · offline`,slug);
 }catch(e){viewerMeta.kick.source='error';setStatus('kick',!!savedAuth.kick?.access_token,`${slug} · ${savedAuth.kick?.access_token?'cuenta vinculada · ':''}${e.message||'error de Kick'}`,slug);console.warn('Kick:',e?.message||e)}
}
function startKickPolling(){if(kickViewerTimer)clearInterval(kickViewerTimer);refreshKick();kickViewerTimer=setInterval(refreshKick,15000)}

function parseTikTokUser(input=''){
 const x=String(input||'').trim();if(!x)return '';
 const m=x.match(/(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@([^/?#]+)/i);
 const raw=(m?.[1]||(/^@?[A-Za-z0-9._-]{2,64}$/.test(x)?x:''));
 return String(raw||'').replace(/^@/,'').trim();
}
async function resolveTikTokLiveTarget(input=''){
 const raw=String(input||'').trim();if(!raw)throw Error('Pega el link del LIVE de TikTok.');
 let username=parseTikTokUser(raw);
 if(!username&&/^https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\//i.test(raw)){
  try{
   const r=await fetch(raw,{redirect:'follow',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Mozilla/5.0'}});
   username=parseTikTokUser(r.url||'');
  }catch{}
 }
 if(!username)throw Error('Ese enlace no parece un LIVE de TikTok válido. Copia el link del LIVE y vuelve a intentarlo.');
 return {username,url:`https://www.tiktok.com/@${username}/live`};
}
function parseTwitchLogin(input=''){const x=String(input).trim();const m=x.match(/twitch\.tv\/([^/?#]+)/i);return (m?.[1]||x).replace(/^@/,'').trim()}
async function connectCounterTikTok(input){
 const username=parseTikTokUser(input);if(!username)throw Error('Pon el link o usuario de TikTok.');
 if(counterTikTokConnecting)return {username:counterTikTokUser||username,pending:true};
 counterTikTokConnecting=true;
 try{
  clearTikTokCounterTimers();
  const previousCounterUser=String(counterTikTokUser||'').toLowerCase();
  const preserveHealthyCount=previousCounterUser===String(username||'').toLowerCase()&&viewers.tiktok>0&&Date.now()-Number(viewerMeta.tiktok.lastGoodAt||0)<30000;
  const old=counterTikTok;counterTikTok=null;if(old){try{old.disconnect()}catch{}}
  if(preserveHealthyCount){viewerMeta.tiktok.source='reconectando contador TikTok';viewerMeta.tiktok.zeroHits=0;viewerMeta.tiktok.lastZeroAt=0}
  else{viewerMeta.tiktok={lastGood:0,lastGoodAt:0,source:'conectando',zeroHits:0,lastZeroAt:0,spikeValue:0,spikeHits:0,spikeAt:0,spikeSources:[]};setViewers('tiktok',0,'reset contador TikTok')}
  counterTikTokUser=username;counterTikTokLastSignalAt=Date.now();counterTikTokPollFailures=0;
  const c=new TikTokLiveConnection(username,{processInitialData:true,fetchRoomInfoOnConnect:true,enableExtendedGiftInfo:false});counterTikTok=c;
  // Camino 1: evento realtime de TikTok.
  const update=d=>setTikTokViewersFromEvent(d,'TikTok ROOM_USER');
  c.on(WebcastEvent.ROOM_USER||'roomUser',update);
  // Tercer respaldo: MEMBER lleva memberCount en el protocolo v2. Solo se usa si no
  // hemos recibido una cifra mejor recientemente.
  // MEMBER trae memberCount, pero TikTok puede usarlo como acumulado/auxiliar. No lo usamos
  // para el contador OBS; ROOM_USER + room/info son las fuentes de viewers actuales.
  if(WebcastEvent.STREAM_END)c.on(WebcastEvent.STREAM_END,()=>{
   if(counterTikTok!==c)return;
   counterTikTok=null;if(counterTikTokPollTimer){clearInterval(counterTikTokPollTimer);counterTikTokPollTimer=null}
   counterTikTokLastSignalAt=0;counterTikTokPollFailures=0;
   setViewers('tiktok',0,'TikTok STREAM_END contador');
   setStatus('tiktok',false,`@${username} · LIVE terminó · esperando próximo LIVE`,username);
   try{c.disconnect()}catch{}
  });
  c.on('disconnected',()=>{
   if(counterTikTok!==c)return;
   counterTikTok=null;if(counterTikTokPollTimer){clearInterval(counterTikTokPollTimer);counterTikTokPollTimer=null}
   viewerMeta.tiktok.source='contador desconectado · reconectando';
   if(bridgeRuntime.tiktok)setStatus('tiktok',true,`@${username} · LIVE/chat activo · contador reconectando`,username);
   else setStatus('tiktok',false,`@${username} · contador reconectando`,username);
   scheduleTikTokCounterReconnect(username);
  });
  c.on('error',e=>{counterTikTokPollFailures++;viewerMeta.tiktok.source='contador error · comprobando reconexión';console.warn('Contador TikTok:',e?.message||e);restartTikTokCounterIfStuck(c,username,e?.message||'error')});
  const st=await c.connect();
  let initial=readTikTokViewerCount(st);if(initial!==null)setViewers('tiktok',initial,'TikTok conexión inicial');
  // Camino 2: room/info. Este endpoint contiene data.user_count y evita depender de ROOM_USER.
  try{const ok=await refreshCounterTikTok(c,'TikTok room/info inicial');if(ok)initial=viewers.tiktok}catch(e){console.warn('TikTok room/info inicial:',e?.message||e)}
  counterTikTokPollTimer=setInterval(async()=>{
   if(counterTikTok!==c)return;
   try{
    const ok=await refreshCounterTikTok(c,'TikTok room/info');
    if(!ok){counterTikTokPollFailures++;restartTikTokCounterIfStuck(c,username,'room/info sin viewer count')}
   }catch(e){
    counterTikTokPollFailures++;viewerMeta.tiktok.source='TikTok room/info temporalmente no disponible';console.warn('TikTok room/info:',e?.message||e);restartTikTokCounterIfStuck(c,username,e?.message||'room/info')
   }
  },8000);
  counterTikTokPollTimer.unref?.();
  setStatus('tiktok',true,`@${username} · contador conectado`,username);return {username,initial};
 }catch(e){
  if(counterTikTok){const failed=counterTikTok;counterTikTok=null;try{failed.disconnect()}catch{}}
  if(counterTikTokPollTimer){clearInterval(counterTikTokPollTimer);counterTikTokPollTimer=null}
  counterTikTokPollFailures++;viewerMeta.tiktok.source=`contador error · ${e?.message||e}`;scheduleTikTokCounterReconnect(username);throw e;
 }finally{counterTikTokConnecting=false}
}
async function refreshCounterTwitch(){
 if(!counterTwitchLogin)return;
 const token=savedAuth.twitch?.access_token||twitchCfg?.token;if(!token)throw Error('Primero conecta Twitch una vez en GREÑA Alertas.');
 const cfg={token};const d=await twitchHelix(`/streams?user_login=${encodeURIComponent(counterTwitchLogin)}`,cfg);
 const stream=d.data?.[0];
 if(stream&&Number.isFinite(Number(stream.viewer_count))){viewerMeta.twitch.zeroHits=0;setViewers('twitch',stream.viewer_count,'Twitch Helix');return}
 // Helix puede devolver data:[] momentáneamente. No borrar un valor real por una sola respuesta vacía.
 viewerMeta.twitch.zeroHits=(viewerMeta.twitch.zeroHits||0)+1;viewerMeta.twitch.source='Twitch Helix · respuesta vacía';
 if(viewerMeta.twitch.zeroHits>=3)setViewers('twitch',0,'Twitch Helix · offline confirmado');
}
async function connectCounterTwitch(input){
 const login=parseTwitchLogin(input);if(!login)throw Error('Pon el link o canal de Twitch.');
 if(counterTwitchTimer)clearInterval(counterTwitchTimer);
 counterTwitchTimer=null;counterTwitchLogin=login;
 try{
  await refreshCounterTwitch();
  counterTwitchTimer=setInterval(()=>refreshCounterTwitch().catch(e=>console.warn('Contador Twitch:',e?.message||e)),15000);
  setStatus('twitch',true,`${login} · chat + contador conectados`,login);
  return {login};
 }catch(e){
  counterTwitchLogin='';
  throw e;
 }
}

// TikTok: Login Kit identifica la cuenta. Los eventos LIVE siguen entrando por el conector LIVE.
async function connectTikTokLive(username){
 username=String(username||'').trim().replace(/^@/,'');if(!username)throw Error('TikTok no devolvió el nombre de usuario.');
 if(tiktok){try{tiktok.disconnect()}catch{}tiktok=null}
 setStatus('tiktok',false,`@${username} · buscando LIVE…`,username);
 // La lectura del LIVE es anónima: no necesita la cookie de la cuenta vinculada.
 // enableExtendedGiftInfo se mantiene en false porque esa lista requiere una firma premium en la versión actual.
 const c=new TikTokLiveConnection(username,{processInitialData:false,enableExtendedGiftInfo:false});tiktok=c;let likeTotal=0,lastLikeMilestone=0;const who=d=>d.user?.nickname||d.user?.uniqueId||'Usuario';const uid=d=>String(d?.user?.uniqueId||d?.user?.unique_id||d?.user?.id||d?.uniqueId||who(d));const avatar=d=>d.user?.profilePictureUrl||d.user?.avatarThumb?.urlList?.[0]||d.user?.avatarMedium?.urlList?.[0]||d.user?.avatarLarger?.urlList?.[0]||d.profilePictureUrl||'';
 const recentFollow=new Map();const emitFollow=(d,source='follow')=>{const key=uid(d).toLowerCase(),now=Date.now();if(key&&now-(recentFollow.get(key)||0)<7000)return;recentFollow.set(key,now);alert('TikTok','follow',who(d),'te siguió',{avatar:avatar(d),tiktokSource:source,userId:uid(d)})};
 const socialIsFollow=d=>{const parts=[];const walk=(v,key='',depth=0)=>{if(depth>4||v==null)return;if(typeof v==='string'){if(/display|action|label|event|type|pattern|key|text|schema|describe/i.test(key))parts.push(v);return}if(Array.isArray(v)){for(const x of v.slice(0,20))walk(x,key,depth+1);return}if(typeof v==='object'){for(const [k,x] of Object.entries(v))walk(x,k,depth+1)}};walk(d);const text=parts.join(' ').toLowerCase();return /(^|[^a-z])(follow|followed|follows|following)([^a-z]|$)|ttlive[^ ]*follow|sigui[oó]|empez[oó] a seguir|nuevo seguidor/i.test(text)};
 c.on(WebcastEvent.FOLLOW,d=>emitFollow(d,'follow'));
 if(WebcastEvent.SOCIAL)c.on(WebcastEvent.SOCIAL,d=>{if(socialIsFollow(d))emitFollow(d,'social-fallback')});
 const ttSubEvent=WebcastEvent.SUB_NOTIFY||'subNotify';c.on(ttSubEvent,d=>alert('TikTok','sub',who(d),'se suscribió',{avatar:avatar(d),months:Number(d?.subMonth||0)||undefined,tiktokSource:'subNotify',eventId:String(d?.msgId||d?.common?.msgId||d?.id||'')}));
 c.on(WebcastEvent.GIFT,d=>{if((d.giftType??d.giftDetails?.giftType??d.gift?.type)===1&&!d.repeatEnd)return;const g=normalizeTikTokGift(d,c);alert('TikTok','gift',who(d),'',{avatar:avatar(d),...g,giftKind:'tiktok-gift',eventId:String(d?.msgId||d?.common?.msgId||d?.id||d?.repeatCount&&`${uid(d)}:${d?.giftId||d?.gift?.id||''}:${d.repeatCount}:${Date.now()}`||'')})});
 c.on(WebcastEvent.SHARE,d=>alert('TikTok','share',who(d),'compartió el LIVE',{avatar:avatar(d)}));
 c.on(WebcastEvent.LIKE,d=>{const n=Math.max(1,Number(d.likeCount||1)||1);recordTapTap({userId:uid(d),user:uid(d),nickname:who(d),avatar:avatar(d),amount:n});recordLoyaltyEvent({platform:'TikTok',kind:'like',user:uid(d),nickname:who(d),avatar:avatar(d),amount:n});likeTotal+=n;const milestone=Math.floor(likeTotal/100)*100;if(milestone>=100&&milestone>lastLikeMilestone){lastLikeMilestone=milestone;alert('TikTok','like',who(d),`${milestone.toLocaleString()} likes acumulados`,{likes:milestone})}});
 c.on(WebcastEvent.MEMBER,d=>broadcast({type:'activity',activity:{platform:'TikTok',event:'join',name:who(d),message:'Entró al LIVE',receivedAt:Date.now()}}));
 c.on(WebcastEvent.ROOM_USER,d=>{setTikTokViewersFromEvent(d,'TikTok LIVE fallback')});
 if(WebcastEvent.STREAM_END)c.on(WebcastEvent.STREAM_END,()=>{if(tiktok===c)tiktok=null;setViewers('tiktok',0,'TikTok STREAM_END');endTapTapSession();if(!bridgeRuntime.tiktok)setStatus('tiktok',false,`@${username} · LIVE terminó`,username)});
 c.on('disconnected',()=>{
  if(tiktok===c)tiktok=null;
  if(!bridgeRuntime.tiktok){
   if(tiktokDedicatedCounterHealthy())setStatus('tiktok',true,`@${username} · contador activo · LIVE fallback reconectando`,username);
   else{setStatus('tiktok',false,`@${username} · LIVE reconectando`,username);scheduleTikTokBridgeDisconnectGrace(username)}
  }
 });c.on('error',e=>console.warn('TikTok LIVE:',e?.message||e));
 try{await c.connect();setStatus('tiktok',true,`@${username} · LIVE conectado`,username)}catch(e){
  if(tiktok===c)tiktok=null;
  if(!bridgeRuntime.tiktok&&!tiktokDedicatedCounterHealthy())scheduleTikTokBridgeDisconnectGrace(username);
  setStatus('tiktok',true,`@${username} · sesión iniciada (sin LIVE)`,username);console.warn('TikTok login correcto; LIVE no disponible:',e?.message||e)
 }
}


// TikTok Desktop Bridge: abre TikTok real en Chrome, conserva un perfil local y reutiliza su sesión.
// No guarda contraseña. Solo conserva las cookies de sesión necesarias en .grena-auth.json.
async function beginTikTokBrowserLogin(){
 if(tiktokLoginContext) throw Error('Ya hay una ventana de TikTok abierta para iniciar sesión.');
 setStatus('tiktok',false,'Abriendo TikTok… inicia sesión en la ventana');
 const profileDir=currentTikTokProfileDir();
 let ctx;
 try{
  ctx=await chromium.launchPersistentContext(profileDir,{channel:'chrome',headless:false,viewport:null,args:['--start-maximized']});
 }catch(e){
  try{ctx=await chromium.launchPersistentContext(profileDir,{channel:'msedge',headless:false,viewport:null,args:['--start-maximized']})}
  catch{throw Error('No pude abrir Google Chrome ni Microsoft Edge. Instala uno de los dos y vuelve a intentarlo.')}
 }
 tiktokLoginContext=ctx;
 const page=ctx.pages()[0]||await ctx.newPage();
 await page.goto('https://www.tiktok.com/login',{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{});
 const deadline=Date.now()+10*60*1000;
 while(Date.now()<deadline){
  if(!tiktokLoginContext) throw Error('La ventana de TikTok se cerró antes de completar el inicio de sesión.');
  const cookies=await ctx.cookies('https://www.tiktok.com').catch(()=>[]);
  const sessionId=cookies.find(c=>c.name==='sessionid')?.value;
  const ttTargetIdc=cookies.find(c=>c.name==='tt-target-idc')?.value||'useast1a';
  if(sessionId){
   let account=null;
   try{
    account=await page.evaluate(async()=>{
      const r=await fetch('/passport/web/account/info/?aid=1988&app_language=es&app_name=tiktok_web',{credentials:'include'});
      return await r.json();
    });
   }catch{}
   const username=account?.data?.username||account?.data?.user?.username||account?.data?.screen_name||'';
   if(username){
    savedAuth.tiktok={mode:'browser-session',username,sessionId,ttTargetIdc};
    await persistAuth();
    setStatus('tiktok',true,`@${username} · sesión iniciada`,username);
    await ctx.close().catch(()=>{});tiktokLoginContext=null;
    await connectTikTokLive(username);
    return;
   }
   setStatus('tiktok',false,'TikTok detectado · terminando conexión…');
  }
  await new Promise(r=>setTimeout(r,1200));
 }
 await ctx.close().catch(()=>{});tiktokLoginContext=null;
 throw Error('Se agotó el tiempo para iniciar sesión en TikTok.');
}

async function twitchHelix(path,cfg,opts={}){if(!oauthConfig.twitch?.clientId&&AUTH_SERVICE_URL)await loadAuthServiceConfig();if(!oauthConfig.twitch?.clientId)throw Error('GREÑA no tiene disponible el Client ID público de Twitch.');const r=await fetch('https://api.twitch.tv/helix'+path,{...opts,headers:{'Client-Id':oauthConfig.twitch.clientId,'Authorization':`Bearer ${cfg.token}`,'Content-Type':'application/json',...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||`Twitch HTTP ${r.status}`);return d}
async function subscribeTwitch(sessionId,type,version,condition){const r=await fetch('https://api.twitch.tv/helix/eventsub/subscriptions',{method:'POST',headers:{'Client-Id':oauthConfig.twitch.clientId,'Authorization':`Bearer ${twitchCfg.token}`,'Content-Type':'application/json'},body:JSON.stringify({type,version,condition,transport:{method:'websocket',session_id:sessionId}})});if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.message||`${type}: ${r.status}`)}}
async function twitchSubscriptions(s){
 const b=twitchCfg.userId,list=[['channel.follow','2',{broadcaster_user_id:b,moderator_user_id:b}],['channel.subscribe','1',{broadcaster_user_id:b}],['channel.subscription.message','1',{broadcaster_user_id:b}],['channel.subscription.gift','1',{broadcaster_user_id:b}],['channel.cheer','1',{broadcaster_user_id:b}],['channel.raid','1',{to_broadcaster_user_id:b}]];
 twitchEventHealth.ready=false;twitchEventHealth.active=[];twitchEventHealth.failed=[];twitchEventHealth.lastError='';pushEventHealth();
 for(const d of list){
  try{await subscribeTwitch(s,...d);twitchEventHealth.active.push(d[0])}
  catch(e){const msg=String(e?.message||e);twitchEventHealth.failed.push(d[0]);twitchEventHealth.lastError=msg;console.warn('Twitch EventSub',d[0],msg)}
 }
 twitchEventHealth.ready=twitchEventHealth.failed.length===0&&twitchEventHealth.active.length===list.length;twitchEventHealth.updatedAt=Date.now();pushEventHealth();
}
async function twitchAvatar(userId){if(!userId||!twitchCfg)return '';const hit=twitchAvatarCache.get(userId);if(hit&&Date.now()-hit.at<30*60e3)return hit.url;try{const d=await twitchHelix(`/users?id=${encodeURIComponent(userId)}`,twitchCfg);const url=d.data?.[0]?.profile_image_url||'';twitchAvatarCache.set(userId,{url,at:Date.now()});if(twitchAvatarCache.size>500){const first=twitchAvatarCache.keys().next().value;twitchAvatarCache.delete(first)}return url}catch{return hit?.url||''}}
async function twitchUserMeta(userId){
 const id=String(userId||'').trim();if(!id||!twitchCfg)return {avatar:'',isFollower:null};
 const hit=twitchFollowerCache.get(id);if(hit&&Date.now()-hit.at<5*60e3)return hit.value;
 let isFollower=null,avatar='';
 try{
  [avatar,isFollower]=await Promise.all([
   twitchAvatar(id),
   id===String(twitchCfg.userId)?Promise.resolve(false):twitchHelix(`/channels/followers?broadcaster_id=${encodeURIComponent(twitchCfg.userId)}&user_id=${encodeURIComponent(id)}`,twitchCfg).then(d=>Array.isArray(d.data)?d.data.length>0:null).catch(()=>null)
  ]);
 }catch{}
 const value={avatar:avatar||'',isFollower};twitchFollowerCache.set(id,{at:Date.now(),value});
 if(twitchFollowerCache.size>1000){const first=twitchFollowerCache.keys().next().value;twitchFollowerCache.delete(first)}
 return value;
}
function twitchTier(t){return ({'1000':'Tier 1','2000':'Tier 2','3000':'Tier 3'})[String(t||'')]||''}
async function handleTwitchEvent(meta,p){const e=p.event||{};const uid=e.user_id||e.from_broadcaster_user_id||'';const avatar=await twitchAvatar(uid);switch(meta.subscription_type){case'channel.follow':alert('Twitch','follow',e.user_name,'te siguió',{avatar});break;case'channel.subscribe':{if(e.is_gift)break;const tier=twitchTier(e.tier);alert('Twitch','sub',e.user_name,`se suscribió${tier?' · '+tier:''}`,{avatar,tier});break}case'channel.subscription.message':{const tier=twitchTier(e.tier),months=Number(e.cumulative_months||e.duration_months||0);alert('Twitch','sub',e.user_name,`renovó su suscripción${months?' · '+months+' meses':''}${tier?' · '+tier:''}`,{avatar,tier,months});break}case'channel.subscription.gift':{const tier=twitchTier(e.tier),count=Math.max(1,Number(e.total||1)||1);alert('Twitch','gift',e.user_name||'Anónimo','',{avatar,giftName:tier?`Suscripción regalada · ${tier}`:'Suscripción regalada',giftKind:'subscription',count,tier,isAnonymous:!!e.is_anonymous});break}case'channel.cheer':alert('Twitch','cheer',e.user_name||'Anónimo','',{avatar,bits:Number(e.bits||0),giftName:'Bits',giftKind:'bits'});break;case'channel.raid':alert('Twitch','raid',e.from_broadcaster_user_name||'Canal',`hizo una raid con ${e.viewers||0} espectadores`,{avatar,viewers:e.viewers||0});break}}
function openTwitchWS(url='wss://eventsub.wss.twitch.tv/ws'){
 if(twitchWS)try{twitchWS.close()}catch{};
 const ws=new WebSocket(url);twitchWS=ws;
 ws.on('message',async raw=>{try{const d=JSON.parse(raw),t=d.metadata?.message_type;if(t==='session_welcome'){await twitchSubscriptions(d.payload.session.id);setStatus('twitch',true,`${twitchCfg.login} · conectado`,twitchCfg.login);pushEventHealth()}else if(t==='notification')handleTwitchEvent(d.metadata,d.payload);else if(t==='revocation'){const ty=d.payload?.subscription?.type||'evento';twitchEventHealth.failed=[...new Set([...twitchEventHealth.failed,ty])];twitchEventHealth.ready=false;twitchEventHealth.lastError=`Twitch revocó ${ty}`;pushEventHealth()}else if(t==='session_reconnect'&&d.payload.session.reconnect_url)openTwitchWS(d.payload.session.reconnect_url)}catch(e){console.error('Twitch WS',e)}});
 ws.on('error',e=>{const msg=e?.message||String(e);console.warn('Twitch WS:',msg);twitchEventHealth.ready=false;twitchEventHealth.lastError=msg;pushEventHealth();if(twitchCfg)setStatus('twitch',false,'Twitch sin conexión · reintentando…',twitchCfg.login)});
 ws.on('close',()=>{twitchEventHealth.ready=false;pushEventHealth();if(twitchCfg){setStatus('twitch',false,'Desconectado · reconectando…',twitchCfg.login);setTimeout(()=>{if(twitchCfg&&twitchWS===ws)openTwitchWS()},5000)}});
}
async function refreshTwitchViewers(){if(counterTwitchLogin)return; if(!twitchCfg)return;try{const d=await twitchHelix(`/streams?user_id=${encodeURIComponent(twitchCfg.userId)}`,twitchCfg);setViewers('twitch',d.data?.[0]?.viewer_count??0)}catch(e){console.warn('Twitch viewers:',e?.message||e)}}
function startTwitchViewerPolling(){if(twitchViewerTimer)clearInterval(twitchViewerTimer);refreshTwitchViewers();twitchViewerTimer=setInterval(refreshTwitchViewers,15000)}
async function startTwitch(token){const cfg={token};const me=await twitchHelix('/users',cfg);if(!me.data?.[0])throw Error('No se pudo leer la cuenta de Twitch.');cfg.userId=me.data[0].id;cfg.login=me.data[0].login||me.data[0].display_name;cfg.displayName=me.data[0].display_name||cfg.login;twitchCfg=cfg;savedAuth.twitch={...(savedAuth.twitch||{}),login:cfg.login,displayName:cfg.displayName,userId:cfg.userId};await persistAuth();setStatus('twitch',false,`${cfg.displayName} · autorizando eventos…`,cfg.displayName);await syncCreatorAccount('twitch',cfg.login).catch(()=>{});openTwitchWS();startTwitchViewerPolling();startTwitchValidation();refreshTwitchGiftCatalog(true).catch(e=>console.warn('Catálogo Twitch:',e?.message||e))}
async function twitchUserByLogin(login,cfg=twitchCfg){
 if(!cfg?.token)throw Error('Conecta tu cuenta de Twitch en GREÑA para moderar.');
 const clean=String(login||'').trim().replace(/^@/,'');if(!clean)throw Error('Falta el usuario de Twitch.');
 const d=await twitchHelix(`/users?login=${encodeURIComponent(clean)}`,cfg);const u=d.data?.[0];
 if(!u)throw Error(`Twitch no encontró al usuario ${clean}.`);return u;
}
async function moderateTwitch(body={}){
 const token=savedAuth.twitch?.access_token;if(!token)throw Error('Conecta Twitch en GREÑA antes de usar moderación real.');
 const cfg=twitchCfg||{token};
 if(!cfg.userId){const me=await twitchHelix('/users',cfg);if(!me.data?.[0])throw Error('No pude identificar tu cuenta de Twitch.');cfg.userId=me.data[0].id;cfg.login=me.data[0].login||me.data[0].display_name;}
 const broadcasterLogin=String(body.broadcaster||counterTwitchLogin||cfg.login||'').trim().replace(/^@/,'');
 const broadcaster=broadcasterLogin?await twitchUserByLogin(broadcasterLogin,cfg):{id:cfg.userId};
 const action=String(body.action||'');
 if(action==='delete_message'){
  const messageId=String(body.messageId||'').trim();if(!messageId)throw Error('Twitch no entregó el ID de este mensaje; no puedo borrarlo en la plataforma.');
  await twitchHelix(`/moderation/chat?broadcaster_id=${encodeURIComponent(broadcaster.id)}&moderator_id=${encodeURIComponent(cfg.userId)}&message_id=${encodeURIComponent(messageId)}`,cfg,{method:'DELETE'});
  return {ok:true,message:'Mensaje eliminado de Twitch.'};
 }
 const target=body.userId?{id:String(body.userId)}:await twitchUserByLogin(body.username,cfg);
 if(action==='ban'||action==='timeout'){
  const data={user_id:target.id};if(action==='timeout')data.duration=Math.max(1,Math.min(1209600,Number(body.durationSeconds||300)||300));
  const reason=String(body.reason||'').trim();if(reason)data.reason=reason.slice(0,500);
  await twitchHelix(`/moderation/bans?broadcaster_id=${encodeURIComponent(broadcaster.id)}&moderator_id=${encodeURIComponent(cfg.userId)}`,cfg,{method:'POST',body:JSON.stringify({data})});
  return {ok:true,message:action==='ban'?'Usuario baneado en Twitch.':`Timeout aplicado en Twitch (${Math.round(data.duration/60)} min).`};
 }
 if(action==='unban'){
  await twitchHelix(`/moderation/bans?broadcaster_id=${encodeURIComponent(broadcaster.id)}&moderator_id=${encodeURIComponent(cfg.userId)}&user_id=${encodeURIComponent(target.id)}`,cfg,{method:'DELETE'});
  return {ok:true,message:'Ban/timeout retirado en Twitch.'};
 }
 throw Error('Acción de Twitch no compatible.');
}
async function kickUserFetch(path,opts={}){
 const token=savedAuth.kick?.access_token;if(!token)throw Error('Conecta tu cuenta de Kick en GREÑA para moderar.');
 const r=await fetch(`https://api.kick.com${path}`,{...opts,headers:{Authorization:`Bearer ${token}`,'Accept':'application/json','Content-Type':'application/json',...(opts.headers||{})}});
 const text=await r.text();let d={};try{d=text?JSON.parse(text):{}}catch{d={message:text}}
 if(!r.ok)throw Error(d?.message||d?.error||`Kick HTTP ${r.status}`);return d;
}
async function kickBroadcasterId(slug=''){
 const clean=normalizeKickSlug(slug||currentKickSlug());
 const path=clean?`/public/v1/channels?slug=${encodeURIComponent(clean)}`:'/public/v1/channels';
 const d=await kickUserFetch(path);const ch=Array.isArray(d?.data)?d.data[0]:d?.data?.[0]||d?.data;
 const id=Number(ch?.broadcaster_user_id||ch?.user_id||ch?.id||0);if(!id)throw Error('No pude identificar el canal de Kick para moderar.');return id;
}
async function moderateKick(body={}){
 const action=String(body.action||'');
 if(action==='delete_message'){
  const messageId=String(body.messageId||'').trim();if(!messageId)throw Error('Kick no entregó el ID de este mensaje; no puedo borrarlo en la plataforma.');
  await kickUserFetch(`/public/v1/chat/${encodeURIComponent(messageId)}`,{method:'DELETE'});return {ok:true,message:'Mensaje eliminado de Kick.'};
 }
 const userId=Number(body.userId||0);if(!userId)throw Error('Kick no entregó el ID de este usuario en el mensaje. La API oficial de Kick necesita ese ID para ban/timeout.');
 const broadcasterId=Number(body.broadcasterId||0)||await kickBroadcasterId(body.broadcaster||'');
 if(action==='ban'||action==='timeout'){
  const payload={broadcaster_user_id:broadcasterId,user_id:userId};
  if(action==='timeout')payload.duration=Math.max(1,Math.min(10080,Math.ceil((Number(body.durationSeconds||300)||300)/60)));
  const reason=String(body.reason||'').trim();if(reason)payload.reason=reason.slice(0,100);
  await kickUserFetch('/public/v1/moderation/bans',{method:'POST',body:JSON.stringify(payload)});
  return {ok:true,message:action==='ban'?'Usuario baneado en Kick.':`Timeout aplicado en Kick (${payload.duration} min).`};
 }
 if(action==='unban'){
  await kickUserFetch('/public/v1/moderation/bans',{method:'DELETE',body:JSON.stringify({broadcaster_user_id:broadcasterId,user_id:userId})});
  return {ok:true,message:'Ban/timeout retirado en Kick.'};
 }
 throw Error('Acción de Kick no compatible.');
}
async function moderationAction(body={}){
 const platform=String(body.platform||'').toLowerCase();
 if(platform==='twitch')return moderateTwitch(body);
 if(platform==='kick')return moderateKick(body);
 if(platform==='tiktok')throw Error('TikTok no expone estas acciones de moderación LIVE en la integración actual de GREÑA. Usa Silenciar en GREÑA para este LIVE.');
 throw Error('Plataforma de moderación no válida.');
}

async function syncCreatorAccount(platform,username){
 const clean=String(username||'').trim().replace(/^@/,'');if(!clean||!['tiktok','twitch','kick'].includes(platform))return;
 let value='';if(platform==='tiktok'){value=`https://www.tiktok.com/@${clean}/live`;autoPrefs.counterTikTok=value;autoPrefs.counterTikTokEnabled=true}
 if(platform==='twitch'){value=`https://www.twitch.tv/${clean}`;autoPrefs.counterTwitch=value;autoPrefs.counterTwitchEnabled=true}
 if(platform==='kick'){value=`https://kick.com/${clean}`;autoPrefs.counterKick=value;autoPrefs.counterKickEnabled=true}
 const socialKey=platform+'User';socialSettings={...socialSettings,[socialKey]:platform==='tiktok'?`@${clean}`:clean};
 await Promise.allSettled([persistAutoPrefs(),safeWriteJson(stateFile('social.json',LEGACY_SOCIAL_FILE),socialSettings)]);
 broadcast({type:'social-settings',settings:socialSettings});
 try{await fetch('http://127.0.0.1:8788/api/connection-prefs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({autoConnect:true,[platform+'Url']:value,[platform+'Enabled']:true})})}catch{}
}
async function syncAllCreatorAccounts(){
 const accounts={tiktok:savedAuth.tiktok?.username||'',twitch:savedAuth.twitch?.login||savedAuth.twitch?.displayName||'',kick:savedAuth.kick?.username||savedAuth.kick?.slug||''};
 for(const [platform,username] of Object.entries(accounts))if(username)await syncCreatorAccount(platform,username).catch(()=>{});
}
async function disconnectChatPlatform(platform){
 try{await fetch('http://127.0.0.1:8788/api/internal/disconnect-platform',{method:'POST',headers:{'content-type':'application/json','x-grena-internal':BRIDGE_TOKEN},body:JSON.stringify({platform})})}catch{}
 bridgeRuntime[platform]=false;pushEventHealth();
}
async function kickCurrentUser(token){
 const r=await fetch('https://api.kick.com/public/v1/users',{headers:{Authorization:`Bearer ${token}`,'Accept':'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error||`Kick user HTTP ${r.status}`);
 const u=Array.isArray(d?.data)?d.data[0]:d?.data?.[0]||d?.data||{};return {id:u.user_id||u.id||'',username:String(u.channel_slug||u.username||u.name||u.slug||'').trim(),displayName:String(u.username||u.name||u.channel_slug||u.slug||'').trim(),avatar:u.profile_picture||u.profile_picture_url||''};
}

const KICK_EVENT_SUBSCRIPTIONS=['channel.followed','channel.subscription.new','channel.subscription.renewal','channel.subscription.gifts','kicks.gifted','livestream.status.updated'];
async function kickUserToken(){
 let token=String(savedAuth.kick?.access_token||'');if(!token)throw Error('Kick no está vinculado.');return token;
}
async function refreshKickUserToken(){
 const cur=savedAuth.kick||{};
 if(!cur.refresh_token)throw Error('La sesión de Kick necesita autorización de nuevo.');
 if(isBrokerProvider('kick'))return await refreshBrokerToken('kick');
 const c=oauthConfig.kick||{};
 if(!c.clientId||!c.clientSecret)throw Error('Falta la configuración OAuth de Kick para renovar la sesión.');
 const tok=await postForm('https://id.kick.com/oauth/token',{grant_type:'refresh_token',client_id:c.clientId,client_secret:c.clientSecret,refresh_token:cur.refresh_token});
 if(!tok.access_token)throw Error('Kick no devolvió un access token nuevo.');
 savedAuth.kick={...cur,...tok,refresh_token:tok.refresh_token||cur.refresh_token,obtained_at:Date.now()};
 await persistAuth();return savedAuth.kick;
}
function kickSubscriptionRows(d={}){const x=d?.data?.subscriptions??d?.data??d?.subscriptions??[];return Array.isArray(x)?x:[]}
async function kickSubscriptionsRequest(path='',options={}){
 let token=await kickUserToken();const call=t=>fetch(`https://api.kick.com/public/v1/events/subscriptions${path}`,{...options,headers:{Accept:'application/json',Authorization:`Bearer ${t}`,...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});
 let r=await call(token);if(r.status===401&&savedAuth.kick?.refresh_token){try{const fresh=await refreshKickUserToken();token=fresh.access_token;r=await call(token)}catch(e){console.warn('[KICK EVENTS REFRESH]',e?.message||e)}}
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error_description||d.error||`Kick Events HTTP ${r.status}`);return d;
}
async function ensureKickEventSubscriptions(){
 if(!savedAuth.kick?.access_token)return false;
 try{
  const me=await kickCurrentUser(await kickUserToken()),broadcasterId=Number(me.id)||undefined;
  const current=kickSubscriptionRows(await kickSubscriptionsRequest());
  const existing=new Set(current.map(x=>String(x?.event||x?.name||x?.type||'')));
  const missing=KICK_EVENT_SUBSCRIPTIONS.filter(name=>!existing.has(name));
  if(missing.length){
   const body={method:'webhook',events:missing.map(name=>({name,version:1})),...(broadcasterId?{broadcaster_user_id:broadcasterId}:{})};
   await kickSubscriptionsRequest('',{method:'POST',body:JSON.stringify(body)});
  }
  const after=kickSubscriptionRows(await kickSubscriptionsRequest());const active=[...new Set(after.map(x=>String(x?.event||x?.name||x?.type||'')).filter(x=>KICK_EVENT_SUBSCRIPTIONS.includes(x)))];
  kickEventHealth.subscriptionsReady=active.length>=4;kickEventHealth.active=active;kickEventHealth.failed=KICK_EVENT_SUBSCRIPTIONS.filter(x=>!active.includes(x));kickEventHealth.lastError='';kickEventHealth.updatedAt=Date.now();pushEventHealth();return kickEventHealth.subscriptionsReady;
 }catch(e){kickEventHealth.subscriptionsReady=false;kickEventHealth.lastError=e?.message||String(e);kickEventHealth.updatedAt=Date.now();pushEventHealth();console.warn('[KICK EVENTS]',kickEventHealth.lastError);return false}
}
let kickPublicKeyCache={key:'',at:0};const kickWebhookSeen=new Map();
async function kickPublicKey(){if(kickPublicKeyCache.key&&Date.now()-kickPublicKeyCache.at<24*60*60e3)return kickPublicKeyCache.key;const r=await fetch('https://api.kick.com/public/v1/public-key',{headers:{Accept:'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(`Kick public key HTTP ${r.status}`);const key=String(d?.data?.public_key||d?.public_key||d?.data?.key||d?.key||'');if(!key.includes('BEGIN PUBLIC KEY'))throw Error('Kick no devolvió una clave pública válida.');kickPublicKeyCache={key,at:Date.now()};return key}
async function verifyKickWebhook(req,raw){
 const id=String(req.headers['kick-event-message-id']||''),ts=String(req.headers['kick-event-message-timestamp']||''),sig=String(req.headers['kick-event-signature']||'');if(!id||!ts||!sig)return false;
 const when=Date.parse(ts);if(!Number.isFinite(when)||Math.abs(Date.now()-when)>15*60e3)return false;
 const prev=kickWebhookSeen.get(id);if(prev&&Date.now()-prev<24*60*60e3)return 'duplicate';
 const key=await kickPublicKey(),v=createVerify('RSA-SHA256');v.update(`${id}.${ts}.${raw}`);v.end();if(!v.verify(key,sig,'base64'))return false;
 kickWebhookSeen.set(id,Date.now());for(const [k,t] of kickWebhookSeen)if(Date.now()-t>24*60*60e3)kickWebhookSeen.delete(k);return true;
}


function oauthBaseForRequest(req){
 const proto=String(req?.headers?.['x-forwarded-proto']||'').split(',')[0].trim()||(CLOUD_MODE?'https':'http');
 const host=requestHost(req);
 if(CLOUD_MODE&&host&&!['localhost','127.0.0.1','::1'].includes(host.split(':')[0]))return `${proto}://${host}`;
 return OAUTH_BASE;
}
function oauthRedirectFor(platform,req){const base=oauthBaseForRequest(req);return platform==='twitch'?`${base}/oauth/twitch/callback`:`${base}/oauth/${platform}/callback`}
async function beginBrokerOAuth(platform,req,res){
 if(!AUTH_SERVICE_URL)return callbackPage(res,false,'GREÑA Auth todavía no está configurado por el administrador.');
 if(!authService.reachable||Date.now()-Number(authService.checkedAt||0)>5*60e3)await loadAuthServiceConfig();
 if(!isBrokerProvider(platform))return callbackPage(res,false,`GREÑA Auth todavía no tiene ${platform} habilitado.`);
 const state=b64url(randomBytes(24)),redirect=oauthRedirectFor(platform,req);let verifier='',challenge='';
 if(platform==='tiktok'){verifier=b64url(randomBytes(48));challenge=createHash('sha256').update(verifier).digest('hex')}
 if(platform==='kick'){verifier=b64url(randomBytes(48));challenge=b64url(createHash('sha256').update(verifier).digest())}
 oauthState.set(state,{platform,verifier,created:Date.now(),userId:activeUserId,mode:'grena-auth',redirect});
 const u=new URL(`${AUTH_SERVICE_URL}/v1/authorize/${platform}`);u.searchParams.set('redirect_uri',redirect);u.searchParams.set('state',state);if(challenge)u.searchParams.set('code_challenge',challenge);
 res.writeHead(302,{location:u});res.end();
}
function twitchDevicePage(res,session){
 const id=encodeURIComponent(session.id),verify=String(session.verificationUri||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
 const code=String(session.userCode||'').replace(/[<>&"]/g,'');
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GREÑA · Conectar Twitch</title><style>*{box-sizing:border-box}body{margin:0;background:#080a0f;color:#fff;font-family:Segoe UI,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:28px}.card{width:min(560px,100%);background:#11141d;border:1px solid #282d3b;border-radius:24px;padding:30px;text-align:center;box-shadow:0 25px 70px #0008}.logo{font-size:46px}.muted{color:#aab1c3;line-height:1.55}.code{font-size:34px;font-weight:900;letter-spacing:7px;margin:22px 0;padding:16px;border-radius:16px;background:#0b0e15;border:1px solid #32394b}.btn{display:inline-block;background:#9147ff;color:#fff;text-decoration:none;font-weight:800;border-radius:13px;padding:14px 22px;margin-top:4px}.state{margin-top:22px;padding:13px;border-radius:12px;background:#0b0e15;color:#c8cede}.ok{color:#71f0a6}.bad{color:#ff8585}</style><div class="card"><div class="logo">◈</div><h1>Conectar Twitch</h1><p class="muted">Twitch usa autorización por dispositivo. No necesitas Client Secret y GREÑA nunca te pedirá uno.</p><div class="code">${code}</div><a class="btn" href="${verify}" target="_blank" rel="noopener">Abrir Twitch y autorizar</a><p class="muted">Si Twitch te pide un código, usa el que aparece arriba. Esta ventana terminará sola cuando autorices la cuenta.</p><div id="state" class="state">Esperando autorización…</div></div><script>const id='${id}';async function tick(){try{const r=await fetch('/api/twitch/device/status?id='+id,{cache:'no-store'}),d=await r.json();const el=document.getElementById('state');if(!r.ok||!d.ok)throw Error(d.error||'No se pudo comprobar Twitch');if(d.status==='connected'){el.className='state ok';el.textContent=d.message||'✓ Twitch conectado';setTimeout(()=>window.close(),1400);return}if(d.status==='error'||d.status==='expired'){el.className='state bad';el.textContent=d.message||'La autorización no pudo completarse.';return}el.textContent=d.message||'Esperando autorización…'}catch(e){document.getElementById('state').textContent=e.message}setTimeout(tick,1200)}tick();</script>`);
}
async function pollTwitchDeviceSession(id){
 const session=twitchDeviceSessions.get(id);if(!session)return;
 while(twitchDeviceSessions.get(id)===session&&session.status==='pending'&&Date.now()<session.expiresAt){
  await new Promise(r=>setTimeout(r,Math.max(2,Number(session.interval||5))*1000));
  if(session.status!=='pending'||Date.now()>=session.expiresAt)break;
  try{
   const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:new URLSearchParams({client_id:oauthConfig.twitch.clientId,scopes:TWITCH_SCOPES,device_code:session.deviceCode,grant_type:'urn:ietf:params:oauth:grant-type:device_code'})});
   const d=await r.json().catch(()=>({}));
   if(!r.ok){const msg=String(d.message||d.error_description||d.error||'');if(/authorization_pending/i.test(msg))continue;if(/slow_down/i.test(msg)){session.interval=Math.min(30,Number(session.interval||5)+5);continue}throw Error(msg||`Twitch OAuth HTTP ${r.status}`)}
   if(!d.access_token)throw Error('Twitch no devolvió un access token.');
   if(session.userId&&session.userId!==activeUserId)await activateProfile(session.userId);
   savedAuth.twitch={...d,obtained_at:Date.now(),mode:'device-code-public'};await persistAuth();await startTwitch(d.access_token);
   session.status='connected';session.account=twitchCfg?.displayName||twitchCfg?.login||'';session.message=`✓ Twitch conectado como ${session.account||'tu cuenta'}.`;
   setTimeout(()=>{if(twitchDeviceSessions.get(id)===session)twitchDeviceSessions.delete(id)},5*60*1000);return;
  }catch(e){session.status='error';session.message=e?.message||String(e);return}
 }
 if(session.status==='pending'){session.status='expired';session.message='El código de Twitch venció. Pulsa Conectar Twitch otra vez.'}
}
async function beginTwitchDeviceOAuth(res){
 const clientId=String(oauthConfig.twitch?.clientId||'').trim();if(!clientId)return callbackPage(res,false,'GREÑA no tiene configurado el Client ID público de Twitch.');
 const r=await fetch('https://id.twitch.tv/oauth2/device',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},body:new URLSearchParams({client_id:clientId,scopes:TWITCH_SCOPES})});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.device_code)throw Error(d.message||d.error_description||d.error||`Twitch Device OAuth HTTP ${r.status}`);
 const id=b64url(randomBytes(24)),session={id,userId:activeUserId,deviceCode:d.device_code,userCode:d.user_code||'',verificationUri:d.verification_uri||`https://www.twitch.tv/activate?public=true&device-code=${encodeURIComponent(d.user_code||'')}`,interval:Math.max(2,Number(d.interval||5)),expiresAt:Date.now()+Math.max(60,Number(d.expires_in||1800))*1000,status:'pending',message:'Esperando que autorices GREÑA en Twitch…'};
 twitchDeviceSessions.set(id,session);void pollTwitchDeviceSession(id);return twitchDevicePage(res,session);
}
function beginOAuth(platform,req,res){
 if(platform==='twitch')return beginTwitchDeviceOAuth(res);
 if(['tiktok','kick'].includes(platform)&&AUTH_SERVICE_URL)return beginBrokerOAuth(platform,req,res);
 if(!configured(platform))return callbackPage(res,false,'Esta plataforma todavía no tiene sus credenciales configuradas.');
 const state=b64url(randomBytes(24));const redirect=oauthRedirectFor(platform,req);
 if(platform==='tiktok'){const verifier=b64url(randomBytes(48)),challenge=createHash('sha256').update(verifier).digest('hex');oauthState.set(state,{platform,verifier,created:Date.now(),userId:activeUserId,redirect});const u=new URL('https://www.tiktok.com/v2/auth/authorize/');u.search=new URLSearchParams({client_key:oauthConfig.tiktok.clientKey,response_type:'code',scope:'user.info.basic,user.info.profile',redirect_uri:redirect,state,code_challenge:challenge,code_challenge_method:'S256'});res.writeHead(302,{location:u});return res.end()}
 if(platform==='kick'){const verifier=b64url(randomBytes(48)),challenge=b64url(createHash('sha256').update(verifier).digest());oauthState.set(state,{platform,verifier,created:Date.now(),userId:activeUserId,redirect});const u=new URL('https://id.kick.com/oauth/authorize');u.search=new URLSearchParams({response_type:'code',client_id:oauthConfig.kick.clientId,redirect_uri:redirect,scope:KICK_SCOPES,state,code_challenge:challenge,code_challenge_method:'S256'});res.writeHead(302,{location:u});return res.end()}
 throw Error('Plataforma no compatible.');
}
function twitchImplicitCallback(res){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(`<!doctype html><meta charset="utf-8"><title>GREÑA · Twitch</title><body style="background:#090b10;color:white;font-family:Arial;text-align:center;padding:70px"><h2 id="t">Conectando Twitch…</h2><p id="m">Terminando la autorización.</p><script>(async()=>{try{const p=new URLSearchParams(location.hash.slice(1));const token=p.get('access_token'),state=p.get('state'),error=p.get('error');if(error)throw Error(p.get('error_description')||error);if(!token)throw Error('Twitch no devolvió el token de autorización.');const r=await fetch('/api/twitch/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,state})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'No se pudo conectar Twitch');document.getElementById('t').textContent='✓ Twitch conectado';document.getElementById('m').textContent=d.message||'Ya puedes cerrar esta ventana.';setTimeout(()=>window.close(),1400)}catch(e){document.getElementById('t').textContent='No se pudo conectar';document.getElementById('m').textContent=e.message}})()</script></body>`)}
async function finishBrokerOAuth(platform,code,s,res){
 const d=await authServiceFetch(`/v1/exchange/${platform}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,redirect_uri:s.redirect||oauthRedirectFor(platform),...(s.verifier?{code_verifier:s.verifier}:{})})});
 const tok=d.tokens||d;if(!tok.access_token)throw Error(`GREÑA Auth no devolvió un access token de ${platform}.`);
 if(platform==='tiktok'){
  // Sandbox puede autorizar Login Kit con user.info.basic sin entregar `username`.
  // Primero intentamos el perfil completo; si TikTok rechaza `username`, repetimos solo con campos básicos.
  const headers={Authorization:`Bearer ${tok.access_token}`};
  let r=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username',{headers});
  let info=await r.json().catch(()=>({}));
  if(!r.ok||(info.error?.code&&info.error.code!=='ok')){
   r=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',{headers});
   info=await r.json().catch(()=>({}));
  }
  if(!r.ok||(info.error?.code&&info.error.code!=='ok'))throw Error(`TikTok perfil: ${info.error?.message||info.error?.code||`HTTP ${r.status}`}`);
  const u=info.data?.user||{},username=String(u.username||'').trim(),openId=String(u.open_id||'').trim();
  if(!openId&&!u.display_name)throw Error('TikTok autorizó GREÑA, pero no devolvió datos de identidad del perfil.');
  const displayName=String(u.display_name||username||'Cuenta TikTok').trim();
  savedAuth.tiktok={...tok,username,openId,displayName,avatar:u.avatar_url||'',obtained_at:Date.now(),mode:'grena-auth'};
  await persistAuth();
  // El motor LIVE sí necesita @usuario. El login, en cambio, no debe fallar si Sandbox aún no lo entrega.
  if(username){await syncCreatorAccount('tiktok',username);await connectTikTokLive(username).catch(()=>{});return callbackPage(res,true,`TikTok conectado como @${username}.`)}
  setStatus('tiktok',false,`${displayName} · cuenta vinculada · falta @usuario para LIVE`,displayName);
  return callbackPage(res,true,`TikTok conectado como ${displayName}. La cuenta quedó vinculada; el @usuario se activará para LIVE cuando TikTok entregue user.info.profile.`)
 }
 if(platform==='twitch'){
  savedAuth.twitch={...tok,obtained_at:Date.now(),mode:'grena-auth'};await persistAuth();await startTwitch(tok.access_token);return callbackPage(res,true,`Twitch conectado como ${twitchCfg?.displayName||twitchCfg?.login||'tu cuenta'}.`)
 }
 if(platform==='kick'){
  const me=await kickCurrentUser(tok.access_token);const username=me.username;if(!username)throw Error('Kick autorizó GREÑA, pero no pude identificar el canal de la cuenta.');
  savedAuth.kick={...tok,username,displayName:me.displayName||username,slug:username,userId:me.id,avatar:me.avatar,obtained_at:Date.now(),mode:'grena-auth'};autoPrefs.enabled=true;autoPrefs.counterKick=`https://kick.com/${username}`;autoPrefs.counterKickEnabled=true;await Promise.all([persistAuth(),persistAutoPrefs()]);await syncCreatorAccount('kick',username);setStatus('kick',true,`${username} · cuenta vinculada`,username);startKickPolling();ensureKickEventSubscriptions().catch(()=>{});notifyChatProfile(activeUserId).catch(()=>{});return callbackPage(res,true,`Kick conectado como ${username}.`)
 }
 throw Error('Plataforma no compatible con GREÑA Auth.');
}
async function finishOAuth(platform,url,res){const code=url.searchParams.get('code'),state=url.searchParams.get('state'),err=url.searchParams.get('error');if(err)throw Error(url.searchParams.get('error_description')||err);const s=oauthState.get(state);oauthState.delete(state);if(!s||s.platform!==platform||Date.now()-s.created>10*60e3)throw Error('La sesión de autorización expiró. Inténtalo de nuevo.');if(s.userId&&s.userId!==activeUserId)await activateProfile(s.userId);if(s.mode==='grena-auth')return await finishBrokerOAuth(platform,code,s,res);const redirect=s.redirect||oauthRedirectFor(platform);if(platform==='tiktok'){const tok=await postForm('https://open.tiktokapis.com/v2/oauth/token/',{client_key:oauthConfig.tiktok.clientKey,client_secret:oauthConfig.tiktok.clientSecret,code,grant_type:'authorization_code',redirect_uri:redirect,code_verifier:s.verifier});const headers={Authorization:`Bearer ${tok.access_token}`};let r=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username',{headers}),d=await r.json().catch(()=>({}));if(!r.ok||(d.error?.code&&d.error.code!=='ok')){r=await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',{headers});d=await r.json().catch(()=>({}))}if(!r.ok||(d.error?.code&&d.error.code!=='ok'))throw Error(`TikTok perfil: ${d.error?.message||d.error?.code||`HTTP ${r.status}`}`);const u=d.data?.user||{},username=String(u.username||'').trim(),openId=String(u.open_id||'').trim(),displayName=String(u.display_name||username||'Cuenta TikTok').trim();if(!openId&&!u.display_name)throw Error('TikTok autorizó GREÑA, pero no devolvió datos de identidad del perfil.');savedAuth.tiktok={...tok,username,openId,displayName,avatar:u.avatar_url||'',obtained_at:Date.now()};await persistAuth();if(username){await syncCreatorAccount('tiktok',username);await connectTikTokLive(username).catch(()=>{});return callbackPage(res,true,`TikTok conectado como @${username}.`)}setStatus('tiktok',false,`${displayName} · cuenta vinculada · falta @usuario para LIVE`,displayName);return callbackPage(res,true,`TikTok conectado como ${displayName}. La cuenta quedó vinculada; el @usuario se activará para LIVE cuando TikTok entregue user.info.profile.`)}
 if(platform==='kick'){const tok=await postForm('https://id.kick.com/oauth/token',{grant_type:'authorization_code',code,client_id:oauthConfig.kick.clientId,client_secret:oauthConfig.kick.clientSecret,redirect_uri:redirect,code_verifier:s.verifier});const me=await kickCurrentUser(tok.access_token).catch(()=>({username:currentKickSlug()}));savedAuth.kick={...tok,username:me.username||currentKickSlug(),slug:me.username||currentKickSlug()};if(savedAuth.kick.username){autoPrefs.enabled=true;autoPrefs.counterKick=`https://kick.com/${savedAuth.kick.username}`;autoPrefs.counterKickEnabled=true}await Promise.all([persistAuth(),persistAutoPrefs()]);if(savedAuth.kick.username)await syncCreatorAccount('kick',savedAuth.kick.username);setStatus('kick',true,`${savedAuth.kick.username||'Kick'} · cuenta vinculada`,savedAuth.kick.username||'Kick');startKickPolling();ensureKickEventSubscriptions().catch(()=>{});notifyChatProfile(activeUserId).catch(()=>{});return callbackPage(res,true,'Kick quedó vinculado a GREÑA.')}
 if(platform==='twitch')return twitchImplicitCallback(res)
 throw Error('Plataforma no compatible.');}


async function stopProfileRuntime(){
  try{if(tiktok)tiktok.disconnect()}catch{} tiktok=null;
  try{if(tiktokLoginContext)await tiktokLoginContext.close()}catch{} tiktokLoginContext=null;
  {const oldCounter=counterTikTok;counterTikTok=null;clearTikTokCounterTimers();counterTikTokLastSignalAt=0;counterTikTokPollFailures=0;try{if(oldCounter)oldCounter.disconnect()}catch{}} counterTikTokUser='';
  if(counterTwitchTimer)clearInterval(counterTwitchTimer);counterTwitchTimer=null;counterTwitchLogin='';
  if(twitchViewerTimer)clearInterval(twitchViewerTimer);twitchViewerTimer=null;
  if(twitchValidationTimer)clearInterval(twitchValidationTimer);twitchValidationTimer=null;
  twitchCfg=null;try{twitchWS?.close()}catch{}twitchWS=null;
  if(kickViewerTimer)clearInterval(kickViewerTimer);kickViewerTimer=null;kickAppToken='';kickTokenExpiresAt=0;
  for(const p of ['tiktok','twitch','kick']){viewers[p]=0;viewerMeta[p].lastGood=0;viewerMeta[p].lastGoodAt=0;viewerMeta[p].source='waiting'}
  for(const p of ['tiktok','twitch','kick'])bridgeRuntime[p]=false;
  for(const p of ['tiktok','twitch','kick'])status[p]={connected:false,label:'No conectado'};
  activityHistory.splice(0);recentAlerts.clear();pushViewers();pushStatus();
}
async function notifyChatProfile(userId=activeUserId){
  try{await fetch('http://127.0.0.1:8788/api/profile-reload',{method:'POST',headers:{'content-type':'application/json','x-grena-internal':BRIDGE_TOKEN},body:JSON.stringify({userId:String(userId||'')})})}catch{}
}
async function activateProfile(userId,{restart=true}={}){
  const user=usersStore.users.find(u=>u.id===String(userId||''));if(!user)throw Error('Perfil de GREÑA no encontrado.');
  if(restart)await stopProfileRuntime();
  await loadProfileState(user.id);
  await notifyChatProfile(user.id);
  await syncAllCreatorAccounts();
  broadcast({type:'profile-changed',profile:publicUser(user)});
  broadcast({type:'counter-settings',settings:publicCounterSettings()});
  broadcast({type:'social-settings',settings:socialSettings});
  if(restart){
    setTimeout(async()=>{
      try{await restoreTwitchSession()}catch(e){console.warn('Twitch perfil:',e?.message||e)}
      try{await ensureTikTokLiveAuto()}catch{}
      try{await ensureCountersAuto()}catch{}
      try{if((isBrokerProvider('kick')||oauthConfig.kick?.clientId&&oauthConfig.kick?.clientSecret)&&currentKickSlug())startKickPolling();if(savedAuth.kick?.access_token)ensureKickEventSubscriptions().catch(()=>{})}catch{}
    },80);
  }
  return user;
}
async function deactivateProfile(){await stopProfileRuntime();await loadProfileState('');await notifyChatProfile('');broadcast({type:'profile-changed',profile:null});broadcast({type:'counter-settings',settings:publicCounterSettings()});broadcast({type:'social-settings',settings:socialSettings})}
async function persistUsers(){await safeWriteJson(USERS_FILE,usersStore)}
function accountPayload(user){return {ok:true,authenticated:!!user,user:accountUser(user),activeUserId,active:!!user&&user.id===activeUserId,needsRecoveryEmail:!!user&&!user.email,mailConfigured:mailConfigured()}}


// ===== GREÑA CAM ROOM · SALAS DE CÁMARA PARA OBS =====
// Toda sala de Cam Room se crea para invitados externos. El panel principal sigue
// siendo local en 127.0.0.1:8787; solo el gateway limitado de Cam Room (8790)
// se publica mediante HTTPS.
const CAM_GATEWAY_HOST='127.0.0.1', CAM_GATEWAY_PORT=Number(process.env.GRENA_CAM_GATEWAY_PORT||8790), CAM_HOST_GRACE_MS=Math.max(5000,Number(process.env.GRENA_CAM_HOST_GRACE_MS||45000)||45000);
let camGatewayReady=false,camGatewayLastError='';
let camTunnelProcess=null,camTunnelUrl='',camTunnelStartPromise=null,camTunnelRestartTimer=null;
function camId(prefix='c'){return `${prefix}_${randomBytes(9).toString('base64url')}`}
function camToken(bytes=24){return randomBytes(bytes).toString('base64url')}
function camCleanBase(v=''){
 const raw=String(v||'').trim().replace(/\/+$/,'');if(!raw)return '';
 try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))return '';return `${u.protocol}//${u.host}${u.pathname==='/'?'':u.pathname.replace(/\/+$/,'')}`}catch{return ''}
}
function camRequestBase(req){const fp=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim(),proto=fp||'http',host=String(req.headers['x-forwarded-host']||req.headers.host||`127.0.0.1:${PORT}`).split(',')[0].trim();return `${proto}://${host}`}
function camRoomByInvite(token){const t=String(token||'');for(const r of camRooms.values())if(r.active&&r.inviteToken===t)return r;return null}
function camParticipantObsToken(room,participantId){if(!room)return '';room.obsTokens=room.obsTokens&&typeof room.obsTokens==='object'?room.obsTokens:{};const pid=String(participantId||'');if(!pid)return '';if(!room.obsTokens[pid])room.obsTokens[pid]=camToken(24);return room.obsTokens[pid]}
function camRoomByObs(id,token,participantId){const r=camRooms.get(String(id||''));if(!r?.active)return null;const want=camParticipantObsToken(r,participantId);return want&&want===String(token||'')?r:null}
function camPeersFor(roomId){let m=camRoomPeers.get(roomId);if(!m){m=new Map();camRoomPeers.set(roomId,m)}return m}
function camParticipantList(roomId){return [...camPeersFor(roomId).values()].filter(x=>x.role==='host'||x.role==='guest').map(x=>({participantId:x.participantId,peerId:x.peerId,name:x.name,role:x.role,joinedAt:x.joinedAt,audioEnabled:!!x.audioEnabled,videoEnabled:!!x.videoEnabled,pinProtected:true})).sort((a,b)=>a.joinedAt-b.joinedAt)}
function camValidPin(pin){return /^\d{4,8}$/.test(String(pin||''))}
function camPinHash(roomId,participantId,pin){return createHash('sha256').update(`${roomId}:${participantId}:${String(pin||'')}`).digest('hex')}
function camIceServers(){
 const servers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
 const urls=String(process.env.GRENA_TURN_URL||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(urls.length)servers.push({urls,username:String(process.env.GRENA_TURN_USERNAME||''),credential:String(process.env.GRENA_TURN_CREDENTIAL||'')});
 return servers;
}
function camIsLocalBase(v=''){try{return ['127.0.0.1','localhost','::1'].includes(new URL(String(v)).hostname)}catch{return true}}
async function camFileExists(file){try{await access(file);return true}catch{return false}}
function camCloudflaredAsset(){
 if(process.platform==='win32')return process.arch==='ia32'?'cloudflared-windows-386.exe':'cloudflared-windows-amd64.exe';
 if(process.platform==='linux')return process.arch==='arm64'?'cloudflared-linux-arm64':process.arch==='arm'?'cloudflared-linux-arm':'cloudflared-linux-amd64';
 return '';
}
// FIX4: versión fija + SHA-256 oficial (https://github.com/cloudflare/cloudflared/releases/tag/2026.9.1).
// Antes se descargaba "latest" sin verificar nada. Para actualizar: cambia CLOUDFLARED_VERSION y estos hashes.
const CLOUDFLARED_VERSION='2026.9.1';
const CLOUDFLARED_SHA256={
 'cloudflared-windows-amd64.exe':'2837888cc0f5d58f15b6dc478376de90b4d3ba5241c7947455d1e0a0df429712',
 'cloudflared-windows-386.exe':'11b6e4b2d306950bd87e7caa4deee8e80a32d71ffee555a96237a76651eeae4c',
 'cloudflared-linux-amd64':'03f1f25d1cc93b9ad6c60569d44060bc4f17ed97075760ed8cfca4b12dcd68cc',
 'cloudflared-linux-386':'5d66134cf7646cb98f33aeee7bcc8b97d8feacd76db279f5903f9585226e0922',
 'cloudflared-linux-arm':'093ffa3638ab2b636de63c43a8c68f96a69cf71f9699dd8277a91b160b0f4fc0',
 'cloudflared-linux-arm64':'3d97437c71848bd8df68041e12436b484a661d95073ea1937f01a845ce88faa3'
};
const camCloudflaredVerified=new Set();
const camSha256=buf=>createHash('sha256').update(buf).digest('hex');
async function camEnsureCloudflared(){
 const custom=String(process.env.GRENA_CLOUDFLARED_PATH||'').trim();
 if(custom){if(await camFileExists(custom))return custom;throw Error('GRENA_CLOUDFLARED_PATH apunta a un archivo que no existe.');}
 const name=process.platform==='win32'?'cloudflared.exe':'cloudflared';
 const asset=camCloudflaredAsset();
 const overrideUrl=String(process.env.GRENA_CLOUDFLARED_DOWNLOAD_URL||'').trim();
 const expected=overrideUrl?String(process.env.GRENA_CLOUDFLARED_SHA256||'').trim().toLowerCase():(CLOUDFLARED_SHA256[asset]||'');
 const manual=join(APP_ROOT,name),target=join(DATA_DIR,name);
 if(await camFileExists(manual))return manual; // colocado a mano junto al programa: lo elige el usuario
 if(await camFileExists(target)){
  if(!expected||camCloudflaredVerified.has(target))return target;
  if(camSha256(await readFile(target))===expected){camCloudflaredVerified.add(target);return target}
  console.warn('[cloudflared] El binario guardado no coincide con la versión verificada; se vuelve a descargar.');
 }
 if(!asset)throw Error('Esta plataforma necesita cloudflared instalado manualmente para crear salas externas.');
 if(!expected)throw Error('Para usar GRENA_CLOUDFLARED_DOWNLOAD_URL define también GRENA_CLOUDFLARED_SHA256 (hash SHA-256 esperado).');
 const url=overrideUrl||`https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${asset}`;
 const tmp=`${target}.${process.pid}.download`;
 await mkdir(dirname(target),{recursive:true});
 let r;try{r=await fetch(url,{redirect:'follow'})}catch(e){throw Error(`No se pudo descargar cloudflared: ${e?.message||e}`)}
 if(!r.ok)throw Error(`No se pudo descargar cloudflared (HTTP ${r.status}).`);
 const data=Buffer.from(await r.arrayBuffer());
 if(data.length<500000)throw Error('La descarga de cloudflared llegó incompleta.');
 if(camSha256(data)!==expected)throw Error('La descarga de cloudflared no coincide con el SHA-256 esperado. Se descartó por seguridad.');
 await writeFile(tmp,data);await unlink(target).catch(()=>{});await rename(tmp,target);if(process.platform!=='win32')await chmod(target,0o755).catch(()=>{});
 camCloudflaredVerified.add(target);return target;
}
function camExtractTunnelUrl(text=''){const m=String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/ig);return m?.[0]?.replace(/\/$/,'')||''}
function camActiveRooms(){return [...camRooms.values()].filter(r=>r.active)}
function camStopTunnel(){
 clearTimeout(camTunnelRestartTimer);camTunnelRestartTimer=null;
 const p=camTunnelProcess;camTunnelProcess=null;
 if(p&&p.exitCode===null)try{p.kill()}catch{}
 if(!camCleanBase(process.env.GRENA_PUBLIC_URL))camTunnelUrl='';
}
function camScheduleTunnelRestart(){
 if(camTunnelRestartTimer||!camActiveRooms().length||camCleanBase(process.env.GRENA_PUBLIC_URL))return;
 camTunnelRestartTimer=setTimeout(()=>{camTunnelRestartTimer=null;camEnsureExternalAccess().catch(e=>{camGatewayLastError=e?.message||String(e);camScheduleTunnelRestart()})},2500);
}
async function camStartQuickTunnel(){
 if(!camGatewayReady)throw Error(camGatewayLastError||'El gateway externo de Cam Room todavía no está listo.');
 const exe=await camEnsureCloudflared();
 return await new Promise((resolve,reject)=>{
  let settled=false,buffer='';
  const p=spawn(exe,['tunnel','--url',`http://${CAM_GATEWAY_HOST}:${CAM_GATEWAY_PORT}`,'--no-autoupdate'],{cwd:APP_ROOT,windowsHide:true,stdio:['ignore','pipe','pipe']});
  camTunnelProcess=p;
  const fail=err=>{if(settled)return;settled=true;clearTimeout(timer);try{p.kill()}catch{};if(camTunnelProcess===p)camTunnelProcess=null;reject(err instanceof Error?err:Error(String(err)))};
  const parse=chunk=>{buffer=(buffer+String(chunk||'')).slice(-12000);const found=camExtractTunnelUrl(buffer);if(found&&!settled){settled=true;clearTimeout(timer);camTunnelUrl=found;camGatewayLastError='';resolve(found)}};
  p.stdout?.on('data',parse);p.stderr?.on('data',parse);
  p.on('error',e=>fail(Error(`No se pudo iniciar cloudflared: ${e?.message||e}`)));
  p.on('exit',(code)=>{if(camTunnelProcess===p)camTunnelProcess=null;const wasUrl=camTunnelUrl;if(wasUrl&&!camCleanBase(process.env.GRENA_PUBLIC_URL))camTunnelUrl='';if(!settled)fail(Error(`cloudflared se cerró antes de crear el enlace externo${code!=null?` (código ${code})`:''}.`));else camScheduleTunnelRestart()});
  const timer=setTimeout(()=>fail(Error('Cloudflare tardó demasiado en crear el enlace HTTPS de la sala.')),30000);
 });
}
async function camEnsureExternalAccess(){
 const fixed=camCleanBase(process.env.GRENA_PUBLIC_URL);
 if(fixed&&!camIsLocalBase(fixed)&&fixed.startsWith('https://')){camTunnelUrl=fixed;return fixed}
 if(camTunnelUrl&&!camIsLocalBase(camTunnelUrl)&&camTunnelUrl.startsWith('https://')&&(!camTunnelProcess||camTunnelProcess.exitCode===null))return camTunnelUrl;
 if(camTunnelStartPromise)return camTunnelStartPromise;
 camTunnelStartPromise=camStartQuickTunnel();
 try{return await camTunnelStartPromise}finally{camTunnelStartPromise=null}
}
function camBaseForRoom(room,req){return camCleanBase(camTunnelUrl)||camCleanBase(process.env.GRENA_PUBLIC_URL)||camCleanBase(room?.publicBaseUrl)||camRequestBase(req)}
function camHostPayload(room,req){if(!room)return null;const base=camBaseForRoom(room,req),externalReady=!!base&&base.startsWith('https://')&&!camIsLocalBase(base);return {id:room.id,code:room.code,createdAt:room.createdAt,active:room.active,publicBaseUrl:externalReady?base:'',externalReady,inviteToken:room.inviteToken,obsToken:room.obsToken,inviteUrl:`${base}/cam-join.html?invite=${encodeURIComponent(room.inviteToken)}`,localBase:`http://127.0.0.1:${PORT}`}}
function camPublicPeer(x){return {peerId:x.peerId,participantId:x.participantId,name:x.name,role:x.role}}
function camSend(ws,payload){if(ws?.readyState===WebSocket.OPEN)try{ws.send(JSON.stringify(payload))}catch{}}
function camPermissionsFor(a,b){
 if(!a||!b)return {send:false,receive:false};
 if(a.role==='obs')return {send:false,receive:(b.role==='host'||b.role==='guest')&&b.participantId===a.targetParticipantId};
 if(b.role==='obs')return {send:(a.role==='host'||a.role==='guest')&&a.participantId===b.targetParticipantId,receive:false};
 if(!['host','guest'].includes(a.role)||!['host','guest'].includes(b.role))return {send:false,receive:false};
 return {send:!!b.authorizedTargets?.has(a.participantId),receive:!!a.authorizedTargets?.has(b.participantId)};
}
function camCanPair(a,b){const ap=camPermissionsFor(a,b),bp=camPermissionsFor(b,a);return !!(ap.send||ap.receive||bp.send||bp.receive)}
function camPair(a,b,newPeerId=''){
 if(!camCanPair(a,b))return;
 let initiator=a.peerId===newPeerId?a:b;
 let answerer=initiator===a?b:a;
 if(a.role==='obs'){initiator=a;answerer=b}else if(b.role==='obs'){initiator=b;answerer=a}
 camSend(initiator.ws,{type:'cam:peer-available',peer:camPublicPeer(answerer),initiator:true,permissions:camPermissionsFor(initiator,answerer)});
 camSend(answerer.ws,{type:'cam:peer-available',peer:camPublicPeer(initiator),initiator:false,permissions:camPermissionsFor(answerer,initiator)});
}
function camBroadcastState(roomId){const participants=camParticipantList(roomId);for(const meta of camPeersFor(roomId).values())if(meta.role!=='obs')camSend(meta.ws,{type:'cam:room-state',participants})}
function camDropSocket(ws,{close=false}={}){
 const meta=camSocketMeta.get(ws);if(!meta)return;camSocketMeta.delete(ws);const peers=camPeersFor(meta.roomId);peers.delete(meta.peerId);
 for(const other of peers.values())camSend(other.ws,{type:'cam:peer-left',peerId:meta.peerId,participantId:meta.participantId});
 camBroadcastState(meta.roomId);if(meta.role==='host'){clearTimeout(camHostGraceTimers.get(meta.roomId));const timer=setTimeout(()=>{camHostGraceTimers.delete(meta.roomId);const room=camRooms.get(meta.roomId),hasHost=[...camPeersFor(meta.roomId).values()].some(x=>x.role==='host');if(room?.active&&!hasHost)camCloseRoom(room,'La sala se cerró porque el anfitrión se desconectó.')},CAM_HOST_GRACE_MS);camHostGraceTimers.set(meta.roomId,timer)}if(close)try{ws.close()}catch{}
}
function camCloseRoom(room,reason='Sala cerrada por el anfitrión'){
 if(!room)return;clearTimeout(camHostGraceTimers.get(room.id));camHostGraceTimers.delete(room.id);room.active=false;for(const meta of [...camPeersFor(room.id).values()]){camSend(meta.ws,{type:'cam:room-closed',reason});camSocketMeta.delete(meta.ws);try{meta.ws.close()}catch{}}camRoomPeers.delete(room.id);
 if(!camActiveRooms().length&&!camCleanBase(process.env.GRENA_PUBLIC_URL))setTimeout(()=>{if(!camActiveRooms().length)camStopTunnel()},250);
}
function camOwnerRoom(userId){return [...camRooms.values()].reverse().find(r=>r.ownerUserId===userId&&r.active)||null}
function camObsUrl(room,participantId,req){const base=camBaseForRoom(room,req),token=camParticipantObsToken(room,participantId);return `${base}/cam-source.html?room=${encodeURIComponent(room.id)}&participant=${encodeURIComponent(participantId)}&token=${encodeURIComponent(token)}`}
function camWsJoin(ws,req,msg){
 camDropSocket(ws);const role=String(msg.role||'');let room=null,name='',participantId='',targetParticipantId='';const peerId=camId('peer');
 if(role==='host'){
  const user=sessionUser(req);room=camRooms.get(String(msg.roomId||''));if(!user||!room?.active||room.ownerUserId!==user.id)return camSend(ws,{type:'cam:error',error:'Sala o sesión del anfitrión no válida.'});
  if(!camValidPin(msg.pin))return camSend(ws,{type:'cam:error',error:'Tu cámara necesita un PIN de 4 a 8 números.'});
  clearTimeout(camHostGraceTimers.get(room.id));camHostGraceTimers.delete(room.id);
  name=String(user.displayName||user.username||'Anfitrión').slice(0,40);participantId=`host_${room.id}`;
 }else if(role==='guest'){
  room=camRoomByInvite(msg.inviteToken);if(!room)return camSend(ws,{type:'cam:error',error:'La invitación no existe o ya venció.'});if(camParticipantList(room.id).length>=10)return camSend(ws,{type:'cam:error',error:'La sala llegó al máximo de 10 cámaras.'});
  if(!camValidPin(msg.pin))return camSend(ws,{type:'cam:error',error:'Crea un PIN de 4 a 8 números para proteger tu cámara.'});
  name=String(msg.name||'Invitado').trim().replace(/[<>]/g,'').slice(0,40)||'Invitado';
  const resume=String(msg.resumeParticipantId||'');participantId=/^guest_[A-Za-z0-9_-]{6,80}$/.test(resume)&&![...camPeersFor(room.id).values()].some(x=>x.participantId===resume)?resume:camId('guest');
 }else if(role==='obs'){
  targetParticipantId=String(msg.targetParticipantId||'');if(!targetParticipantId)return camSend(ws,{type:'cam:error',error:'Falta participante para OBS.'});room=camRoomByObs(msg.roomId,msg.obsToken,targetParticipantId);if(!room)return camSend(ws,{type:'cam:error',error:'Fuente OBS no autorizada.'});name='OBS';participantId=camId('obs');
 }else return camSend(ws,{type:'cam:error',error:'Rol de cámara no válido.'});
 const meta={ws,peerId,roomId:room.id,role,name,participantId,targetParticipantId,joinedAt:Date.now(),audioEnabled:!!msg.audioEnabled,videoEnabled:!!msg.videoEnabled,pinHash:(role==='host'||role==='guest')?camPinHash(room.id,participantId,msg.pin):'',authorizedTargets:new Set()};camSocketMeta.set(ws,meta);const peers=camPeersFor(room.id),existing=[...peers.values()];peers.set(peerId,meta);
 camSend(ws,{type:'cam:joined',peerId,participantId,room:{id:room.id,code:room.code},name,role,roomObsToken:(role==='host'||role==='guest')?camParticipantObsToken(room,participantId):'',iceServers:camIceServers(),turnConfigured:camIceServers().some(x=>String(x.urls||'').startsWith('turn')),ownObsUrl:(role==='host'||role==='guest')?camObsUrl(room,participantId,req):''});
 for(const other of existing)camPair(meta,other,peerId);camBroadcastState(room.id);
}
function camWsMessage(ws,req,data){try{return camWsMessageInner(ws,req,data)}catch(e){console.error('[cam ws]',e?.message||e)}}
function camWsMessageInner(ws,req,data){
 let msg;try{msg=JSON.parse(String(data||''))}catch{return}if(!msg||typeof msg!=='object')return;
 if(msg.type==='cam:join')return camWsJoin(ws,req,msg);
 const meta=camSocketMeta.get(ws);if(!meta)return;
 if(msg.type==='cam:unlock'&&(meta.role==='host'||meta.role==='guest')){
  const targetId=String(msg.targetParticipantId||''),requestId=String(msg.requestId||'');
  const target=[...camPeersFor(meta.roomId).values()].find(x=>(x.role==='host'||x.role==='guest')&&x.participantId===targetId);
  if(!target)return camSend(ws,{type:'cam:unlock-result',ok:false,requestId,targetParticipantId:targetId,error:'Esa cámara ya no está conectada.'});
  if(target.participantId===meta.participantId)return camSend(ws,{type:'cam:unlock-result',ok:true,requestId,targetParticipantId:targetId,obsToken:camParticipantObsToken(camRooms.get(meta.roomId),targetId)});
  if(!camValidPin(msg.pin)||camPinHash(meta.roomId,targetId,msg.pin)!==target.pinHash)return camSend(ws,{type:'cam:unlock-result',ok:false,requestId,targetParticipantId:targetId,error:'PIN incorrecto.'});
  meta.authorizedTargets.add(targetId);
  camSend(ws,{type:'cam:unlock-result',ok:true,requestId,targetParticipantId:targetId,obsToken:camParticipantObsToken(camRooms.get(meta.roomId),targetId)});
  camPair(meta,target,meta.peerId);return;
 }
 if(msg.type==='cam:signal'){
  const target=camPeersFor(meta.roomId).get(String(msg.toPeerId||''));if(!target||!camCanPair(meta,target))return;camSend(target.ws,{type:'cam:signal',fromPeerId:meta.peerId,signal:msg.signal||{}});return;
 }
 if(msg.type==='cam:media-state'&&(meta.role==='host'||meta.role==='guest')){
  meta.audioEnabled=!!msg.audioEnabled;meta.videoEnabled=!!msg.videoEnabled;camBroadcastState(meta.roomId);return;
 }
 if(msg.type==='cam:leave')return camDropSocket(ws);
}

// ===== GREÑA FIX4: guard central del puerto 8787 (Host/Origin + sesión) =====
// Rutas que usan los overlays de OBS (sin cookie) o que deben ser públicas por diseño.
const PUBLIC_GET=new Set(['/health','/api/account/me','/api/account/recovery/status','/api/cam-room/invite','/api/alert-style','/api/counter-settings','/api/viewers','/api/follower-goals','/api/loyalty','/api/social-settings','/api/taptap/state','/api/twitch/device/status','/auth/twitch/callback']);
const PUBLIC_POST=new Set(['/api/account/register','/api/account/login','/api/account/logout','/api/account/recovery/request','/api/account/recovery/reset','/api/app/window-heartbeat','/api/app/window-closing','/webhooks/kick','/api/twitch/token','/api/viewers/test']);
const LOCAL_HOSTS=new Set([`127.0.0.1:${PORT}`,`localhost:${PORT}`]);
function panelHostOk(req){return CLOUD_MODE?!!requestHost(req):LOCAL_HOSTS.has(String(req.headers.host||'').toLowerCase())}
// Un navegador siempre envía Origin en un POST entre sitios; sin Origin = cliente no-navegador (curl, puente interno).
function panelOriginOk(req){const o=req.headers.origin;if(CLOUD_MODE){if(o!==undefined&&!sameOriginRequest(req,o))return false}else if(o!==undefined&&!LOCAL_ORIGINS.has(String(o)))return false;const sfs=String(req.headers['sec-fetch-site']||'').toLowerCase();if(sfs&&!['same-origin','same-site','none'].includes(sfs))return false;return true}
// Devuelve true si la petición puede continuar; si no, ya respondió y devuelve false.
function panelGuard(req,res,pathname){
  const method=req.method||'GET';
  if(pathname==='/webhooks/kick')return true; // lo valida la firma de Kick; llega por el túnel con otro Host
  if(!panelHostOk(req)){res.writeHead(403,{'content-type':'text/plain; charset=utf-8'});res.end('Host no permitido');return false}
  const write=!(method==='GET'||method==='HEAD'||method==='OPTIONS');
  if(write&&!panelOriginOk(req)){if(pathname.startsWith('/api/'))json(res,403,{ok:false,error:'Origen no permitido'});else{res.writeHead(403,{'content-type':'text/plain; charset=utf-8'});res.end('Origen no permitido')}return false}
  if(write&&pathname!=='/webhooks/kick'){const hasBody=Number(req.headers['content-length']||0)>0||!!req.headers['transfer-encoding'];const type=String(req.headers['content-type']||'').toLowerCase();if(hasBody&&!type.startsWith('application/json')){if(pathname.startsWith('/api/'))json(res,415,{ok:false,error:'Content-Type debe ser application/json.'});else{res.writeHead(415);res.end('Unsupported Media Type')}return false}}
  if(!pathname.startsWith('/api/'))return true;                // páginas y estáticos: ya los gestiona el router
  if(pathname.startsWith('/api/internal/'))return true;        // llevan su propio token de puente
  if(method==='GET'&&PUBLIC_GET.has(pathname))return true;
  if(method==='POST'&&PUBLIC_POST.has(pathname))return true;
  if(internalBridgeAllowed(req))return true;                    // chat-server -> server con token por arranque
  if(sessionUser(req))return true;
  json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});return false;
}
// ===== GREÑA WEB: proxy interno del motor de chat (8788) sobre el mismo HTTPS público =====
function proxyChatHttp(req,res,url,stripChat=true){
  const pathname=stripChat?(url.pathname==='/chat'?'/':url.pathname.slice('/chat'.length)||'/'):url.pathname;
  const internalOrigin=`http://127.0.0.1:${PORT}`;
  const headers={...req.headers,host:'127.0.0.1:8788',origin:internalOrigin};
  delete headers['x-forwarded-host'];delete headers['x-forwarded-proto'];delete headers['x-forwarded-for'];
  const upstream=http.request({hostname:'127.0.0.1',port:8788,path:pathname+url.search,method:req.method,headers},u=>{
    const out={...u.headers};delete out['access-control-allow-origin'];delete out['access-control-allow-credentials'];
    res.writeHead(u.statusCode||502,out);u.pipe(res);
  });
  upstream.on('error',e=>{if(!res.headersSent)json(res,502,{ok:false,error:'Motor de chat no disponible.',detail:String(e?.message||e)});else try{res.end()}catch{}});
  req.pipe(upstream);
}
const CHAT_HTTP_ROUTES=new Set([
  '/api/fish-tts',
  '/api/connection-prefs',
  '/api/moderation/action',
  '/api/voice-control',
  '/api/multichat-settings',
  '/api/multichat-history',
  '/api/multichat-test',
  '/avatar'
]);

const bridgeMessageSeen=new Map();
function bridgeMessageDuplicate(id){id=String(id||'').trim();if(!id)return false;const now=Date.now(),prev=bridgeMessageSeen.get(id)||0;if(prev&&now-prev<2*60*1000)return true;bridgeMessageSeen.set(id,now);for(const [k,t] of bridgeMessageSeen)if(now-t>2*60*1000)bridgeMessageSeen.delete(k);return false}

const server=http.createServer(async(req,res)=>{let url,pathname='/';try{if(!safeReqPath(req.url))throw 0;url=new URL(req.url,'http://127.0.0.1');pathname=url.pathname}catch{res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});return res.end('Solicitud no válida')}try{
 if(pathname==='/chat'||pathname.startsWith('/chat/'))return proxyChatHttp(req,res,url);
 if(!panelGuard(req,res,pathname))return;
 if(CHAT_HTTP_ROUTES.has(pathname))return proxyChatHttp(req,res,url,false);
 if(pathname==='/health')return json(res,200,{ok:true,app:'GREÑA LIVE PRO',status});
 if(pathname==='/api/app/window-heartbeat'&&req.method==='POST'){appWindowHeartbeat();return json(res,200,{ok:true});}
 if(pathname==='/api/app/window-closing'&&req.method==='POST'){appWindowClosing();return json(res,200,{ok:true});}
 if(pathname==='/api/app/exit'&&req.method==='POST'){if(CLOUD_MODE)return json(res,200,{ok:true,message:'GREÑA Web continúa en línea. Usa Cerrar sesión para salir de tu cuenta.'});json(res,200,{ok:true,message:'Cerrando GREÑA LIVE PRO…'});setTimeout(()=>requestFullShutdown('boton-salir-de-grena'),120);return;}
 if(pathname==='/api/account/me'&&req.method==='GET'){const u=sessionUser(req);return json(res,200,accountPayload(u));}
 if(pathname==='/api/account/register'&&req.method==='POST'){
   {const g=authThrottle();if(g)return tooMany(res,g)}
   let raw='';raw=await readBody(req);const body=JSON.parse(raw||'{}');
   const username=normalizeGrenaUsername(body.username),displayName=String(body.displayName||body.username||'').trim().slice(0,40),password=String(body.password||''),email=normalizeEmail(body.email);
   if(username.length<3)return json(res,400,{ok:false,error:'El usuario debe tener al menos 3 caracteres.'});
   if(!validEmail(email))return json(res,400,{ok:false,error:'Escribe un correo electrónico válido para recuperar tu cuenta.'});
   if(password.length<8)return json(res,400,{ok:false,error:'La contraseña debe tener al menos 8 caracteres.'});
   if(usersStore.users.some(u=>u.username===username))return json(res,409,{ok:false,error:'Ese usuario de GREÑA ya existe en este equipo.'});
   if(usersStore.users.some(u=>normalizeEmail(u.email)===email))return json(res,409,{ok:false,error:'Ese correo ya está vinculado a otra cuenta GREÑA.'});
   const first=usersStore.users.length===0,salt=randomBytes(16).toString('hex');
   const user={id:createHash('sha256').update(username+Date.now()+randomBytes(8).toString('hex')).digest('hex').slice(0,20),username,displayName:displayName||username,email,salt,passwordHash:hashPassword(password,salt),createdAt:Date.now()};
   usersStore.users.push(user);await persistUsers();if(first)await migrateLegacyIntoProfile(user.id);await activateProfile(user.id);await createSession(res,user);return json(res,201,accountPayload(user));
 }
 if(pathname==='/api/account/login'&&req.method==='POST'){
   let raw='';raw=await readBody(req);const body=JSON.parse(raw||'{}'),username=normalizeGrenaUsername(body.username),password=String(body.password||'');
   {const g=authThrottle();if(g)return tooMany(res,g)}
   {const l=loginLockedSeconds(username);if(l)return tooMany(res,l)}
   const user=usersStore.users.find(u=>u.username===username);
   const passOk=user?await verifyPasswordAsync(password,user):(await scryptAsync(password,DUMMY_SALT).catch(()=>0),false);
   if(!user||!passOk){loginFailed(username);return json(res,401,{ok:false,error:'Usuario o contraseña incorrectos.'})}
   loginRate.delete(username);
   await activateProfile(user.id);await createSession(res,user);return json(res,200,accountPayload(user));
 }
 if(pathname==='/api/account/logout'&&req.method==='POST'){const u=sessionUser(req);await destroySession(req,res);if(u?.id&&u.id===activeUserId)await deactivateProfile();return json(res,200,{ok:true});}
 if(pathname==='/api/account/recovery-email'&&req.method==='POST'){
   const u=sessionUser(req);if(!u)return json(res,401,{ok:false,error:'Inicia sesión para vincular el correo de recuperación.'});
   let raw='';raw=await readBody(req);const body=JSON.parse(raw||'{}'),email=normalizeEmail(body.email);
   if(!validEmail(email))return json(res,400,{ok:false,error:'Escribe un correo electrónico válido.'});
   if(usersStore.users.some(x=>x.id!==u.id&&normalizeEmail(x.email)===email))return json(res,409,{ok:false,error:'Ese correo ya está vinculado a otra cuenta GREÑA.'});
   u.email=email;u.emailUpdatedAt=Date.now();await persistUsers();return json(res,200,accountPayload(u));
 }
 if(pathname==='/api/account/recovery/status'&&req.method==='GET')return json(res,200,{ok:true,mailConfigured:mailConfigured()});
 if(pathname==='/api/account/recovery/request'&&req.method==='POST'){
   let raw='';raw=await readBody(req);const body=JSON.parse(raw||'{}'),email=normalizeEmail(body.email);
   if(!validEmail(email))return json(res,200,{ok:true,message:'Si ese correo está vinculado a GREÑA, recibirás las instrucciones de recuperación.'});
   if(!mailConfigured())return json(res,503,{ok:false,error:'El administrador de GREÑA aún no configuró el servicio de correo de recuperación.'});
   const user=usersStore.users.find(u=>normalizeEmail(u.email)===email);
   const now=Date.now(),rate=recoveryRate.get(email)||{last:0,hits:[]};rate.hits=rate.hits.filter(t=>now-t<60*60*1000);
   if(now-rate.last<60*1000||rate.hits.length>=5)return json(res,200,{ok:true,message:'Si ese correo está vinculado a GREÑA, recibirás las instrucciones de recuperación.'});
   rate.last=now;rate.hits.push(now);recoveryRate.set(email,rate);
   if(user){
     clearExpiredRecovery();for(const [id,r] of Object.entries(recoveryStore.requests))if(r?.userId===user.id)delete recoveryStore.requests[id];
     const id=randomBytes(16).toString('hex'),code=String(randomInt(100000,1000000));
     recoveryStore.requests[id]={userId:user.id,email,codeHash:codeHash(code,id),createdAt:now,expiresAt:now+10*60*1000,attempts:0,used:false};await persistRecovery();
     try{await sendRecoveryEmail(user,code)}catch(e){delete recoveryStore.requests[id];await persistRecovery().catch(()=>{});console.error('Correo recuperación:',e);return json(res,502,{ok:false,error:'No se pudo enviar el correo de recuperación. Revisa la configuración del correo de GREÑA.'})}
   }
   return json(res,200,{ok:true,message:'Si ese correo está vinculado a GREÑA, recibirás el usuario y un código para crear una contraseña nueva.'});
 }
 if(pathname==='/api/account/recovery/reset'&&req.method==='POST'){
   let raw='';raw=await readBody(req);const body=JSON.parse(raw||'{}'),email=normalizeEmail(body.email),code=String(body.code||'').trim(),password=String(body.password||'');
   if(!validEmail(email)||!/^[0-9]{6}$/.test(code))return json(res,400,{ok:false,error:'Correo o código inválido.'});
   if(password.length<8)return json(res,400,{ok:false,error:'La nueva contraseña debe tener al menos 8 caracteres.'});
   clearExpiredRecovery();const user=usersStore.users.find(u=>normalizeEmail(u.email)===email);if(!user)return json(res,400,{ok:false,error:'Código inválido o vencido.'});
   const entry=Object.entries(recoveryStore.requests).find(([,r])=>r?.userId===user.id&&normalizeEmail(r.email)===email&&!r.used);if(!entry)return json(res,400,{ok:false,error:'Código inválido o vencido.'});
   const [id,rq]=entry;if(Number(rq.expiresAt||0)<Date.now()){delete recoveryStore.requests[id];await persistRecovery();return json(res,400,{ok:false,error:'El código venció. Solicita uno nuevo.'})}
   rq.attempts=Number(rq.attempts||0)+1;if(rq.attempts>5){delete recoveryStore.requests[id];await persistRecovery();return json(res,429,{ok:false,error:'Demasiados intentos. Solicita un código nuevo.'})}
   const got=Buffer.from(codeHash(code,id),'hex'),want=Buffer.from(String(rq.codeHash||''),'hex');if(got.length!==want.length||!timingSafeEqual(got,want)){await persistRecovery();return json(res,400,{ok:false,error:'Código inválido o vencido.'})}
   const salt=randomBytes(16).toString('hex');user.salt=salt;user.passwordHash=hashPassword(password,salt);user.passwordChangedAt=Date.now();rq.used=true;await persistUsers();invalidateUserSessions(user.id);await safeWriteJson(SESSIONS_FILE,sessionsStore);delete recoveryStore.requests[id];await persistRecovery();await activateProfile(user.id);await createSession(res,user);return json(res,200,{...accountPayload(user),message:'Contraseña cambiada correctamente.'});
 }


 if(pathname==='/api/cam-room/current'&&req.method==='GET'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});const room=camOwnerRoom(su.id);
  if(room)try{room.publicBaseUrl=await camEnsureExternalAccess()}catch(e){camGatewayLastError=e?.message||String(e)}
  return json(res,200,{ok:true,room:camHostPayload(room,req),participants:room?camParticipantList(room.id):[],connectedCount:room?camParticipantList(room.id).length:0,tunnelError:room&&!camHostPayload(room,req)?.externalReady?camGatewayLastError:''});
 }
 if(pathname==='/api/cam-room/create'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});
  for await(const _ of req){} // consume el body; la sala ya no acepta una URL pública manual.
  const externalBase=await camEnsureExternalAccess();if(!externalBase||camIsLocalBase(externalBase)||!externalBase.startsWith('https://'))return json(res,503,{ok:false,error:'No se pudo crear el enlace HTTPS externo de Cam Room.'});
  const old=camOwnerRoom(su.id);if(old)camCloseRoom(old,'El anfitrión creó una sala nueva.');
  let code='';do{code=`GRENA${randomInt(1000,10000)}`}while([...camRooms.values()].some(r=>r.active&&r.code===code));const room={id:camId('room'),code,ownerUserId:su.id,ownerName:su.displayName||su.username,inviteToken:camToken(24),obsToken:'',obsTokens:{},publicBaseUrl:externalBase,createdAt:Date.now(),active:true};camRooms.set(room.id,room);return json(res,201,{ok:true,room:camHostPayload(room,req),participants:[]});
 }
 if(pathname==='/api/cam-room/close'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});const room=camOwnerRoom(su.id);if(room)camCloseRoom(room);return json(res,200,{ok:true});
 }
 if(pathname==='/api/cam-room/invite'&&req.method==='GET'){
  const room=camRoomByInvite(url.searchParams.get('token'));if(!room)return json(res,404,{ok:false,error:'Invitación inválida o vencida.'});return json(res,200,{ok:true,room:{id:room.id,code:room.code,hostName:room.ownerName,createdAt:room.createdAt},secureContextRequired:true});
 }

 if(pathname==='/api/internal/status'&&req.method==='POST'){
  if(!requireInternalBridge(req,res))return;
  let b='';b=await readBody(req);const body=JSON.parse(b||'{}');
  if(!['tiktok','twitch','kick'].includes(body.platform))return json(res,400,{ok:false,error:'Plataforma no válida'});
  const p=body.platform,wasConnected=!!bridgeRuntime[p],label=String(body.label||'');
  bridgeRuntime[p]=!!body.connected;
  noteBridgeSignal(p,'status',{connected:!!body.connected,label,roomId:String(body.roomId||'')});
  if(p==='tiktok'&&body.connected){
   clearTikTokBridgeDisconnectGrace();
   if(body.roomId){const changed=beginTapTapSession(body.roomId);if(changed){bridgeSignals.tiktok.lastEventAt=0;bridgeSignals.tiktok.lastKind='status';bridgeSignals.tiktok.counts={};}}
   if(tiktok){const old=tiktok;tiktok=null;try{old.disconnect()}catch{}}
  }
  if(!body.connected){
   const backupActive=p==='tiktok'?(tiktokDedicatedCounterHealthy()||!!tiktok):p==='twitch'?(!!counterTwitchTimer||!!twitchWS):p==='kick'?!!kickViewerTimer:false;
   const terminalTikTok=p==='tiktok'&&/termin[oó]|ended|stream_end|offline confirmado/i.test(label);
   if(terminalTikTok){
    clearTikTokBridgeDisconnectGrace();
    setStatus(p,false,label||'TikTok LIVE terminó',body.account);
    setViewers('tiktok',0,'TikTok STREAM_END bridge');
   }else if(backupActive){
    if(p==='tiktok')clearTikTokBridgeDisconnectGrace();
    setStatus(p,true,String(body.account||accountFromAuth(p)||'')+` · ${p==='kick'?'contador API activo':'contador activo'} · chat reconectando`,body.account);
   }else if(p==='tiktok'&&viewers.tiktok>0&&Date.now()-Number(viewerMeta.tiktok.lastGoodAt||0)<30000){
    // Una caída corta del socket/chat no significa que el LIVE haya quedado en 0.
    // Conservamos la última cifra durante 15 s; STREAM_END sí borra de inmediato.
    const account=String(body.account||accountFromAuth('tiktok')||'').trim();
    setStatus('tiktok',false,`${account?`@${account.replace(/^@/,'')} · `:''}chat reconectando`,account);
    scheduleTikTokBridgeDisconnectGrace(account);
   }else{
    if(p==='tiktok')clearTikTokBridgeDisconnectGrace();
    setStatus(p,false,label||'No conectado',body.account);
    setViewers(p,0,'desconectado por bridge');
   }
  }else setStatus(p,true,label||'Conectado',body.account);
  if(p==='tiktok'&&!body.connected&&wasConnected&&/termin[oó]|ended|stream_end/i.test(label))endTapTapSession();
  pushEventHealth();return json(res,200,{ok:true,status:publicStatus(),eventHealth:eventHealthSnapshot()});
 }
 if(pathname==='/api/internal/event'&&req.method==='POST'){
  if(!requireInternalBridge(req,res))return;let b='';b=await readBody(req);const body=JSON.parse(b||'{}');const platform=String(body.platform||''),event=String(body.event||'');
  if(!['TikTok','Twitch','Kick'].includes(platform)||!['follow','sub','gift','cheer','share','raid','like'].includes(event))return json(res,400,{ok:false,error:'Evento interno no válido'});
  if(bridgeMessageDuplicate(body.bridgeEventId))return json(res,200,{ok:true,duplicate:true});
  if(platform==='Twitch'&&twitchCfg){
   const officialFor={follow:['channel.follow'],sub:['channel.subscribe','channel.subscription.message'],gift:['channel.subscription.gift'],cheer:['channel.cheer'],raid:['channel.raid']};
   const covered=!!(twitchWS&&twitchWS.readyState===1)&&(officialFor[event]||[]).some(x=>twitchEventHealth.active.includes(x));
   if(covered)return json(res,200,{ok:true,ignored:'eventsub-is-primary'});
  }
  alert(platform,event,body.name,body.action||'',body);return json(res,200,{ok:true});
 }
 if(pathname==='/api/internal/twitch-user-meta'&&req.method==='GET'){
  if(!internalBridgeAllowed(req))return json(res,403,{ok:false,error:'Forbidden'});
  const userId=String(url.searchParams.get('user_id')||'');return json(res,200,{ok:true,...await twitchUserMeta(userId)});
 }
 if(pathname==='/api/internal/loyalty'&&req.method==='POST'){
  if(!requireInternalBridge(req,res))return;let b='';b=await readBody(req);const body=JSON.parse(b||'{}');
  const p=loyaltyPlatform(body.platform);if(!p)return json(res,400,{ok:false,error:'Plataforma de fidelidad no válida'});
  if(bridgeMessageDuplicate(body.bridgeEventId))return json(res,200,{ok:true,duplicate:true});
  noteBridgeSignal(p,String(body.kind||body.event||'loyalty'),{user:body.user||'',amount:Number(body.amount||0)||0});
  if(p==='tiktok'&&String(body.kind||body.event||'').toLowerCase()==='like')recordTapTap(body);
  const result=recordLoyaltyEvent(body);return json(res,200,{ok:true,result,taptap:p==='tiktok'?publicTapTapState():undefined});
 }
 if(pathname==='/api/loyalty'&&req.method==='GET'){
  const limit=Math.max(1,Math.min(50,Number(url.searchParams.get('limit')||loyaltyState.settings.topN||5)||5));
  return json(res,200,{ok:true,loyalty:publicLoyaltyState(limit)});
 }
 if(pathname==='/api/taptap/state'&&req.method==='GET')return json(res,200,{ok:true,...publicTapTapState()});
 if(pathname==='/api/taptap/reset'&&req.method==='POST'){const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});return json(res,200,{ok:true,...resetTapTap()});}
 if(pathname==='/api/taptap/test'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});let b='';b=await readBody(req);let body={};try{body=JSON.parse(b||'{}')}catch{}
  const preview=tapTapPreviewState(body.amount);broadcast(preview);if(tapTapPreviewTimer)clearTimeout(tapTapPreviewTimer);tapTapPreviewTimer=setTimeout(()=>broadcast(publicTapTapState()),5000);
  return json(res,200,{ok:true,...preview});
 }
 if(pathname==='/api/loyalty/settings'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});let b='';b=await readBody(req);const body=JSON.parse(b||'{}');
  loyaltyState.settings={...loyaltyState.settings,rotateSeconds:Math.max(3,Math.min(30,Number(body.rotateSeconds)||8)),topN:Math.max(3,Math.min(10,Number(body.topN)||5)),activeWindowMinutes:Math.max(3,Math.min(20,Number(body.activeWindowMinutes)||10))};
  await persistLoyalty();pushLoyalty();return json(res,200,{ok:true,loyalty:publicLoyaltyState(10)});
 }
 if(pathname==='/api/loyalty/test'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});let b='';b=await readBody(req);const body=JSON.parse(b||'{}');
  const p=loyaltyPlatform(body.platform||['tiktok','twitch','kick'][Math.floor(Math.random()*3)]);if(!p)return json(res,400,{ok:false,error:'Plataforma no válida'});
  const names=['UsuarioUno','CreadorDos','LaMVP','ShadowLive','TeamLive','ChatActivo','LunaChat'];
  for(let i=0;i<5;i++){const name=names[(i+(p==='twitch'?1:p==='kick'?2:0))%names.length];const rec=ensureLoyaltyUser(p,name,name,'');if(rec){rec.u.score=Math.max(Number(rec.u.score)||0,120+(5-i)*95+Math.floor(Math.random()*35));rec.u.lastSeen=Date.now()-i*40000;rec.u.stats.comments=Math.max(Number(rec.u.stats.comments)||0,8+i*2);rec.u.activeDays=Math.max(Number(rec.u.activeDays)||0,2+i)}}
  scheduleLoyaltySave();pushLoyalty();return json(res,200,{ok:true,loyalty:publicLoyaltyState(10)});
 }
 if(pathname==='/api/loyalty/reset'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});let b='';b=await readBody(req);const body=JSON.parse(b||'{}');const p=loyaltyPlatform(body.platform||'');
  if(p)loyaltyState.users[p]={};else loyaltyState.users={tiktok:{},twitch:{},kick:{}};loyaltyRuntime.clear();await persistLoyalty();pushLoyalty();return json(res,200,{ok:true,loyalty:publicLoyaltyState(10)});
 }
 if(pathname==='/api/internal/viewers'&&req.method==='POST'){
  if(!requireInternalBridge(req,res))return;let b='';b=await readBody(req);const body=JSON.parse(b||'{}');
  if(!['tiktok','twitch','kick'].includes(body.platform))return json(res,400,{ok:false,error:'Plataforma no válida'});
  // El bridge y el contador dedicado ahora se respaldan mutuamente. Antes TikTok descartaba
  // por completo esta cifra cuando existía counterTikTok, causando el 0 permanente visto en LIVE.
  const source=String(body.source||'').trim()||(body.platform==='kick'?'Kick browser realtime':body.platform==='tiktok'?'TikTok LIVE bridge':'Twitch IRC bridge');
  const transientTikTokBridgeZero=body.platform==='tiktok'&&Number(body.count)===0&&/bridge disconnected|chat.*desconect|socket.*disconnect/i.test(source)&&tiktokDedicatedCounterHealthy();
  const accepted=transientTikTokBridgeZero?false:setViewers(body.platform,body.count,source);
  if(transientTikTokBridgeZero)viewerMeta.tiktok.source='TikTok chat reconectando · contador dedicado activo';
  // El bridge actualiza el valor visible, pero NO marca sana la conexión dedicada.
  // Así el watchdog puede reparar un contador dedicado zombi sin afectar el dato del bridge.
  noteBridgeSignal(body.platform,'viewer',{count:Number(body.count)||0,source,accepted});
  return json(res,200,{ok:true,accepted,viewers:currentViewers(),meta:viewerMeta[body.platform]});
 }
 if(pathname==='/api/follower-goals'&&req.method==='GET')return json(res,200,publicFollowerGoals());
 if(pathname==='/api/follower-goals'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}'),next={...followerGoals.settings};for(const p of ['tiktok','twitch','kick'])if(body[p])next[p]={start:Math.max(0,Number(body[p].start)||0),goal:Math.max(1,Number(body[p].goal)||1),show:body[p].show!==false};followerGoals.settings=next;if(body.resetGained)followerGoals.gained={tiktok:0,twitch:0,kick:0};await persistFollowerGoals();broadcast({type:'follower-goals',state:publicFollowerGoals()});return json(res,200,{ok:true,...publicFollowerGoals()})}
 if(pathname==='/api/viewers'){const v=currentViewers();return json(res,200,{ok:true,viewers:v,total:v.tiktok+v.twitch+v.kick,meta:viewerMeta,testMode:viewerTest.enabled,updatedAt:Date.now()})}
 if(pathname==='/api/counter-settings'&&req.method==='GET')return json(res,200,{ok:true,settings:publicCounterSettings()});
 if(pathname==='/api/counter-settings'&&req.method==='POST'){let b='';b=await readBody(req);const settings=normalizeCounterWidgetSettings(JSON.parse(b||'{}'));autoPrefs={...autoPrefs,counterStyle:settings.style,counterCardColor:settings.counterCardColor};await persistAutoPrefs();broadcast({type:'counter-settings',settings});return json(res,200,{ok:true,settings})}
 if(pathname==='/api/counter/connect'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}');try{if(body.platform==='tiktok'){autoPrefs.counterTikTok=String(body.value||'');autoPrefs.counterTikTokEnabled=true;await persistAutoPrefs();const r=await connectCounterTikTok(body.value);return json(res,200,{ok:true,...r,viewers:currentViewers()})}if(body.platform==='twitch'){autoPrefs.counterTwitch=String(body.value||'');autoPrefs.counterTwitchEnabled=true;await persistAutoPrefs();const r=await connectCounterTwitch(body.value);return json(res,200,{ok:true,...r,viewers:currentViewers()})}if(body.platform==='kick'){const v=String(body.value||'').trim();const slug=v.replace(/^https?:\/\/(www\.)?kick\.com\//i,'').split(/[/?#]/)[0].replace(/^@/,'');if(!slug)throw Error('Pon el link o usuario de Kick.');autoPrefs.counterKick=`https://kick.com/${slug}`;autoPrefs.counterKickEnabled=true;await persistAutoPrefs();await refreshKick();return json(res,200,{ok:true,slug,viewers:currentViewers()})}return json(res,400,{ok:false,error:'Plataforma no válida'})}catch(e){return json(res,400,{ok:false,error:e?.message||String(e)})}}
 if(pathname==='/api/counter/disconnect'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}');if(body.platform==='tiktok'){autoPrefs.counterTikTokEnabled=false;await persistAutoPrefs();const oldCounter=counterTikTok;counterTikTok=null;clearTikTokCounterTimers();counterTikTokLastSignalAt=0;counterTikTokPollFailures=0;if(oldCounter)try{oldCounter.disconnect()}catch{};counterTikTokUser='';setViewers('tiktok',0,'desconectado contador TikTok')}if(body.platform==='twitch'){autoPrefs.counterTwitchEnabled=false;await persistAutoPrefs();if(counterTwitchTimer)clearInterval(counterTwitchTimer);counterTwitchTimer=null;counterTwitchLogin='';setViewers('twitch',0,'desconectado contador Twitch')}if(body.platform==='kick'){autoPrefs.counterKickEnabled=false;await persistAutoPrefs();if(kickViewerTimer)clearInterval(kickViewerTimer);kickViewerTimer=null;kickAppToken='';kickTokenExpiresAt=0;setViewers('kick',0,'desconectado')}return json(res,200,{ok:true,viewers:currentViewers()})}
 if(pathname==='/api/viewers/test'&&req.method==='POST'){
  let b='';b=await readBody(req);let body={};try{body=JSON.parse(b||'{}')}catch{return json(res,400,{ok:false,error:'JSON no válido'})}
  if(viewerTestTimer){clearTimeout(viewerTestTimer);viewerTestTimer=null}
  if(body.enabled===false||String(body.action||'').toLowerCase()==='stop'){
    viewerTest.enabled=false;pushViewers();return json(res,200,{ok:true,testMode:false,viewers:currentViewers(),message:'Modo prueba desactivado. Volvieron los contadores reales.'});
  }
  const clamp=v=>Math.max(0,Math.min(999999,Math.trunc(Number(v)||0)));
  viewerTest.enabled=true;
  viewerTest.tiktok=clamp(body.tiktok ?? body.count ?? 100);
  viewerTest.twitch=clamp(body.twitch ?? 0);
  viewerTest.kick=clamp(body.kick ?? 0);
  pushViewers();
  viewerTestTimer=setTimeout(()=>{viewerTest.enabled=false;viewerTestTimer=null;pushViewers()},5*60*1000);viewerTestTimer.unref?.();
  return json(res,200,{ok:true,testMode:true,viewers:currentViewers(),message:'Modo prueba activo por un máximo de 5 minutos.'});
 }
 if(pathname==='/api/ai-config'&&req.method==='GET')return json(res,200,{ok:true,configured:!!oauthConfig.openai?.apiKey,provider:'OpenAI'});
 if(pathname==='/api/ai-config'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}');const apiKey=String(body.apiKey||'').trim();if(!apiKey)return json(res,400,{ok:false,error:'Falta la API key'});oauthConfig.openai={...(oauthConfig.openai||{}),apiKey};await persistOAuthConfig();return json(res,200,{ok:true,configured:true})}
 if(pathname==='/api/ai-alert'&&req.method==='POST'){let b='';b=await readBody(req);if(b.length>8*1024*1024)return json(res,413,{ok:false,error:'La imagen es demasiado grande'});const body=JSON.parse(b||'{}');const key=oauthConfig.openai?.apiKey;if(!key)return json(res,400,{ok:false,error:'IA real no configurada'});const userPrompt=String(body.prompt||'').trim();if(!userPrompt)return json(res,400,{ok:false,error:'Falta la descripción'});const event=String(body.event||'follow');const eventLabel=({follow:'nuevo seguidor',sub:'nueva suscripción',gift:'nuevo regalo',cheer:'Bits/apoyo'})[event]||'evento de stream';const layout=String(body.layout||'creative'),intensity=String(body.intensity||'high');const allowFrame=body.frame!==false,allowParticles=body.particles!==false;const content=[{type:'input_text',text:`Diseña una ALERTA COMPLETA premium para streaming de ${eventLabel}, no simplemente el avatar original. Petición del creador: ${userPrompt}. Usa el avatar de referencia como personaje principal conservando fielmente identidad, rostro, peinado y ropa, pero intégralo en una composición nueva y espectacular. Estilo de composición: ${layout}. Intensidad visual: ${intensity}. ${allowFrame?'Puedes crear marcos, placas, cintas, formas 3D o bordes decorativos cuando mejoren el diseño.':'Evita marcos cerrados.'} ${allowParticles?'Incluye efectos visuales apropiados como destellos, confeti, energía, partículas o elementos temáticos.':''} El resultado debe sentirse como una alerta profesional de streamer: personaje con pose/expresión adaptada al evento, composición dinámica, espacio visual claro donde GREÑA superpondrá después el nombre real del usuario y el mensaje. NO incrustes nombres, frases ni texto legible en la imagen. Fondo completamente transparente, sin escenario ni rectángulo de fondo. Crea una composición original y muy trabajada, lista para OBS. Devuelve solamente la imagen.`}];if(body.image&&String(body.image).startsWith('data:image/'))content.push({type:'input_image',image_url:body.image});const rr=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:'gpt-6-astra',input:[{role:'user',content}],tools:[{type:'image_generation',model:'gpt-image-2.5-sunburst',background:'transparent',output_format:'png',quality:'high',size:'1024x1024',action:'auto'}],tool_choice:{type:'image_generation'}})});const rd=await rr.json().catch(()=>({}));if(!rr.ok)throw Error(rd.error?.message||`OpenAI HTTP ${rr.status}`);const call=(rd.output||[]).find(x=>x.type==='image_generation_call'&&x.result);if(!call?.result)throw Error('La IA no devolvió una imagen.');const image='data:image/png;base64,'+call.result;const theme=/terror|miedo|zombi|dayz/i.test(userPrompt)?'Terror / supervivencia':/anime/i.test(userPrompt)?'Anime':/caricatura|divertid|feliz|sorprend/i.test(userPrompt)?'Caricatura divertida':'Gaming neón';const name='NOMBRE_DEL_USUARIO',message=({follow:'¡Gracias por seguirme!',sub:'¡Bienvenido al equipo!',gift:'¡Gracias por el regalo!',cheer:'¡Gracias por el apoyo!'})[event]||'¡Gracias por el apoyo!';const animation=String(body.animation||'pop');const layers=[{id:'ai-art',type:'image',name:'Arte IA',x:50,y:50,w:78,h:78,opacity:100,animation,src:image},{id:'ai-title',type:'text',role:'title',name:'Título',x:50,y:23,w:70,font:24,opacity:100,animation:'slide',text:''},{id:'ai-name',type:'text',role:'name',name:'Usuario',x:50,y:76,w:65,font:36,opacity:100,animation:'pop',text:name},{id:'ai-message',type:'text',role:'message',name:'Mensaje',x:50,y:86,w:70,font:18,opacity:95,animation:'float',text:message}];const concept={event,theme,name,message,accent:'#a855f7',accent2:'#22d3ee',duration:6,nameSize:36,animation,layers};return json(res,200,{ok:true,generated:true,image,concept})}
 if(pathname==='/api/social-settings'&&req.method==='GET')return json(res,200,{ok:true,settings:socialSettings});
 if(pathname==='/api/social-settings'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}');socialSettings={...socialDefaults,...body};await safeWriteJson(stateFile('social.json',LEGACY_SOCIAL_FILE),socialSettings);broadcast({type:'social-settings',settings:socialSettings});return json(res,200,{ok:true,settings:socialSettings})}
 if(pathname==='/api/auto-connect'&&req.method==='GET')return json(res,200,{ok:true,prefs:autoPrefs});
 if(pathname==='/api/auto-connect'&&req.method==='POST'){let b='';b=await readBody(req);autoPrefs={...autoPrefs,...JSON.parse(b||'{}')};await persistAutoPrefs();return json(res,200,{ok:true,prefs:autoPrefs})}
 if(pathname==='/webhooks/kick'&&req.method==='POST'){
   let raw='';raw=await readBody(req);
   const verified=await verifyKickWebhook(req,raw).catch(e=>{console.warn('[KICK WEBHOOK VERIFY]',e?.message||e);return false});if(verified==='duplicate')return json(res,200,{ok:true,duplicate:true});if(!verified)return json(res,403,{ok:false,error:'Firma Kick inválida'});
   const eventType=String(req.headers['kick-event-type']||'');
   let body={};try{body=JSON.parse(raw||'{}')}catch{}
   kickEventHealth.lastWebhookAt=Date.now();noteBridgeSignal('kick',eventType,{official:true});pushEventHealth();
   const person=(x={})=>({name:String(x?.username||x?.name||'Usuario'),avatar:String(x?.profile_picture||x?.profilePicture||'')});
   if(eventType==='chat.message.sent'){
     try{await fetch('http://127.0.0.1:8788/api/internal/kick-chat',{method:'POST',headers:{'content-type':'application/json','x-grena-internal':BRIDGE_TOKEN},body:JSON.stringify(body)})}catch(e){console.warn('[KICK CHAT BRIDGE]',e?.message||e)}
   }else if(eventType==='channel.followed'){const u=person(body.follower);alert('Kick','follow',u.name,'te siguió',{avatar:u.avatar,kickEvent:eventType});
   }else if(eventType==='channel.subscription.new'){const u=person(body.subscriber);alert('Kick','sub',u.name,`se suscribió${Number(body.duration)>0?' · '+Number(body.duration)+' mes(es)':''}`,{avatar:u.avatar,months:Number(body.duration||1),kickEvent:eventType});
   }else if(eventType==='channel.subscription.renewal'){const u=person(body.subscriber);alert('Kick','sub',u.name,`renovó su suscripción${Number(body.duration)>0?' · '+Number(body.duration)+' mes(es)':''}`,{avatar:u.avatar,months:Number(body.duration||1),kickEvent:eventType});
   }else if(eventType==='channel.subscription.gifts'){const u=person(body.gifter||{}),count=Math.max(1,Array.isArray(body.giftees)?body.giftees.length:Number(body.count||1)||1);alert('Kick','gift',body.gifter?.is_anonymous?'Anónimo':u.name,'',{avatar:u.avatar,giftName:'Suscripciones regaladas',giftKind:'subscription',count,kickEvent:eventType});
   }else if(eventType==='kicks.gifted'){const u=person(body.sender||{}),gift=body.gift||{},amount=Math.max(0,Number(gift.amount||0)||0),giftName=String(gift.name||'KICKs'),giftImage=extractFirstMediaUrl(gift),giftAnimatedImage=extractAnimatedMediaUrl(gift);alert('Kick','gift',u.name,'',{avatar:u.avatar,giftName,giftKind:'kicks',amount,giftImage,giftAnimatedImage,kickGiftType:String(gift.type||''),kickGiftTier:String(gift.tier||''),giftMessage:String(gift.message||''),pinnedSeconds:Number(gift.pinned_time_seconds||0),kickEvent:eventType});
   }else if(eventType==='livestream.status.updated'){const live=!!body.is_live,slug=String(body?.broadcaster?.channel_slug||body?.broadcaster?.username||currentKickSlug()||'Kick');setStatus('kick',true,live?`${slug} · cuenta vinculada · LIVE activo`:`${slug} · cuenta vinculada · offline`,slug);if(!live)setViewers('kick',0,'Kick livestream.status.updated · offline');
   }
   return json(res,200,{ok:true,event:eventType});
 }
 if(pathname==='/api/kick/config'&&req.method==='GET')return json(res,200,{ok:true,slug:currentKickSlug()});
 if(pathname==='/api/kick/config'&&req.method==='POST'){let body='';body=await readBody(req);try{const d=JSON.parse(body||'{}');oauthConfig.kick={...(oauthConfig.kick||{}),clientId:String(d.clientId??oauthConfig.kick?.clientId??'').trim(),clientSecret:String(d.clientSecret??oauthConfig.kick?.clientSecret??'').trim()};const slug=normalizeKickSlug(d.slug??currentKickSlug());if(slug){autoPrefs.counterKick=`https://kick.com/${slug}`;autoPrefs.counterKickEnabled=true;await persistAutoPrefs()}await persistOAuthConfig();kickAppToken='';kickTokenExpiresAt=0;if(slug)startKickPolling();return json(res,200,{ok:true,slug})}catch(e){return json(res,400,{error:e.message||'Configuración Kick inválida'})}}
 if(pathname==='/api/tiktok/live-link'&&req.method==='POST'){
  let b='';b=await readBody(req);
  try{
   const body=JSON.parse(b||'{}'),target=await resolveTikTokLiveTarget(body.url||body.value||'');
   if(tiktok){const old=tiktok;tiktok=null;try{old.disconnect()}catch{}}
   clearTikTokBridgeDisconnectGrace();
   savedAuth.tiktok={mode:'live-link',username:target.username,liveUrl:target.url,obtained_at:Date.now()};
   await persistAuth();
   autoPrefs.enabled=true;autoPrefs.counterTikTok=target.url;autoPrefs.counterTikTokEnabled=true;
   await persistAutoPrefs();
   await disconnectChatPlatform('tiktok');
   setStatus('tiktok',false,`@${target.username} · conectando por link del LIVE…`,target.username);
   await syncCreatorAccount('tiktok',target.username);
   connectCounterTikTok(target.url).catch(e=>console.warn('Contador TikTok por link:',e?.message||e));
   return json(res,200,{ok:true,username:target.username,url:target.url,message:`TikTok vinculado al LIVE de @${target.username}.`});
  }catch(e){return json(res,400,{ok:false,error:e?.message||String(e)})}
 }
 if(pathname==='/api/easy-connect'&&req.method==='POST'){let b='';b=await readBody(req);try{const body=JSON.parse(b||'{}'),p=String(body.platform||'').toLowerCase(),raw=String(body.value||'').trim();if(!['tiktok','twitch','kick'].includes(p)||!raw)return json(res,400,{ok:false,error:'Falta plataforma o usuario'});let value=raw;if(p==='tiktok'){const u=parseTikTokUser(raw);value=`https://www.tiktok.com/@${u}/live`;autoPrefs.counterTikTok=value;autoPrefs.counterTikTokEnabled=true;await persistAutoPrefs();connectCounterTikTok(value).catch(()=>{})}if(p==='twitch'){const u=parseTwitchLogin(raw);value=`https://www.twitch.tv/${u}`;autoPrefs.counterTwitch=value;autoPrefs.counterTwitchEnabled=true;await persistAutoPrefs();connectCounterTwitch(value).catch(()=>{})}if(p==='kick'){const u=raw.replace(/^https?:\/\/(www\.)?kick\.com\//i,'').split(/[/?#]/)[0].replace(/^@/,'');value=`https://kick.com/${u}`;autoPrefs.counterKick=value;autoPrefs.counterKickEnabled=true;await persistAutoPrefs();startKickPolling()}const r=await fetch('http://127.0.0.1:8788/api/connection-prefs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({autoConnect:true,[p+'Url']:value,[p+'Enabled']:true})});if(!r.ok)throw Error('GREÑA Chat no respondió');return json(res,200,{ok:true,platform:p,value,message:'Guardado. GREÑA conectará esta cuenta automáticamente.'})}catch(e){return json(res,400,{ok:false,error:e?.message||String(e)})}}
 if(pathname==='/api/moderation/action'&&req.method==='POST'){
  let raw='';raw=await readBody(req);try{const body=JSON.parse(raw||'{}');const out=await moderationAction(body);return json(res,200,out)}catch(e){const msg=e?.message||String(e);const reconnect=/scope|permission|401|403|unauthor|forbidden/i.test(msg);return json(res,400,{ok:false,error:msg,reconnect})}
 }
 if(pathname==='/api/gift-catalog'&&req.method==='GET'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});
  const force=url.searchParams.get('refresh')==='1';
  if(force||!sourceIsFresh('tiktok')){try{await refreshTikTokGiftCatalog(force)}catch(e){giftCatalogCache.sources.tiktok={...(giftCatalogCache.sources.tiktok||{}),source:TIKTOK_GIFT_SOURCE_URL,error:e?.message||String(e),lastErrorAt:Date.now()}}}
  if(twitchCfg?.token&&(force||!sourceIsFresh('twitch'))){try{await refreshTwitchGiftCatalog(force)}catch(e){giftCatalogCache.sources.twitch={...(giftCatalogCache.sources.twitch||{}),source:'Twitch Helix',error:e?.message||String(e),lastErrorAt:Date.now()}}}
  ensureBuiltInGiftCatalog();const data=publicGiftCatalog({platform:url.searchParams.get('platform')||'',q:url.searchParams.get('q')||'',animatedOnly:url.searchParams.get('animated')==='1'});return json(res,200,{ok:true,...data});
 }
 if(pathname==='/api/gift-catalog/refresh'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});const results={};
  try{results.tiktok=await refreshTikTokGiftCatalog(true)}catch(e){results.tiktok={ok:false,error:e?.message||String(e)}}
  try{results.twitch=await refreshTwitchGiftCatalog(true)}catch(e){results.twitch={ok:false,error:e?.message||String(e)}}
  ensureBuiltInGiftCatalog();return json(res,200,{ok:true,results,...publicGiftCatalog()});
 }
 if(pathname==='/api/radar/config'&&req.method==='GET'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});
  return json(res,200,{ok:true,...radarConfigPublic()});
 }
 if(pathname==='/api/radar/config'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});
  return json(res,409,{ok:false,error:'GREÑA Radar usa las cuentas vinculadas en la aplicación y no acepta credenciales propias.'});
 }
 if(pathname==='/api/radar/analyze'&&req.method==='POST'){
  const su=sessionUser(req);if(!su)return json(res,401,{ok:false,error:'Inicia sesión en GREÑA.'});
  let b='';b=await readBody(req);const body=JSON.parse(b||'{}');
  return json(res,200,await radarAnalyze(body));
 }
 if(pathname==='/api/status')return json(res,200,{ok:true,profile:publicUser(usersStore.users.find(u=>u.id===activeUserId)),status:publicStatus(),bridgeRuntime,eventHealth:eventHealthSnapshot(),authService:{configured:authService.configured,reachable:authService.reachable,url:AUTH_SERVICE_URL?AUTH_SERVICE_URL.replace(/\/\/[^/]+/,'//'+new URL(AUTH_SERVICE_URL).host):'',providers:authService.providers,lastError:authService.lastError},oauthConfigured:{tiktok:configured('tiktok'),twitch:configured('twitch'),kick:configured('kick')}});
 if(pathname==='/api/event-health'&&req.method==='GET')return json(res,200,{ok:true,eventHealth:eventHealthSnapshot()});
 if(pathname==='/api/auth-service/refresh'&&req.method==='POST'){await loadAuthServiceConfig();return json(res,200,{ok:true,authService});}
 if(pathname==='/api/activity'){const limit=Math.max(1,Math.min(120,Number(url.searchParams.get('limit')||40)||40));return json(res,200,{ok:true,activity:activityHistory.slice(0,limit)});}
 if(pathname.startsWith('/api/oauth-config/')&&req.method==='GET'){const p=pathname.split('/').pop();if(!['twitch'].includes(p))return json(res,400,{ok:false,error:'Plataforma no válida'});return json(res,200,{ok:true,clientId:oauthConfig[p]?.clientId||'',hasClientSecret:!!oauthConfig[p]?.clientSecret});}
 if(pathname==='/api/oauth-config'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}');const p=body.platform;if(!['twitch'].includes(p))return json(res,400,{ok:false,error:'Plataforma no válida'});const clientId=String(body.clientId||'').trim();if(!clientId)return json(res,400,{ok:false,error:'Falta el Client ID'});const clientSecret=String(body.clientSecret||'').trim();oauthConfig[p]={...oauthConfig[p],clientId,...(clientSecret?{clientSecret}: {})};await persistOAuthConfig();return json(res,200,{ok:true,configured:configured(p)});}
 if(pathname==='/api/alert-style'&&req.method==='GET')return json(res,200,{ok:true,style:['classic','option-a'].includes(autoPrefs.alertStyle)?autoPrefs.alertStyle:'classic'});
 if(pathname==='/api/alert-style'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}');const style=String(body.style||'classic');if(!['classic','option-a'].includes(style))return json(res,400,{ok:false,error:'Estilo de alerta no válido.'});autoPrefs.alertStyle=style;await persistAutoPrefs();broadcast({type:'alert-style',style});return json(res,200,{ok:true,style})}
 if(pathname==='/api/designs'&&req.method==='GET')return json(res,200,{ok:true,designs:savedAlertDesigns});
 if(pathname==='/api/design'&&req.method==='POST'){let b='';b=await readBody(req);const d=JSON.parse(b||'{}');const ev=String(d.event||'follow');savedAlertDesigns[ev]={...d,soundProfileVersion:SOUND_PROFILE_VERSION};await safeWriteJson(stateFile('alert-designs.json',LEGACY_ALERTS_FILE),savedAlertDesigns);return json(res,200,{ok:true,event:ev})}
 if(pathname==='/api/alert'&&req.method==='POST'){let b='';b=await readBody(req);const a=JSON.parse(b||'{}');if(a.platform&&a.event&&['follow','sub','gift','cheer','share','raid','like'].includes(String(a.event))){alert(String(a.platform),String(a.event),a.name,a.action||'',a)}else{broadcast({type:'alert',alert:{...a,receivedAt:Date.now()}})}return json(res,200,{ok:true})}
 if(pathname==='/api/tiktok/browser-login'&&req.method==='POST'){json(res,202,{ok:true,message:'Abriendo TikTok…'});beginTikTokBrowserLogin().catch(e=>{console.error('TikTok Browser Login:',e);if(tiktokLoginContext){tiktokLoginContext.close().catch(()=>{});tiktokLoginContext=null}setStatus('tiktok',false,'Error de login: '+(e?.message||e))});return}
 const m=pathname.match(/^\/oauth\/(tiktok|twitch|kick)\/(start|callback)$/);if(m){if(m[2]==='start')return await beginOAuth(m[1],req,res);return await finishOAuth(m[1],url,res)}
 if(pathname==='/api/twitch/device/status'&&req.method==='GET'){
  const id=String(url.searchParams.get('id')||''),session=twitchDeviceSessions.get(id);if(!session)return json(res,404,{ok:false,error:'Esta autorización de Twitch ya no existe o venció.'});
  return json(res,200,{ok:true,status:session.status,message:session.message||'',account:session.account||'',expiresAt:session.expiresAt});
 }
 if(pathname==='/auth/twitch/callback')return twitchImplicitCallback(res);
 if(pathname==='/api/twitch/token'&&req.method==='POST'){let b='';b=await readBody(req);const body=JSON.parse(b||'{}'),st=oauthState.get(body.state);oauthState.delete(body.state);if(!st||st.platform!=='twitch'||Date.now()-st.created>10*60e3)throw Error('La autorización de Twitch expiró. Pulsa Iniciar sesión de nuevo.');if(st.userId&&st.userId!==activeUserId)await activateProfile(st.userId);if(!body.token)throw Error('Twitch no devolvió un token.');savedAuth.twitch={access_token:body.token,mode:'implicit'};await persistAuth();await startTwitch(body.token);return json(res,200,{ok:true,message:`Twitch conectado como ${twitchCfg?.login||'tu cuenta'}.`})}
 if(pathname.startsWith('/api/disconnect/')&&req.method==='POST'){
  const p=pathname.split('/').pop();delete savedAuth[p];await persistAuth();
  if(['tiktok','twitch','kick'].includes(p))await disconnectChatPlatform(p);
  if(p==='tiktok'){clearTikTokBridgeDisconnectGrace();autoPrefs.counterTikTokEnabled=false;autoPrefs.counterTikTok='';await persistAutoPrefs();const oldCounter=counterTikTok;counterTikTok=null;clearTikTokCounterTimers();counterTikTokUser='';counterTikTokLastSignalAt=0;counterTikTokPollFailures=0;if(oldCounter)try{oldCounter.disconnect()}catch{};setViewers('tiktok',0,'desconectado TikTok manual');if(tiktok){try{tiktok.disconnect()}catch{}tiktok=null}if(tiktokLoginContext){try{await tiktokLoginContext.close()}catch{}tiktokLoginContext=null}}
  if(p==='twitch'){setViewers('twitch',0);if(twitchViewerTimer)clearInterval(twitchViewerTimer);twitchViewerTimer=null;if(twitchValidationTimer)clearInterval(twitchValidationTimer);twitchValidationTimer=null;twitchCfg=null;twitchFollowerCache.clear();twitchEventHealth.ready=false;twitchEventHealth.active=[];twitchEventHealth.failed=[];twitchEventHealth.lastError='';if(twitchWS)try{twitchWS.close()}catch{};twitchWS=null}
  if(p==='kick'){if(kickViewerTimer)clearInterval(kickViewerTimer);kickViewerTimer=null;kickAppToken='';kickTokenExpiresAt=0;kickEventHealth.subscriptionsReady=false;kickEventHealth.active=[];kickEventHealth.failed=[];kickEventHealth.lastWebhookAt=0;kickEventHealth.lastError='';setViewers('kick',0,'desconectado contador Kick')}
  setStatus(p,false,'No conectado');pushEventHealth();return json(res,200,{ok:true,eventHealth:eventHealthSnapshot()});
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end('Método no permitido')}
 if((pathname==='/alerts.html'||pathname==='/widgets.html'||pathname==='/gift-catalog.html'||pathname==='/radar.html'||pathname==='/cam-room.html')&&url.searchParams.get('embed')!=='1'){
   const target=pathname==='/alerts.html'?'alerts':pathname==='/widgets.html'?'widgets':pathname==='/radar.html'?'radar':pathname==='/cam-room.html'?'cam':'catalog';
   res.writeHead(302,{location:`/#${target}`,'cache-control':'no-store'});
   return res.end();
 }
 // Páginas del panel que requieren sesión.
 // IMPORTANTE: viewers.html es un widget OBS y debe ser público; OBS no comparte la cookie de sesión del navegador.
 const interactive=new Set(['/','/index.html','/preview.html','/alerts.html','/widgets.html','/gift-catalog.html','/radar.html','/cam-room.html']);
 if(interactive.has(pathname)){const su=sessionUser(req);if(!su){res.writeHead(302,{location:'/login.html','cache-control':'no-store'});return res.end()}if(!su.email){res.writeHead(302,{location:'/login.html#recovery-email','cache-control':'no-store'});return res.end()}}
 const file=resolveStaticFile(pathname);if(!file){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('No encontrado')}const abs=join(ROOT,file);if(!abs.startsWith(ROOT)){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('No encontrado')}const data=await readFile(abs);res.writeHead(200,{'content-type':mime[extname(file).toLowerCase()]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:data)
 }catch(e){console.error(pathname,e);if(pathname.startsWith('/oauth/'))return callbackPage(res,false,e?.message||String(e));if(pathname.startsWith('/api/'))return json(res,e?.statusCode||400,{ok:false,error:e?.message||String(e)});res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('No encontrado')}});
// Gateway público mínimo de Cam Room. Cloudflare apunta aquí, nunca al panel 8787.
const CAM_GATEWAY_FILES=new Set(['/cam-join.html','/cam-join.js','/cam-room.css','/cam-webrtc.js','/cam-source.html','/cam-source.js']);
const camGatewayServer=http.createServer(async(req,res)=>{
 let url,pathname='/';
 try{if(!safeReqPath(req.url))throw 0;url=new URL(req.url,'http://127.0.0.1');pathname=url.pathname}catch{res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});return res.end('Solicitud no válida')}
 const headers={'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(self), microphone=(self)'};
 try{
  if(pathname==='/health')return json(res,200,{ok:true,app:'GREÑA Cam Gateway',port:CAM_GATEWAY_PORT});
  if(pathname==='/api/cam-room/invite'&&req.method==='GET'){
   const room=camRoomByInvite(url.searchParams.get('token'));if(!room)return json(res,404,{ok:false,error:'Invitación inválida o vencida.'});
   for(const [k,v] of Object.entries(headers))res.setHeader(k,v);return json(res,200,{ok:true,room:{id:room.id,code:room.code,hostName:room.ownerName,createdAt:room.createdAt},secureContextRequired:true});
  }
  if((req.method==='GET'||req.method==='HEAD')&&CAM_GATEWAY_FILES.has(pathname)){
   const file=pathname.slice(1),data=await readFile(join(APP_ROOT,file));res.writeHead(200,{'content-type':mime[extname(file).toLowerCase()]||'application/octet-stream',...headers});return res.end(req.method==='HEAD'?undefined:data);
  }
  res.writeHead(404,{'content-type':'text/plain; charset=utf-8',...headers});res.end('GREÑA Cam Room · recurso no disponible');
 }catch(e){res.writeHead(500,{'content-type':'text/plain; charset=utf-8',...headers});res.end('Error de Cam Room')}
});
const camGatewayWss=new WebSocketServer({server:camGatewayServer,maxPayload:64*1024});
camGatewayWss.on('connection',(ws,req)=>{
 ws.on('message',data=>camWsMessage(ws,req,data));
 ws.on('close',()=>camDropSocket(ws));ws.on('error',()=>camDropSocket(ws));
});
camGatewayServer.on('error',e=>{camGatewayReady=false;camGatewayLastError=`Gateway Cam Room ${CAM_GATEWAY_PORT}: ${e?.message||e}`;console.error(camGatewayLastError)});
camGatewayServer.on('close',()=>{camGatewayReady=false});
camGatewayServer.listen(CAM_GATEWAY_PORT,CAM_GATEWAY_HOST,()=>{camGatewayReady=true;camGatewayLastError='';console.log(`GREÑA Cam Gateway listo: http://${CAM_GATEWAY_HOST}:${CAM_GATEWAY_PORT}`)});

const wss=new WebSocketServer({noServer:true,maxPayload:256*1024});wss.on('connection',(ws,req)=>{
 clients.add(ws);{const v=currentViewers();camSend(ws,{type:'hello',app:'GREÑA LIVE PRO',status:publicStatus(),viewers:v,total:v.tiktok+v.twitch+v.kick,testMode:viewerTest.enabled,bridgeRuntime,eventHealth:eventHealthSnapshot(),loyalty:publicLoyaltyState(10),taptap:publicTapTapState(),counterSettings:publicCounterSettings(),socialSettings})}
 ws.on('message',data=>camWsMessage(ws,req,data));
 ws.on('close',()=>{camDropSocket(ws);clients.delete(ws)});ws.on('error',()=>{camDropSocket(ws);clients.delete(ws)});
});

const chatProxyWss=new WebSocketServer({noServer:true,maxPayload:256*1024});
chatProxyWss.on('connection',(client)=>{
  const upstream=new WebSocket('ws://127.0.0.1:8788/ws',{headers:{Origin:`http://127.0.0.1:${PORT}`,Host:'127.0.0.1:8788'}});
  const pending=[];
  client.on('message',(data,isBinary)=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:isBinary});else if(upstream.readyState===WebSocket.CONNECTING&&pending.length<100)pending.push([data,isBinary])});
  upstream.on('open',()=>{for(const [data,isBinary] of pending.splice(0))if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:isBinary})});
  upstream.on('message',(data,isBinary)=>{if(client.readyState===WebSocket.OPEN)client.send(data,{binary:isBinary})});
  const closeBoth=()=>{try{if(client.readyState===WebSocket.OPEN||client.readyState===WebSocket.CONNECTING)client.close()}catch{};try{if(upstream.readyState===WebSocket.OPEN||upstream.readyState===WebSocket.CONNECTING)upstream.close()}catch{}};
  client.on('close',closeBoth);client.on('error',closeBoth);upstream.on('close',closeBoth);upstream.on('error',closeBoth);
});
server.on('upgrade',(req,socket,head)=>{
  let pathname='/';try{pathname=new URL(req.url||'/','http://127.0.0.1').pathname}catch{return socket.destroy()}
  if(!panelHostOk(req)||!localOriginOk(req.headers.origin,req))return socket.destroy();
  if(pathname==='/chat-ws')return chatProxyWss.handleUpgrade(req,socket,head,ws=>chatProxyWss.emit('connection',ws,req));
  if(pathname!=='/')return socket.destroy();
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
let autoTikTokBusy=false;
async function ensureTikTokLiveAuto(){if(!autoPrefs.enabled||savedAuth.tiktok?.mode==='live-link'||bridgeRuntime.tiktok||!savedAuth.tiktok?.username||autoTikTokBusy||tiktok?.roomId)return;autoTikTokBusy=true;try{await connectTikTokLive(savedAuth.tiktok.username)}catch{}finally{autoTikTokBusy=false}}
async function ensureCountersAuto(){if(!autoPrefs.enabled)return;try{if(autoPrefs.counterTikTokEnabled&&autoPrefs.counterTikTok&&!counterTikTok)await connectCounterTikTok(autoPrefs.counterTikTok)}catch{}try{if(autoPrefs.counterTwitchEnabled&&autoPrefs.counterTwitch&&!counterTwitchLogin)await connectCounterTwitch(autoPrefs.counterTwitch)}catch{}try{if(autoPrefs.counterKickEnabled&&autoPrefs.counterKick&&!kickViewerTimer)startKickPolling()}catch{}}
server.listen(PORT,HOST,async()=>{
 console.log(`GREÑA LIVE PRO WEB FIX14 completo listo: ${BASE}`);
 purgeSessionsAndPersist();setInterval(purgeSessionsAndPersist,6*60*60*1000).unref();
 refreshTikTokGiftCatalog(false).catch(e=>console.warn('Catálogo TikTok:',e?.message||e));
 await loadAuthServiceConfig();
 console.log('GREÑA Auth:',AUTH_SERVICE_URL?(authService.reachable?'conectado':'no disponible'):'sin configurar');
 console.log('Login OAuth:',Object.fromEntries(['tiktok','twitch','kick'].map(p=>[p,configured(p)?'configurado':'pendiente'])));
 await syncAllCreatorAccounts();
 try{await restoreTwitchSession()}catch(e){console.warn('Twitch auto-login:',e?.message||e)}
 try{if(currentKickSlug()&&(savedAuth.kick?.access_token||isBrokerProvider('kick')||oauthConfig.kick?.clientId&&oauthConfig.kick?.clientSecret))startKickPolling();if(savedAuth.kick?.access_token)ensureKickEventSubscriptions().catch(()=>{})}catch(e){console.warn('Kick auto-login:',e?.message||e)}
 await ensureTikTokLiveAuto();
 await ensureCountersAuto();
 pushEventHealth();
 setInterval(()=>{ensureTikTokLiveAuto();ensureCountersAuto()},30000);
});
