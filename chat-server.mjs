import http from 'node:http';
import { readFile, writeFile, mkdir, copyFile, unlink, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { URL } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

import {
  TikTokLiveConnection,
  WebcastEvent,
  ControlEvent,
  RoomIdRouteConfig,
  IsLiveRouteConfig
} from 'tiktok-live-connector';

import tmi from 'tmi.js';
import { chromium } from 'playwright-core';

// GREÑA 3.1.7: no usar los fallbacks premium de EulerStream para Room ID / estado LIVE.
RoomIdRouteConfig.skipFetchRoomIdFromEulerRoute = true;
IsLiveRouteConfig.skipFetchRoomIdFromEulerRoute = true;

const HOST = '127.0.0.1';
const PORT = 8788;
const MAIN_PORT = Number(process.env.PORT||8787);
const MAIN_ORIGIN = `http://127.0.0.1:${MAIN_PORT}`;

async function safeWriteJson(file,data){
  const text=JSON.stringify(data,null,2);
  JSON.parse(text);
  const tmp=file instanceof URL ? new URL(`${file.href}.${process.pid}.${Date.now()}.tmp`) : `${file}.${process.pid}.${Date.now()}.tmp`;
  const bak=file instanceof URL ? new URL(`${file.href}.bak`) : `${file}.bak`;
  await writeFile(tmp,text,'utf8');
  try{await copyFile(file,bak)}catch{}
  try{await copyFile(tmp,file)}finally{await unlink(tmp).catch(()=>{})}
}

const clients = new Set();
// GREÑA LIVE 3.0: el motor de chat usa los archivos del perfil activo para evitar
// que dos creadores compartan URLs, filtros o widgets al iniciar sesión en el mismo equipo.
const DATA_DIR = process.env.GRENA_DATA_DIR || join(process.env.APPDATA || join(homedir(),'AppData','Roaming'),'GREÑA LIVE PRO');
await mkdir(DATA_DIR,{recursive:true}).catch(()=>{});
const CHAT_LOG_DIR=join(DATA_DIR,'logs');await mkdir(CHAT_LOG_DIR,{recursive:true}).catch(()=>{});const CHAT_ERROR_LOG=join(CHAT_LOG_DIR,'chat-errors.log');
const PROFILES_DIR=join(DATA_DIR,'profiles');
const ACTIVE_PROFILE_FILE=join(DATA_DIR,'active-profile.json');
const LEGACY_CONNECTIONS_FILE=join(DATA_DIR,'grena-chat-connections.json');
const LEGACY_MULTICHAT_SETTINGS_FILE=new URL('./multichat-settings.json', import.meta.url);
await mkdir(PROFILES_DIR,{recursive:true}).catch(()=>{});
async function readJson(file,fallback={}){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
let activeProfileId=String((await readJson(ACTIVE_PROFILE_FILE,{})).userId||'');
let CONNECTIONS_FILE=activeProfileId?join(PROFILES_DIR,activeProfileId,'chat-connections.json'):LEGACY_CONNECTIONS_FILE;
let MULTICHAT_SETTINGS_FILE=activeProfileId?join(PROFILES_DIR,activeProfileId,'chat-settings.json'):LEGACY_MULTICHAT_SETTINGS_FILE;
const connectionDefaults={autoConnect:true,tiktokUrl:'',twitchUrl:'',kickUrl:'',tiktokEnabled:false,twitchEnabled:false,kickEnabled:false};
let connectionPrefs={...connectionDefaults,...await readJson(CONNECTIONS_FILE,{})};
async function saveConnectionPrefs(){await safeWriteJson(CONNECTIONS_FILE,connectionPrefs).catch(()=>{})}

// ===== GREÑA FIX3: robustez y endurecimiento =====
function logChatFault(kind,e){const line=`[${new Date().toISOString()}] ${kind}: ${e?.stack||e?.message||String(e)}\n`;console.error(line.trim());appendFile(CHAT_ERROR_LOG,line,'utf8').catch(()=>{})}
process.on('unhandledRejection',e=>logChatFault('unhandledRejection',e));
process.on('uncaughtException',e=>logChatFault('uncaughtException',e));
const BRIDGE_TOKEN=process.env.GRENA_BRIDGE_TOKEN||randomBytes(24).toString('hex');
if(!process.env.GRENA_BRIDGE_TOKEN)console.warn('[GREÑA] GRENA_BRIDGE_TOKEN no definido: arranca con INICIAR_GRENA.vbs (launcher) o con server.mjs para que el puente con el servidor principal funcione.');
const FISH_AUDIO_API_KEY = process.env.GRENA_FISH_API_KEY || '';
const FISH_AUDIO_MODEL = 's2.1-pro-free';
const ALLOWED_ORIGINS=new Set([MAIN_ORIGIN,`http://localhost:${MAIN_PORT}`,'http://127.0.0.1:8788','http://localhost:8788']);
const ALLOWED_HOSTS=new Set(['127.0.0.1:8788','localhost:8788']);
function hostAllowed(h){return ALLOWED_HOSTS.has(String(h||'').toLowerCase())}
function originAllowed(o){return !o||ALLOWED_ORIGINS.has(o)}
function applyCors(request,response){const o=request.headers.origin;if(o&&ALLOWED_ORIGINS.has(o)){response.setHeader('Access-Control-Allow-Origin',o);response.setHeader('Vary','Origin')}}
const MAX_BODY_BYTES=1024*1024;
function readBody(req,limit=MAX_BODY_BYTES){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,over=false;
    req.on('data',c=>{if(over)return;size+=c.length;if(size>limit){over=true;chunks.length=0;return}chunks.push(c)});
    req.on('end',()=>{if(over){const e=new Error('El cuerpo de la petición es demasiado grande.');e.statusCode=413;reject(e)}else resolve(Buffer.concat(chunks).toString('utf8'))});
    req.on('error',reject);
    req.on('close',()=>{if(!req.complete)reject(new Error('Petición cancelada'))});
  });
}
// Ajustes de multichat: solo claves conocidas, tipos y rangos válidos (se escriben en disco y se difunden a OBS).
const MC_RANGES={fontSize:[8,96],nameSize:[8,64],bubbleWidth:[10,100],bubbleScale:[30,200],padY:[0,60],padX:[0,80],avatarSize:[12,120],gap:[0,80],radius:[0,80],opacity:[0,100],maxMessages:[1,30],duration:[1,120],fadeAfter:[0,120]};
function sanitizeMultichatSettings(input,defaults){
  const src=(input&&typeof input==='object'&&!Array.isArray(input))?input:{};
  const out={};
  for(const [k,def] of Object.entries(defaults)){
    const v=src[k];
    if(typeof def==='number'){const n=Number(v);const [lo,hi]=MC_RANGES[k]||[0,1000];out[k]=Number.isFinite(n)?Math.min(hi,Math.max(lo,n)):def}
    else if(typeof def==='boolean'){out[k]=typeof v==='boolean'?v:def}
    else if(k==='direction'){out[k]=v==='right'?'right':'left'}
    else if(k==='theme'){out[k]=(typeof v==='string'&&/^[a-z0-9_-]{1,24}$/i.test(v))?v:def}
    else{out[k]=typeof v==='string'?v.slice(0,64):def}
  }
  return out;
}
// Proxy de avatar: solo http(s) público, sin redes privadas/loopback, solo imágenes y con tope de tamaño.
function isPrivateIp(ip){
  if(net.isIPv4(ip)){const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||a>=224}
  if(net.isIPv6(ip)){const x=ip.toLowerCase();if(x==='::'||x==='::1')return true;if(x.startsWith('::ffff:'))return isPrivateIp(x.slice(7));return /^f[cd]/.test(x)||/^fe[89ab]/.test(x)}
  return true;
}
async function hostIsPublic(hostname){
  const h=String(hostname||'').replace(/^\[|\]$/g,'').toLowerCase();
  if(!h||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal'))return false;
  if(net.isIP(h))return !isPrivateIp(h);
  try{const list=await dns.lookup(h,{all:true});return list.length>0&&list.every(a=>!isPrivateIp(a.address))}catch{return false}
}

const multichatDefaults = {direction:'left',fontSize:16,nameSize:14,bubbleWidth:94,bubbleScale:100,padY:8,padX:13,avatarSize:36,gap:8,radius:17,opacity:78,maxMessages:6,duration:14,showAvatar:true,showPlatform:true,theme:'neon',showHandle:false,fadeAfter:5};
let multichatSettings = sanitizeMultichatSettings(await readJson(MULTICHAT_SETTINGS_FILE,{}),multichatDefaults);
async function loadChatProfile(userId=''){
  activeProfileId=String(userId||'');
  if(activeProfileId)await mkdir(join(PROFILES_DIR,activeProfileId),{recursive:true}).catch(()=>{});
  CONNECTIONS_FILE=activeProfileId?join(PROFILES_DIR,activeProfileId,'chat-connections.json'):LEGACY_CONNECTIONS_FILE;
  MULTICHAT_SETTINGS_FILE=activeProfileId?join(PROFILES_DIR,activeProfileId,'chat-settings.json'):LEGACY_MULTICHAT_SETTINGS_FILE;
  connectionPrefs={...connectionDefaults,...await readJson(CONNECTIONS_FILE,{})};
  multichatSettings=sanitizeMultichatSettings(await readJson(MULTICHAT_SETTINGS_FILE,{}),multichatDefaults);
}


// =====================================
// CONEXIONES INDEPENDIENTES
// =====================================

let tiktokConn = null;
let tiktokViewerPollTimer = null;
let tiktokViewerLastSignalAt = 0;
let tiktokViewerLastPositiveAt = 0;
let twitchClient = null;
let kickConnected = false;
let kickBrowser = null;
let kickPage = null;
let kickSocket = null;
let kickReconnectTimer = null;
let kickChatroomId = 0;
let kickSeenMessages = new Map();
let kickPagePollTimer = null;
let kickRealtimeFrames = 0;

let currentTikTokUser = '';
let currentTwitchChannel = '';
let currentKickChannel = '';

// =====================================
// INFORMACIÓN DE USUARIOS
// =====================================

const tiktokUsers = new Map();
const twitchUsers = new Map();
const kickUsers = new Map();
const localMutedUsers={tiktok:new Set(),twitch:new Set(),kick:new Set()};
function moderationKey(v=''){return String(v||'').trim().replace(/^@/,'').toLowerCase()}
function isLocallyMuted(platform,user){return !!localMutedUsers[String(platform||'').toLowerCase()]?.has(moderationKey(user))}

// =====================================
// ENVÍO DE DATOS AL NAVEGADOR
// =====================================

const send = (ws, data) => {
  try {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  } catch {}
};

const recentChatHistory = [];
const CHAT_HISTORY_LIMIT = 30;
let voiceControlState = null; // null = usa la preferencia local del navegador; boolean = orden del Preview LIVE

const broadcast = data => {
  // Conservamos los mensajes recientes para que un overlay que se abra o recargue
  // no quede vacío hasta que llegue el siguiente mensaje. Esto es especialmente
  // útil para OBS, que puede recargar la Fuente de navegador en cualquier momento.
  if (data?.type === 'chat' && ['tiktok','twitch','kick'].includes(String(data?.platform||'').toLowerCase())) {
    const item = {...data, _historyId: data._historyId || `${Date.now()}-${Math.random().toString(36).slice(2,9)}`};
    recentChatHistory.push(item);
    if (recentChatHistory.length > CHAT_HISTORY_LIMIT) recentChatHistory.splice(0, recentChatHistory.length - CHAT_HISTORY_LIMIT);
    data = item;
  }
  clients.forEach(ws => send(ws, data));
};

const broadcastPlatform = (platform, data) => {
  if(data?.type==='chat'&&isLocallyMuted(platform,data?.user||data?.nickname))return;
  const payload={...data,platform};
  broadcast(payload);
  // Fidelidad usa exactamente la misma fuente real de chat de TikTok/Twitch/Kick.
  if(data?.type==='chat')bridgeLoyalty(platform,'chat',data.user||data.nickname,{nickname:data.nickname||data.user,text:data.text||'',avatar:data.avatar||''});
};

// Puente interno: GREÑA Chat es la fuente de eventos LIVE de TikTok y de eventos IRC de Twitch.
// Así las alertas reales usan exactamente la misma conexión que ya funciona para el chat.
const bridgeQueue=[];let bridgeFlushing=false;const BRIDGE_QUEUE_MAX=200,BRIDGE_QUEUE_MAX_AGE=60*1000;
function bridgeMessageId(prefix='evt'){return `${prefix}-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`}
function queueBridge(path,payload){const now=Date.now();while(bridgeQueue.length&&(now-bridgeQueue[0].createdAt>BRIDGE_QUEUE_MAX_AGE))bridgeQueue.shift();if(bridgeQueue.length>=BRIDGE_QUEUE_MAX)bridgeQueue.shift();bridgeQueue.push({path,payload,createdAt:now})}
async function sendToAlerts(path,payload,{reliable=false,fromQueue=false}={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2500);
  try {
    const response=await fetch(`${MAIN_ORIGIN}${path}`, {method:'POST',headers:{'content-type':'application/json','x-grena-internal':BRIDGE_TOKEN},body:JSON.stringify(payload),signal:controller.signal});
    const text=await response.text().catch(()=> '');
    if(!response.ok){console.warn(`[GREÑA BRIDGE] ${path} HTTP ${response.status}${text?` · ${text.slice(0,240)}`:''}`);if(reliable&&!fromQueue&&(response.status>=500||response.status===0))queueBridge(path,payload);return {ok:false,status:response.status,error:text}}
    let data={};try{data=text?JSON.parse(text):{}}catch{}
    return {ok:true,status:response.status,data};
  } catch (e) {
    console.warn(`[GREÑA BRIDGE] ${path}`, e?.name==='AbortError'?'timeout':(e?.message || e));
    if(reliable&&!fromQueue)queueBridge(path,payload);
    return {ok:false,status:0,error:e?.message||String(e)};
  } finally {clearTimeout(timer)}
}
async function flushBridgeQueue(){if(bridgeFlushing||!bridgeQueue.length)return;bridgeFlushing=true;try{while(bridgeQueue.length){const item=bridgeQueue[0];if(Date.now()-item.createdAt>BRIDGE_QUEUE_MAX_AGE){bridgeQueue.shift();continue}const r=await sendToAlerts(item.path,item.payload,{fromQueue:true});if(!r.ok)break;bridgeQueue.shift()}}finally{bridgeFlushing=false}}
setInterval(()=>flushBridgeQueue().catch(()=>{}),1000).unref?.();
const twitchMetaCache=new Map();
async function twitchChatUserMeta(userId){
  const id=String(userId||'').trim();if(!id)return {avatar:'',isFollower:null};
  const hit=twitchMetaCache.get(id);if(hit&&Date.now()-hit.at<5*60e3)return hit.value;
  try{
    const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),1800);
    const r=await fetch(`${MAIN_ORIGIN}/api/internal/twitch-user-meta?user_id=${encodeURIComponent(id)}`,{headers:{'x-grena-internal':BRIDGE_TOKEN},signal:ac.signal,cache:'no-store'}).finally(()=>clearTimeout(timer));
    const d=await r.json().catch(()=>({}));const value={avatar:String(d.avatar||''),isFollower:typeof d.isFollower==='boolean'?d.isFollower:null};
    twitchMetaCache.set(id,{at:Date.now(),value});return value;
  }catch{return hit?.value||{avatar:'',isFollower:null}}
}

function ttWho(data={}) {
  const u=data.user||data.User||data.author||{};
  return firstString(u.nickname,u.displayName,u.uniqueId,data.nickname,data.uniqueId,'Usuario');
}
function ttAvatar(data={}) {
  const u=data.user||data.User||data.author||{};
  return findUrl(u.profilePictureUrl,u.avatarThumb,u.avatarMedium,u.avatarLarger,u.avatar,data.profilePictureUrl,data.avatar);
}
function ttUserId(data={}){
  const u=data.user||data.User||data.author||{};
  return firstString(u.uniqueId,u.unique_id,u.id,u.userId,data.uniqueId,data.unique_id,data.userId,data.user_id,ttWho(data));
}
function ttSocialLooksLikeFollow(data={}){
  const parts=[];
  const walk=(value,key='',depth=0)=>{
    if(depth>4||value==null)return;
    if(typeof value==='string'){if(/display|action|label|event|type|pattern|key|text|schema|describe/i.test(key))parts.push(value);return}
    if(Array.isArray(value)){for(const x of value.slice(0,20))walk(x,key,depth+1);return}
    if(typeof value==='object')for(const [k,v] of Object.entries(value))walk(v,k,depth+1);
  };
  walk(data);
  const text=parts.join(' ').toLowerCase();
  return /(^|[^a-z])(follow|followed|follows|following)([^a-z]|$)|ttlive[^ ]*follow|sigui[oó]|empez[oó] a seguir|nuevo seguidor/i.test(text);
}

function ttGiftImage(data={}, ext={}) {
  return firstString(
    findUrl(data?.giftPictureUrl),
    findUrl(data?.giftPicture),
    findUrl(data?.giftImage),
    findUrl(data?.giftIcon),
    findUrl(data?.giftDetails?.giftPictureUrl),
    findUrl(data?.giftDetails?.giftPicture),
    findUrl(data?.giftDetails?.giftImage),
    findUrl(data?.giftDetails?.image),
    findUrl(data?.giftDetails?.icon),
    findUrl(data?.gift?.image),
    findUrl(data?.gift?.icon),
    findUrl(data?.gift?.previewImage),
    findUrl(data?.gift?.giftLabelIcon),
    findUrl(ext?.image),
    findUrl(ext?.giftImage),
    findUrl(ext?.icon),
    findUrl(ext)
  );
}
function ttGiftData(data={}, connection=tiktokConn) {
  const giftId=String(data?.giftId||data?.giftDetails?.giftId||data?.gift?.id||data?.extendedGiftInfo?.id||'');
  const cached=Array.isArray(connection?.availableGifts)?connection.availableGifts.find(g=>String(g?.id??g?.giftId??'')===giftId):null;
  const ext=data?.extendedGiftInfo||cached||{};
  const giftName=firstString(data?.giftDetails?.giftName,data?.giftName,data?.gift?.name,data?.gift?.describe,ext?.giftName,ext?.name,ext?.displayName,'Regalo de TikTok');
  const count=Math.max(1,Number(data?.repeatCount||data?.repeat_count||1)||1);
  const unitDiamonds=Math.max(0,Number(data?.giftDetails?.diamondCount??data?.diamondCount??data?.gift?.diamondCount??ext?.diamondCount??ext?.diamond_count??ext?.cost??ext?.price??0)||0);
  return {giftId,giftName,count,unitDiamonds,totalDiamonds:unitDiamonds*count,giftImage:ttGiftImage(data,ext)};
}
function bridgeAlert(platform,event,name,action,extra={}) {
  const payload={platform,event,name:name||'Usuario',action,...extra};if(!payload.bridgeEventId)payload.bridgeEventId=bridgeMessageId(`${String(platform).toLowerCase()}-${event}`);sendToAlerts('/api/internal/event',payload,{reliable:true});
}
function bridgeViewers(platform,count,source='') {
  sendToAlerts('/api/internal/viewers',{platform,count:Number(count)||0,source});
}
function bridgeStatus(platform,connected,label,account='',extra={}) {
  sendToAlerts('/api/internal/status',{platform,connected,label,account,...extra});
}
function bridgeLoyalty(platform,kind,user,extra={}) {
  const payload={platform,kind,user:user||'Usuario',...extra,bridgeEventId:bridgeMessageId(`${String(platform).toLowerCase()}-${kind}`)};sendToAlerts('/api/internal/loyalty',payload,{reliable:true});
}

const getError = error => {
  return (
    error?.message ||
    String(error || 'Error desconocido')
  );
};

// =====================================
// PRIMER TEXTO VÁLIDO
// =====================================

function firstString(...values) {
  for (const value of values) {
    if (
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim();
    }

    if (
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return String(value);
    }
  }

  return '';
}

// =====================================
// BUSCAR URL DE AVATAR
// =====================================

function findUrl(value) {
  if (
    typeof value === 'string' &&
    /^https?:\/\//i.test(value)
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findUrl(item);

      if (result) {
        return result;
      }
    }
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    return firstString(
      findUrl(value.url),
      findUrl(value.uri),
      findUrl(value.urlList),
      findUrl(value.url_list)
    );
  }

  return '';
}

// =====================================
// DETERMINAR FOLLOWER DE TIKTOK
// =====================================

function getTikTokFollowerStatus(data, user) {
  const followRole = Number(
    data?.followRole ??
    user?.followRole ??
    data?.user?.followRole ??
    data?.followInfo?.followStatus ??
    user?.followInfo?.followStatus ??
    data?.user?.followInfo?.followStatus
  );

  if (Number.isFinite(followRole)) {
    return (
      followRole === 1 ||
      followRole === 2
    );
  }

  return false;
}

// =====================================
// EXTRAER DATOS DE TIKTOK
// =====================================

function extractTikTokChat(data) {
  const user =
    data?.user ||
    data?.User ||
    data?.author ||
    data?.authorInfo ||
    data?.userInfo ||
    {};

  const username = firstString(
    user.uniqueId,
    user.unique_id,
    user.username,
    user.userName,
    user.handle,

    data?.uniqueId,
    data?.unique_id,
    data?.username,
    data?.userName,
    data?.handle
  );

  const nickname = firstString(
    user.nickname,
    user.nickName,
    user.displayName,
    user.display_name,

    data?.nickname,
    data?.nickName,
    data?.displayName,
    data?.display_name
  );

  const text = firstString(
    data?.comment,
    data?.message,
    data?.text,
    data?.content,

    data?.commentText,
    data?.comment_text,

    data?.data?.comment,
    data?.data?.message,
    data?.data?.text
  );

  const avatar = findUrl(
    user.avatarThumb,
    user.avatarLarger,

    user.avatar_thumb,
    user.avatar_larger,

    user.profilePictureUrl,
    user.profile_picture_url,

    user.avatar,

    data?.profilePictureUrl,
    data?.profile_picture_url,

    data?.avatar,
    data?.avatarThumb,
    data?.avatarLarger
  );

  const isFollower =
    getTikTokFollowerStatus(
      data,
      user
    );

  return {
    user:
      username ||
      'Usuario',

    nickname:
      nickname ||
      username ||
      'Usuario',

    text:
      text ||
      '',

    avatar:
      avatar ||
      '',

    userId: String(user?.id || user?.userId || user?.user_id || data?.userId || data?.user_id || data?.user?.id || ''),
    messageId: String(data?.msgId || data?.msgIdStr || data?.messageId || data?.message_id || data?.common?.msgId || ''),
    isFollower,
    isModerator: !!(user?.isModerator || user?.is_moderator || data?.isModerator || data?.is_moderator || data?.user?.isModerator),
    isBroadcaster: !!(user?.isBroadcaster || user?.is_broadcaster || data?.isBroadcaster || data?.is_broadcaster)
  };
}

// =====================================
// OBTENER USUARIO TIKTOK DESDE URL
// =====================================

function usernameFromTikTokUrl(input) {
  let url;

  try {
    url = new URL(
      String(input).trim()
    );
  } catch {
    throw Error(
      'Enlace de TikTok inválido. Usa https://www.tiktok.com/@usuario/live'
    );
  }

  if (
    !/(^|\.)tiktok\.com$/i.test(
      url.hostname
    )
  ) {
    throw Error(
      'El enlace debe ser de TikTok.'
    );
  }

  const parts =
    url.pathname
      .split('/')
      .filter(Boolean);

  const account =
    parts.find(
      part =>
        part.startsWith('@')
    );

  if (!account) {
    throw Error(
      'No encontré el @usuario en el enlace de TikTok.'
    );
  }

  return account.slice(1);
}

// =====================================
// OBTENER CANAL TWITCH DESDE URL
// =====================================

function twitchChannelFromUrl(input) {
  const value =
    String(
      input || ''
    ).trim();

  if (!value) {
    throw Error(
      'Debes indicar un canal de Twitch.'
    );
  }

  if (
    !value.includes('/') &&
    !value.includes('.') &&
    !value.includes(' ')
  ) {
    return value
      .replace(/^@/, '')
      .toLowerCase();
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw Error(
      'Enlace de Twitch inválido. Usa https://www.twitch.tv/canal'
    );
  }

  if (
    !/(^|\.)twitch\.tv$/i.test(
      url.hostname
    )
  ) {
    throw Error(
      'El enlace debe ser de Twitch.'
    );
  }

  const parts =
    url.pathname
      .split('/')
      .filter(Boolean);

  if (!parts.length) {
    throw Error(
      'No encontré el canal de Twitch en el enlace.'
    );
  }

  return parts[0]
    .replace(/^@/, '')
    .toLowerCase();
}


// =====================================
// KICK
// =====================================

function kickChannelFromUrl(input) {
  const value=String(input||'').trim();
  if(!value) throw Error('Debes indicar un canal de Kick.');
  if(!value.includes('/')&&!value.includes('.')&&!value.includes(' ')) return value.replace(/^@/,'').toLowerCase();
  let url;
  try { url=new URL(value); } catch { throw Error('Enlace de Kick inválido. Usa https://kick.com/usuario'); }
  if(!/(^|\.)kick\.com$/i.test(url.hostname)) throw Error('El enlace debe ser de Kick.');
  const parts=url.pathname.split('/').filter(Boolean);
  if(!parts.length) throw Error('No encontré el canal de Kick en el enlace.');
  return parts[0].replace(/^@/,'').toLowerCase();
}

async function disconnectKick() {
  localMutedUsers.kick.clear();
  const old=currentKickChannel;
  kickConnected=false;
  currentKickChannel='';
  kickUsers.clear();
  kickSeenMessages.clear();
  if(kickReconnectTimer){clearTimeout(kickReconnectTimer);kickReconnectTimer=null;}
  if(kickPagePollTimer){clearInterval(kickPagePollTimer);kickPagePollTimer=null;}
  if(kickSocket){try{kickSocket.removeAllListeners();kickSocket.close()}catch{}}
  kickSocket=null;kickChatroomId=0;kickRealtimeFrames=0;
  if(kickBrowser){ try{await kickBrowser.close()}catch{} }
  kickBrowser=null; kickPage=null;
  if(old) broadcastPlatform('kick',{type:'disconnected',message:`Kick se desconectó de ${old}.`});
  bridgeStatus('kick',false,old?`Kick desconectado: ${old}`:'Kick desconectado',old);
}

function normalizeKickChatPayload(raw){
  let root=raw;
  try{ if(typeof root==='string') root=JSON.parse(root) }catch{}
  // Pusher/Kick suele envolver el mensaje dentro de "data" como JSON serializado.
  for(let i=0;i<4;i++){
    if(root && typeof root==='object' && typeof root.data==='string'){
      try{root={...root,data:JSON.parse(root.data)}}catch{break}
    } else break;
  }
  const candidates=[];
  const walk=(v,depth=0)=>{
    if(!v||depth>6)return;
    if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return}
    if(typeof v!=='object')return;
    candidates.push(v);
    for(const x of Object.values(v)) if(x&&typeof x==='object') walk(x,depth+1);
  };
  walk(root);
  for(const o of candidates){
    const sender=o.sender||o.user||o.author||o.identity||{};
    const content=o.content??o.message??o.text??o.body;
    const username=sender.username||sender.name||sender.slug||sender.channel_slug||o.username||o.user_name;
    if(typeof content==='string' && content.trim() && username){
      const roleText=JSON.stringify([sender.badges,sender.identity,o.badges,o.identity,o.sender_identity]||[]).toLowerCase();
      return {user:String(username),nickname:String(sender.username||sender.name||username),text:content.trim(),avatar:String(sender.profile_picture||sender.avatar||sender.profile_pic||''),userId:String(sender.user_id||sender.id||o.user_id||o.sender_id||''),messageId:String(o.message_id||o.id||root?.message_id||root?.id||''),isModerator:/moderator|\"mod\"/.test(roleText),isBroadcaster:/broadcaster|channel_owner|owner/.test(roleText)};
    }
  }
  return null;
}

function deliverKickChat(msg){
  if(!msg?.text||!msg?.user)return;
  const key=`${msg.user.toLowerCase()}|${msg.text}`;
  const now=Date.now(),prev=kickSeenMessages.get(key)||0;
  if(now-prev<2500)return;
  kickSeenMessages.set(key,now);
  for(const [k,t] of kickSeenMessages) if(now-t>15000) kickSeenMessages.delete(k);
  kickUsers.set(msg.user.toLowerCase(),{username:msg.user,nickname:msg.nickname||msg.user,userId:msg.userId||'',isFollower:null,lastSeen:now});
  broadcastPlatform('kick',{type:'chat',user:msg.user,nickname:msg.nickname||msg.user,text:msg.text,avatar:msg.avatar||'',userId:msg.userId||'',messageId:msg.messageId||'',isFollower:null,broadcaster:currentKickChannel,isModerator:!!msg.isModerator,isBroadcaster:!!msg.isBroadcaster||String(msg.user||'').toLowerCase()===String(currentKickChannel||'').toLowerCase()});
}

function consumeKickRealtimeFrame(payload){
  let raw=payload;
  if(Buffer.isBuffer(raw))raw=raw.toString('utf8');
  if(typeof raw!=='string')return false;
  const text=raw.trim();if(!text||text[0]!=='{'&&text[0]!=='[')return false;
  let parsed;try{parsed=JSON.parse(text)}catch{return false}
  const items=Array.isArray(parsed)?parsed:[parsed];let handled=false;
  for(const ev of items){
    if(!ev||typeof ev!=='object')continue;
    const name=String(ev.event||ev.type||'');
    if(name==='pusher:ping'){try{kickSocket?.send(JSON.stringify({event:'pusher:pong',data:{}}))}catch{};continue}
    if(/ChatMessage(?:Sent)?Event$/i.test(name)||name==='chat.message.sent'){
      const m=normalizeKickChatPayload(kickEventData(ev));if(m){deliverKickChat(m);handled=true}continue;
    }
    if(/GiftedSubscriptionsEvent$/i.test(name)||name==='channel.subscription.gifts'){
      const d=kickEventData(ev),who=kickPerson(d),count=Math.max(1,Number(d.count||d.quantity||d.gifts?.length||d.gifted_usernames?.length||d.giftees?.length||1)||1);
      bridgeAlert('Kick','gift',who,`regaló ${count} suscripción${count===1?'':'es'}`,{count,giftName:'Suscripciones regaladas',giftKind:'subscription',avatar:findUrl(d?.gifter?.profile_picture||d?.sender?.profile_picture||''),kickEvent:name});handled=true;continue;
    }
    if(/KicksGiftedEvent$/i.test(name)||/KicksGifted$/i.test(name)||name==='kicks.gifted'){
      const d=kickEventData(ev),who=kickPerson(d),gift=d.gift||d.data?.gift||{},amount=Math.max(0,Number(gift.amount||d.amount||0)||0),giftName=firstString(gift.name,d.gift_name,d.name,'KICKs');
      bridgeAlert('Kick','gift',who,`envió ${giftName}${amount>0?' · '+amount.toLocaleString('es-DO')+' KICKs':''}`,{giftName,giftKind:'kicks',amount,kickGiftType:firstString(gift.type,d.type),kickGiftTier:firstString(gift.tier,d.tier),giftMessage:firstString(gift.message,d.message),avatar:findUrl(d?.sender?.profile_picture||d?.gifter?.profile_picture||''),kickEvent:name});handled=true;continue;
    }
    if(/SubscriptionEvent$/i.test(name)||name==='channel.subscription.new'||name==='channel.subscription.renewal'){
      const d=kickEventData(ev),who=kickPerson(d);bridgeAlert('Kick','sub',who,name==='channel.subscription.renewal'?'renovó su suscripción':'se suscribió',{avatar:findUrl(d?.subscriber?.profile_picture||d?.sender?.profile_picture||''),kickEvent:name});handled=true;continue;
    }
    if(/FollowEvent$/i.test(name)||name==='channel.followed'){
      const d=kickEventData(ev),who=kickPerson(d),key=String(who||'').toLowerCase();if(key){const old=kickUsers.get(key)||{username:who,nickname:who,userId:'',lastSeen:Date.now()};kickUsers.set(key,{...old,isFollower:true,lastSeen:Date.now()})}bridgeAlert('Kick','follow',who,'te siguió',{kickEvent:name});handled=true;continue;
    }
  }
  return handled;
}
function kickEventData(ev){let d=ev?.data;try{if(typeof d==='string')d=JSON.parse(d)}catch{};return d||{}}
function kickPerson(d={}){const u=d.sender||d.user||d.follower||d.subscriber||d.gifter||d.created_by||{};return String(u.username||u.name||u.slug||d.username||d.user_name||'Usuario')}
function handleKickPusherEvent(ev){consumeKickRealtimeFrame(JSON.stringify(ev))}

async function resolveKickPageState(channel,{keepBrowser=true}={}){
  let browser=kickBrowser,page=kickPage,created=false;
  if(!browser||!page){
    const launchOpts={headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--mute-audio']};
    try{browser=await chromium.launch({...launchOpts,channel:'chrome'})}
    catch(e1){try{browser=await chromium.launch({...launchOpts,channel:'msedge'})}catch(e2){throw Error('GREÑA no pudo abrir Chrome/Edge para leer Kick. Instala Chrome o Edge e inténtalo otra vez.')}}
    page=await browser.newPage({viewport:{width:1280,height:720}});created=true;
    kickBrowser=browser;kickPage=page;
    // La propia web de Kick abre su realtime actual. Escucharlo desde Playwright evita
    // depender exclusivamente de un nombre de evento o canal Pusher que Kick pueda cambiar.
    page.on('websocket',socket=>{
      socket.on('framereceived',frame=>{kickRealtimeFrames++;consumeKickRealtimeFrame(frame.payload)});
    });
    const response=await page.goto(`https://kick.com/${encodeURIComponent(channel)}`,{waitUntil:'domcontentloaded',timeout:45000}).catch(()=>null);
    if(!response){try{await browser.close()}catch{};kickBrowser=null;kickPage=null;throw Error('No pude abrir el canal de Kick. Revisa Internet o el nombre del canal.')}
  }
  const state=await page.evaluate(async slug=>{
    const out={chatroomId:0,viewerCount:null,liveKnown:false,channelId:0,source:''};
    const asNum=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?n:null};
    const absorb=(d,allowRootId=false,src='')=>{
      if(!d||typeof d!=='object')return;
      const data=d.data&&typeof d.data==='object'&&!Array.isArray(d.data)?d.data:d;
      const chatroom=data.chatroom||d.chatroom||{};
      const cr=asNum(chatroom.id??data.chatroom_id??d.chatroom_id??(allowRootId?data.id:null));
      if(cr&&cr>0&&!out.chatroomId){out.chatroomId=cr;out.source=src}
      const cid=asNum(data.id??data.channel_id??d.channel_id);if(cid&&cid>0&&!out.channelId)out.channelId=cid;
      const stream=data.livestream??data.stream??d.livestream??d.stream;
      if(stream!==undefined){out.liveKnown=true;const n=asNum(stream?.viewer_count??stream?.viewers??stream?.viewerCount);if(n!==null)out.viewerCount=n;else if(stream===null)out.viewerCount=0}
      const direct=asNum(data.viewer_count??data.viewerCount);if(direct!==null){out.liveKnown=true;out.viewerCount=direct}
    };
    const urls=[
      [`/api/v2/channels/${encodeURIComponent(slug)}`,false],
      [`/api/v1/channels/${encodeURIComponent(slug)}`,false],
      [`/api/v2/channels/${encodeURIComponent(slug)}/chatroom`,true],
      [`/api/v1/channels/${encodeURIComponent(slug)}/chatroom`,true]
    ];
    for(const [u,allowRootId] of urls){
      try{const r=await fetch(u,{credentials:'include',cache:'no-store'});if(!r.ok)continue;const d=await r.json();absorb(d,allowRootId,u);if(out.chatroomId&&out.liveKnown)break}catch{}
    }
    return out;
  },channel).catch(()=>({chatroomId:0,viewerCount:null,liveKnown:false,channelId:0,source:''}));
  if(!keepBrowser&&created){try{await browser.close()}catch{};if(kickBrowser===browser){kickBrowser=null;kickPage=null}}
  return state;
}
async function pollKickPageState(channel){
  if(!kickPage||!kickBrowser||currentKickChannel!==channel)return;
  try{
    const state=await resolveKickPageState(channel,{keepBrowser:true});
    if(state.chatroomId&&state.chatroomId!==kickChatroomId)kickChatroomId=state.chatroomId;
    if(state.liveKnown&&state.viewerCount!==null)bridgeViewers('kick',state.viewerCount);
  }catch{}
}
function connectKickPusher(channel,chatroomId,channelId=0){
  return new Promise((resolve,reject)=>{
    const url='wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false';
    const ws=new WebSocket(url,{headers:{Origin:'https://kick.com','User-Agent':'Mozilla/5.0'}});kickSocket=ws;let settled=false;
    const fail=e=>{if(!settled){settled=true;reject(e instanceof Error?e:Error(String(e)))}};
    ws.on('open',()=>{
      // Kick ha usado más de una variante del canal. Nos suscribimos a las variantes
      // públicas conocidas y el deduplicador evita mensajes repetidos.
      for(const ch of [`chatrooms.${chatroomId}.v2`,`chatrooms.${chatroomId}`,`chatroom_${chatroomId}`,...(Number(channelId)>0?[`channel.${channelId}`]:[])]){
        try{ws.send(JSON.stringify({event:'pusher:subscribe',data:{auth:'',channel:ch}}))}catch{}
      }
    });
    ws.on('message',buf=>{
      let ev;try{ev=JSON.parse(String(buf))}catch{return}
      if(ev.event==='pusher_internal:subscription_succeeded'){if(!settled){settled=true;resolve(true)};return}
      if(ev.event==='pusher:error'){const d=kickEventData(ev);if(!settled)fail(Error(`Kick realtime rechazó la suscripción${d?.message?': '+d.message:''}`));return}
      handleKickPusherEvent(ev)
    });
    ws.on('error',fail);
    ws.on('close',()=>{if(kickSocket===ws)kickSocket=null;if(kickConnected&&currentKickChannel===channel){broadcastPlatform('kick',{type:'status',message:'Kick perdió el realtime. Reconectando automáticamente...'});kickReconnectTimer=setTimeout(async()=>{try{const state=await resolveKickPageState(channel,{keepBrowser:true});const id=state.chatroomId||kickChatroomId;if(!id)throw Error('Sin chatroom ID');kickChatroomId=id;await connectKickPusher(channel,id,state.channelId||0);broadcastPlatform('kick',{type:'connected',username:channel,message:`Kick reconectado: ${channel}.`})}catch{}},3000)}});
    setTimeout(()=>fail(Error('Kick no confirmó la suscripción al chat.')),12000);
  });
}
async function launchKickChatReader(channel){
  const state=await resolveKickPageState(channel,{keepBrowser:true});
  kickChatroomId=Number(state.chatroomId)||0;
  if(state.liveKnown&&state.viewerCount!==null)bridgeViewers('kick',state.viewerCount);
  if(kickPagePollTimer)clearInterval(kickPagePollTimer);
  kickPagePollTimer=setInterval(()=>pollKickPageState(channel),10000);
  // Primario: Pusher directo cuando tenemos chatroom ID. Respaldo: los frames de la
  // propia página ya están siendo observados por Playwright aunque Pusher directo falle.
  if(kickChatroomId){
    try{await connectKickPusher(channel,kickChatroomId,state.channelId||0)}catch(e){
      console.warn('[KICK realtime directo]',e?.message||e,'· usando lector del navegador');
    }
  }
  return true;
}

async function connectKick(input) {
  const channel=kickChannelFromUrl(input);
  await disconnectKick();
  currentKickChannel=channel;
  broadcastPlatform('kick',{type:'status',message:`Conectando automáticamente al chat de Kick: ${channel}...`});

  fetch(`${MAIN_ORIGIN}/api/kick/config`,{
    method:'POST',headers:{'content-type':'application/json','x-grena-internal':BRIDGE_TOKEN},body:JSON.stringify({slug:channel})
  }).catch(()=>{});

  await launchKickChatReader(channel);
  kickConnected=true;
  broadcastPlatform('kick',{
    type:'connected',username:channel,
    message:`Kick conectado automáticamente: ${channel}. Chat y contador activos en segundo plano.`
  });
  bridgeStatus('kick',true,`${channel} · chat conectado`,channel);
}

// =====================================
// TIMEOUT
// =====================================

function timeout(
  promise,
  ms,
  message
) {
  let timer;

  return Promise
    .race([
      promise,

      new Promise(
        (_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Error(message)
              ),
            ms
          );
        }
      )
    ])
    .finally(
      () =>
        clearTimeout(timer)
    );
}

// =====================================
// DESCONECTAR TIKTOK
// =====================================

async function disconnectTikTok() {
  localMutedUsers.tiktok.clear();
  if(tiktokViewerPollTimer){clearInterval(tiktokViewerPollTimer);tiktokViewerPollTimer=null;}
  tiktokViewerLastSignalAt=0;tiktokViewerLastPositiveAt=0;
  if (tiktokConn) {
    try {
      await tiktokConn.disconnect();
    } catch {}

    tiktokConn = null;
    currentTikTokUser = '';

    tiktokUsers.clear();

    broadcastPlatform(
      'tiktok',
      {
        type:
          'disconnected',

        message:
          'La conexión con TikTok se cerró.'
      }
    );
  }
}

// =====================================
// DESCONECTAR TWITCH
// =====================================

async function disconnectTwitch() {
  localMutedUsers.twitch.clear();
  twitchMetaCache.clear();
  if (twitchClient) {
    try {
      await twitchClient.disconnect();
    } catch {}

    twitchClient = null;
    currentTwitchChannel = '';

    twitchUsers.clear();

    broadcastPlatform(
      'twitch',
      {
        type:
          'disconnected',

        message:
          'La conexión con Twitch se cerró.'
      }
    );
  }
}

// =====================================
// DESCONECTAR TODO
// =====================================

async function disconnectAll() {
  await disconnectTikTok();
  await disconnectTwitch();
  await disconnectKick();
}

// =====================================
// CONECTAR TIKTOK
// =====================================

async function connectTikTok(input) {
  const username =
    usernameFromTikTokUrl(input);

  await disconnectTikTok();

  currentTikTokUser =
    username;

  broadcastPlatform(
    'tiktok',
    {
      type:
        'status',

      message:
        `Comprobando @${username}...`
    }
  );

  const connection =
    new TikTokLiveConnection(
      username,
      {
        fetchRoomInfoOnConnect:
          true,

        processInitialData:
          true,

        // Evita la lista premium de regalos. El evento LIVE actual ya trae gift/giftDetails
        // con nombre, costo e imagen en muchos regalos y GREÑA usa esos datos directamente.
        enableExtendedGiftInfo:
          false
      }
    );

  tiktokConn =
    connection;
  let likeTotal = 0;
  let lastLikeMilestone = 0;
  const recentFollows=new Map();
  const emitFollow=(data,source='follow')=>{
    const id=ttUserId(data),display=ttWho(data);
    if(!id&&!display)return false;
    const key=String(id||display).trim().toLowerCase();
    const now=Date.now(),prev=recentFollows.get(key)||0;
    if(now-prev<7000)return false;
    recentFollows.set(key,now);
    for(const [k,t] of recentFollows)if(now-t>60000)recentFollows.delete(k);
    const username=firstString(data?.user?.uniqueId,data?.user?.unique_id,data?.uniqueId,data?.unique_id,id);
    if(username){
      const oldUser=tiktokUsers.get(username);
      tiktokUsers.set(username,{...(oldUser||{}),username,nickname:firstString(data?.user?.nickname,data?.nickname,display),isFollower:true,lastSeen:now});
      broadcastPlatform('tiktok',{type:'follower-update',user:username,isFollower:true});
    }
    bridgeAlert('TikTok','follow',display||username||'Usuario','te siguió',{avatar:ttAvatar(data),tiktokSource:source,userId:id||''});
    return true;
  };

  // =================================
  // COMENTARIOS
  // =================================

  connection.on(
    WebcastEvent.CHAT,
    data => {
      const chat =
        extractTikTokChat(
          data
        );

      if (
        chat.user &&
        chat.user !== 'Usuario'
      ) {
        const oldUser =
          tiktokUsers.get(
            chat.user
          );

        tiktokUsers.set(
          chat.user,
          {
            ...(oldUser || {}),

            username:
              chat.user,

            nickname:
              chat.nickname,

            isFollower:
              chat.isFollower,

            lastSeen:
              Date.now()
          }
        );
      }

      console.log(
        '[TIKTOK CHAT]',
        chat.user,
        '|',
        chat.isFollower
          ? 'FOLLOWER'
          : 'NO FOLLOWER',
        '|',
        chat.text
      );

      broadcastPlatform(
        'tiktok',
        {
          type:
            'chat',

          user:
            chat.user,

          nickname:
            chat.nickname,

          text:
            chat.text,

          avatar:
            chat.avatar,

          userId:
            chat.userId,

          messageId:
            chat.messageId,

          broadcaster:
            currentTikTokUser,

          isFollower:
            chat.isFollower,

          isModerator:
            chat.isModerator,

          isBroadcaster:
            chat.isBroadcaster || String(chat.user||'').replace(/^@/,'').toLowerCase()===String(currentTikTokUser||'').replace(/^@/,'').toLowerCase()
        }
      );
    }
  );

  // =================================
  // ALERTAS REALES + VIEWERS (MISMA CONEXIÓN DEL CHAT)
  // =================================
  const tiktokViewerCount = (data,{roomUser=false}={}) => {
    // Nunca usar totalUser/memberCount como viewers: en varios payloads son acumulados y
    // causaban el salto falso a cientos de personas antes de volver al valor real.
    const values=[
      data?.viewerCount,data?.viewer_count,data?.userCount,data?.user_count,
      data?.stats?.viewerCount,data?.stats?.viewer_count,data?.stats?.userCount,data?.stats?.user_count,
      data?.roomInfo?.viewerCount,data?.roomInfo?.viewer_count,data?.roomInfo?.userCount,data?.roomInfo?.user_count,
      data?.roomInfo?.data?.viewerCount,data?.roomInfo?.data?.viewer_count,data?.roomInfo?.data?.userCount,data?.roomInfo?.data?.user_count,
      data?.data?.viewerCount,data?.data?.viewer_count,data?.data?.userCount,data?.data?.user_count,
      data?.data?.stats?.viewerCount,data?.data?.stats?.viewer_count,data?.data?.stats?.userCount,data?.data?.stats?.user_count,
      data?.data?.room?.viewerCount,data?.data?.room?.viewer_count,data?.data?.room?.userCount,data?.data?.room?.user_count,
      data?.liveRoomStats?.viewerCount,data?.liveRoomStats?.viewer_count,data?.liveRoomStats?.userCount,data?.liveRoomStats?.user_count,
      data?.live_room_stats?.viewerCount,data?.live_room_stats?.viewer_count,data?.live_room_stats?.userCount,data?.live_room_stats?.user_count,
      data?.data?.liveRoomStats?.viewerCount,data?.data?.liveRoomStats?.viewer_count,data?.data?.liveRoomStats?.userCount,data?.data?.liveRoomStats?.user_count,
      data?.data?.live_room_stats?.viewerCount,data?.data?.live_room_stats?.viewer_count,data?.data?.live_room_stats?.userCount,data?.data?.live_room_stats?.user_count,
      ...(roomUser?[data?.total]:[])
    ];
    let sawExplicitZero=false;
    for(const value of values){
      if(value===null||value===undefined||value===''||typeof value==='boolean')continue;
      const n=Number(value);if(!Number.isFinite(n)||n<0)continue;
      if(n>0)return Math.trunc(n);
      if(n===0)sawExplicitZero=true;
    }
    return sawExplicitZero?0:null;
  };
  const pollTikTokViewers=async(source='TikTok room/info bridge')=>{
    if(tiktokConn!==connection)return false;
    const info=await connection.fetchRoomInfo();
    if(tiktokConn!==connection)return false;
    const count=tiktokViewerCount(info);
    if(count===null)return false;
    tiktokViewerLastSignalAt=Date.now();if(count>0)tiktokViewerLastPositiveAt=tiktokViewerLastSignalAt;bridgeViewers('tiktok',count,source);return true;
  };
  if (WebcastEvent.ROOM_USER) connection.on(WebcastEvent.ROOM_USER, data => {
    const count=tiktokViewerCount(data,{roomUser:true});
    if(count!==null){tiktokViewerLastSignalAt=Date.now();if(count>0)tiktokViewerLastPositiveAt=tiktokViewerLastSignalAt;bridgeViewers('tiktok',count,'TikTok ROOM_USER bridge')}
  });
  // No usamos MEMBER/memberCount para viewers: puede ser acumulado y generar picos falsos.
  if (WebcastEvent.GIFT) connection.on(WebcastEvent.GIFT, data => {
    if ((data?.giftType ?? data?.giftDetails?.giftType ?? data?.gift?.type) === 1 && !data?.repeatEnd) return;
    const gift=ttGiftData(data,connection);
    const action=`envió ${gift.giftName}${gift.count>1?' × '+gift.count:''}${gift.totalDiamonds>0?' · '+gift.totalDiamonds.toLocaleString('es-DO')+' diamantes':''}`;
    bridgeAlert('TikTok','gift',ttWho(data),action,{avatar:ttAvatar(data),...gift,diamondCount:gift.unitDiamonds,giftKind:'tiktok-gift',eventId:String(data?.msgId||data?.common?.msgId||data?.id||'')});
  });
  const ttSubEvent=WebcastEvent.SUB_NOTIFY||'subNotify';
  connection.on(ttSubEvent, data => {
    bridgeAlert('TikTok','sub',ttWho(data),'se suscribió',{avatar:ttAvatar(data),months:Number(data?.subMonth||0)||undefined,tiktokSource:'subNotify',eventId:String(data?.msgId||data?.common?.msgId||data?.id||'')});
  });
  if (WebcastEvent.SHARE) connection.on(WebcastEvent.SHARE, data => {
    bridgeAlert('TikTok','share',ttWho(data),'compartió el LIVE',{avatar:ttAvatar(data),eventId:String(data?.msgId||data?.common?.msgId||data?.id||'')});
  });
  // TikTok cambia con frecuencia las claves internas del mensaje social. El conector
  // emite FOLLOW cuando reconoce la clave; SOCIAL sirve como respaldo si TikTok cambia
  // esa clave pero el payload aún describe una acción de seguimiento.
  if (WebcastEvent.SOCIAL) connection.on(WebcastEvent.SOCIAL, data => {
    if(ttSocialLooksLikeFollow(data))emitFollow(data,'social-fallback');
  });
  if (WebcastEvent.LIKE) connection.on(WebcastEvent.LIKE, data => {
    const n=Math.max(1,Number(data?.likeCount||1)||1);
    bridgeLoyalty('TikTok','like',ttUserId(data),{nickname:ttWho(data),avatar:ttAvatar(data),amount:n,userId:ttUserId(data)});
    likeTotal+=n;
    const milestone=Math.floor(likeTotal/100)*100;
    if(milestone>=100&&milestone>lastLikeMilestone){
      lastLikeMilestone=milestone;
      bridgeAlert('TikTok','like',ttWho(data),`${milestone.toLocaleString('es-DO')} likes acumulados`,{avatar:ttAvatar(data),likes:milestone});
    }
  });

  // =================================
  // NUEVO FOLLOW
  // =================================

  if (WebcastEvent.FOLLOW) {
    connection.on(WebcastEvent.FOLLOW,data=>emitFollow(data,'follow'));
  }

  // =================================
  // CONECTADO
  // =================================

  connection.on(
    ControlEvent.CONNECTED,
    data => {
      bridgeStatus('tiktok',true,`@${username} · LIVE conectado`,username,{roomId:String(data?.roomId||connection.roomId||'')});
      broadcastPlatform(
        'tiktok',
        {
          type:
            'connected',

          username,

          roomId:
            data?.roomId ||
            connection.roomId ||
            '',

          message:
            `Conectado al LIVE de @${username}`
        }
      );
    }
  );

  // =================================
  // LIVE TERMINÓ
  // =================================

  connection.on(
    WebcastEvent.STREAM_END,
    () => {
      if(tiktokConn!==connection)return;
      if(tiktokViewerPollTimer){clearInterval(tiktokViewerPollTimer);tiktokViewerPollTimer=null;}tiktokViewerLastSignalAt=0;tiktokViewerLastPositiveAt=0;tiktokConn=null;currentTikTokUser='';
      bridgeViewers('tiktok',0,'TikTok STREAM_END');
      bridgeStatus('tiktok',false,`@${username} · LIVE terminó`,username,{ended:true});
      broadcastPlatform(
        'tiktok',
        {
          type:
            'ended',

          message:
            'El LIVE de TikTok terminó.'
        }
      );
    }
  );

  // =================================
  // DESCONECTADO
  // =================================

  connection.on(
    ControlEvent.DISCONNECTED,
    () => {
      if(tiktokConn!==connection)return;
      if(tiktokViewerPollTimer){clearInterval(tiktokViewerPollTimer);tiktokViewerPollTimer=null;}tiktokViewerLastSignalAt=0;tiktokViewerLastPositiveAt=0;tiktokConn=null;currentTikTokUser='';
      // No forzamos viewers=0 por una desconexión del chat: el contador dedicado de
      // TikTok puede seguir sano. /api/internal/status decide si existe un respaldo activo.
      bridgeStatus('tiktok',false,`@${username} · desconectado`,username);
      broadcastPlatform(
        'tiktok',
        {
          type:
            'disconnected',

          message:
            'La conexión con TikTok se cerró.'
        }
      );
    }
  );

  // =================================
  // ERROR
  // =================================

  connection.on(
    ControlEvent.ERROR,
    error => {
      broadcastPlatform(
        'tiktok',
        {
          type:
            'error',

          message:
            getError(error)
        }
      );
    }
  );

  // =================================
  // COMPROBAR LIVE
  // =================================

  try {
    let live = null;
    try {
      live = await timeout(
        connection.fetchIsLive(),
        12000,
        'TikTok tardó demasiado en comprobar el LIVE.'
      );
    } catch (checkError) {
      // Si TikTok bloquea temporalmente el chequeo web, intentamos conectar al LIVE directamente.
      console.warn('[TIKTOK] No se pudo comprobar el estado por rutas directas; intentando conexión:', getError(checkError));
    }

    if (live === false) {
      throw Error(
        'Ese usuario no está en LIVE ahora mismo.'
      );
    }

    broadcastPlatform(
      'tiktok',
      {
        type:
          'status',

        message:
          live === true ? 'LIVE activo. Conectando al chat...' : 'Intentando conectar al LIVE...'
      }
    );

    // =================================
    // CONECTAR CHAT
    // =================================

    const result =
      await timeout(
        connection.connect(),
        20000,
        'TikTok tardó demasiado en abrir el chat.'
      );

    broadcastPlatform(
      'tiktok',
      {
        type:
          'connected',

        username,

        roomId:
          result?.roomId ||
          connection.roomId ||
          '',

        message:
          `Conectado al LIVE de @${username}`
      }
    );

    // ROOM_USER puede faltar en algunos LIVE. room/info devuelve data.user_count,
    // así que la misma conexión del chat mantiene el contador vivo como respaldo.
    try{await pollTikTokViewers('TikTok room/info bridge inicial')}catch(e){console.warn('[TIKTOK VIEWERS] room/info inicial:',getError(e))}
    if(tiktokViewerPollTimer)clearInterval(tiktokViewerPollTimer);
    tiktokViewerLastSignalAt=Date.now();
    tiktokViewerPollTimer=setInterval(()=>pollTikTokViewers().catch(e=>console.warn('[TIKTOK VIEWERS] room/info:',getError(e))),8000);
    tiktokViewerPollTimer.unref?.();

  } catch (error) {
    try {
      await connection.disconnect();
    } catch {}

    if(tiktokConn===connection&&tiktokViewerPollTimer){clearInterval(tiktokViewerPollTimer);tiktokViewerPollTimer=null;}

    if (
      tiktokConn === connection
    ) {
      tiktokConn = null;
      currentTikTokUser = '';
      tiktokViewerLastSignalAt=0;
      tiktokViewerLastPositiveAt=0;
    }

    broadcastPlatform(
      'tiktok',
      {
        type:
          'error',

        message:
          getError(error)
      }
    );
  }
}

// =====================================
// CONECTAR TWITCH
// =====================================

async function connectTwitch(input) {
  const channel =
    twitchChannelFromUrl(
      input
    );

  await disconnectTwitch();

  currentTwitchChannel =
    channel;

  // Vincula el contador desde el mismo clic, sin esperar a que IRC termine de entrar.
  // El servidor principal guarda este canal y lo reintenta automáticamente si
  // Twitch todavía no está autorizado o la API tarda en responder.
  sendToAlerts('/api/counter/connect',{platform:'twitch',value:input});

  broadcastPlatform(
    'twitch',
    {
      type:
        'status',

      message:
        `Conectando al canal de Twitch: ${channel}...`
    }
  );

  const client =
    new tmi.Client({
      options: {
        debug:
          false
      },

      channels: [
        channel
      ]
    });

  twitchClient =
    client;

  // =================================
  // MENSAJE DE TWITCH
  // =================================

  client.on(
    'message',
    async (
      channelName,
      tags,
      message,
      self
    ) => {
      if (self) {
        return;
      }

      const username =
        firstString(
          tags?.username,
          tags?.['display-name'],
          'Usuario'
        );

      const nickname =
        firstString(
          tags?.['display-name'],
          tags?.username,
          'Usuario'
        );

      const userId=String(tags?.['user-id'] || '');
      const meta=await twitchChatUserMeta(userId);
      const isFollower=meta.isFollower;

      twitchUsers.set(
        username.toLowerCase(),
        {
          username,
          nickname,
          userId,
          avatar:meta.avatar||'',
          isFollower,
          lastSeen:
            Date.now()
        }
      );

      console.log(
        '[TWITCH CHAT]',
        username,
        '|',
        message
      );

      broadcastPlatform(
        'twitch',
        {
          type:
            'chat',

          user:
            username,

          nickname,

          text:
            message,

          avatar:
            meta.avatar||'',

          userId,

          messageId:
            String(tags?.id || ''),

          broadcaster:
            currentTwitchChannel,

          isFollower,

          isModerator:
            tags?.mod === '1' || !!tags?.badges?.moderator || !!tags?.badges?.broadcaster,

          isBroadcaster:
            !!tags?.badges?.broadcaster || String(username||'').toLowerCase()===String(currentTwitchChannel||'').replace(/^#/,'').toLowerCase()
        }
      );
    }
  );

  // =================================
  // ALERTAS DE TWITCH DISPONIBLES POR IRC
  // (subs, regalos, bits y raids; follows siguen por EventSub si autorizas Twitch)
  // =================================
  const twitchTierFromPlan=plan=>({'1000':'Tier 1','2000':'Tier 2','3000':'Tier 3'})[String(plan||'')]||'';
  const recentMassGifts=new Map();
  client.on('subscription',(channelName,username,method,message,userstate)=>{
    const tier=twitchTierFromPlan(method?.plan||userstate?.['msg-param-sub-plan']);
    bridgeAlert('Twitch','sub',userstate?.['display-name']||username,`se suscribió${tier?' · '+tier:''}`,{tier});
  });
  client.on('resub',(channelName,username,months,message,userstate,methods)=>{
    const tier=twitchTierFromPlan(methods?.plan||userstate?.['msg-param-sub-plan']);
    bridgeAlert('Twitch','sub',userstate?.['display-name']||username,`se resuscribió · ${months||1} meses${tier?' · '+tier:''}`,{months:Number(months||1),tier});
  });
  client.on('submysterygift',(channelName,username,numbOfSubs,methods,userstate)=>{
    const tier=twitchTierFromPlan(methods?.plan||userstate?.['msg-param-sub-plan']);
    const who=userstate?.['display-name']||username||'Anónimo',count=Math.max(1,Number(numbOfSubs||1)||1);
    recentMassGifts.set(String(username||who).toLowerCase(),Date.now());
    bridgeAlert('Twitch','gift',who,'',{giftName:tier?`Suscripciones regaladas · ${tier}`:'Suscripciones regaladas',giftKind:'subscription',count,tier});
  });
  client.on('subgift',(channelName,username,streakMonths,recipient,methods,userstate)=>{
    const key=String(username||'').toLowerCase(),massAt=recentMassGifts.get(key)||0;if(Date.now()-massAt<2500)return;
    const tier=twitchTierFromPlan(methods?.plan||userstate?.['msg-param-sub-plan']);
    bridgeAlert('Twitch','gift',userstate?.['display-name']||username||'Anónimo','',{giftName:tier?`Suscripción regalada · ${tier}`:'Suscripción regalada',giftKind:'subscription',count:1,tier,recipient:recipient||''});
  });
  client.on('anonsubmysterygift',(channelName,numbOfSubs,methods,userstate)=>{
    const tier=twitchTierFromPlan(methods?.plan||userstate?.['msg-param-sub-plan']),count=Math.max(1,Number(numbOfSubs||1)||1);
    recentMassGifts.set('__anonymous__',Date.now());
    bridgeAlert('Twitch','gift','Anónimo','',{giftName:tier?`Suscripciones regaladas · ${tier}`:'Suscripciones regaladas',giftKind:'subscription',count,tier,isAnonymous:true});
  });
  client.on('anonsubgift',(channelName,streakMonths,recipient,methods,userstate)=>{
    if(Date.now()-(recentMassGifts.get('__anonymous__')||0)<2500)return;
    const tier=twitchTierFromPlan(methods?.plan||userstate?.['msg-param-sub-plan']);
    bridgeAlert('Twitch','gift','Anónimo','',{giftName:tier?`Suscripción regalada · ${tier}`:'Suscripción regalada',giftKind:'subscription',count:1,tier,recipient:recipient||'',isAnonymous:true});
  });
  client.on('cheer',(channelName,userstate,message)=>{
    bridgeAlert('Twitch','cheer',userstate?.['display-name']||userstate?.username||'Anónimo','',{bits:Number(userstate?.bits||0),giftName:'Bits',giftKind:'bits'});
  });
  client.on('raided',(channelName,username,viewers)=>{
    bridgeAlert('Twitch','raid',username||'Canal',`hizo una raid con ${viewers||0} espectadores`,{viewers:Number(viewers||0)});
  });

  // =================================
  // CONECTADO
  // =================================

  client.on(
    'connected',
    (
      address,
      port
    ) => {
      console.log(
        `[TWITCH] Conectado a ${channel}`
      );
      bridgeStatus('twitch',true,`${channel} · chat conectado`,channel);

      broadcastPlatform(
        'twitch',
        {
          type:
            'connected',

          username:
            channel,

          message:
            `Conectado al canal de Twitch: ${channel}`
        }
      );
    }
  );

  // =================================
  // DESCONECTADO
  // =================================

  client.on(
    'disconnected',
    reason => {
      if(twitchClient===client){twitchClient=null;currentTwitchChannel='';}
      bridgeViewers('twitch',0);
      bridgeStatus('twitch',false,`${channel} · chat desconectado`,channel);
      broadcastPlatform(
        'twitch',
        {
          type:
            'disconnected',

          message:
            `Twitch se desconectó${
              reason
                ? ': ' + reason
                : '.'
            }`
        }
      );
    }
  );

  // =================================
  // UNIDO AL CANAL
  // =================================

  client.on(
    'join',
    joinedChannel => {
      console.log(
        `[TWITCH] Unido a #${joinedChannel}`
      );
    }
  );

  // =================================
  // ERROR
  // =================================

  client.on(
    'error',
    error => {
      broadcastPlatform(
        'twitch',
        {
          type:
            'error',

          message:
            getError(error)
        }
      );
    }
  );

  try {
    await timeout(
      client.connect(),
      20000,
      'Twitch tardó demasiado en conectar.'
    );

    broadcastPlatform(
      'twitch',
      {
        type:
          'connected',

        username:
          channel,

        message:
          `Conectado al canal de Twitch: ${channel}`
      }
    );

  } catch (error) {
    try {
      await client.disconnect();
    } catch {}

    if (
      twitchClient === client
    ) {
      twitchClient = null;
      currentTwitchChannel = '';
    }

    broadcastPlatform(
      'twitch',
      {
        type:
          'error',

        message:
          getError(error)
      }
    );
  }
}

// =====================================
// PROXY PARA AVATARES
// =====================================

async function proxyAvatar(rawUrl,response){
  const fail=(code,msg)=>{try{response.writeHead(code,{'content-type':'text/plain; charset=utf-8'});response.end(msg)}catch{}};
  let url;
  try{url=new URL(rawUrl)}catch{return fail(400,'URL inválida')}
  try{
    let result=null;
    for(let hop=0;hop<4;hop++){
      if(!/^https?:$/i.test(url.protocol))return fail(400,'Protocolo no permitido');
      if(!await hostIsPublic(url.hostname))return fail(403,'Destino no permitido');
      result=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.tiktok.com/'}});
      if(result.status>=300&&result.status<400&&result.headers.get('location')){url=new URL(result.headers.get('location'),url);result=null;continue}
      break;
    }
    if(!result)return fail(404,'Demasiadas redirecciones');
    if(!result.ok)throw Error(`HTTP ${result.status}`);
    const contentType=String(result.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!/^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/.test(contentType))return fail(415,'No es una imagen');
    const buffer=Buffer.from(await result.arrayBuffer());
    if(buffer.length>5*1024*1024)return fail(413,'Imagen demasiado grande');
    response.writeHead(200,{'content-type':contentType,'cache-control':'public, max-age=3600','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"});
    response.end(buffer);
  }catch{
    fail(404,'No se pudo cargar el avatar');
  }
}

// =====================================
// SERVIDOR HTTP
// =====================================

const server =
  http.createServer(
    async (
      request,
      response
    ) => {
      try {
        // Anti DNS-rebinding y anti CSRF: Host local y, si hay Origin en peticiones que modifican, debe ser local.
        if(!hostAllowed(request.headers.host)){response.writeHead(403,{'content-type':'text/plain; charset=utf-8'});response.end('Forbidden');return;}
        if(request.method!=='GET'&&request.method!=='HEAD'&&request.method!=='OPTIONS'&&!originAllowed(request.headers.origin)){response.writeHead(403,{'content-type':'text/plain; charset=utf-8'});response.end('Forbidden');return;}
        if(request.method!=='GET'&&request.method!=='HEAD'&&request.method!=='OPTIONS'){const hasBody=Number(request.headers['content-length']||0)>0||!!request.headers['transfer-encoding'];const type=String(request.headers['content-type']||'').toLowerCase();if(hasBody&&!type.startsWith('application/json')){response.writeHead(415,{'content-type':'application/json; charset=utf-8'});response.end(JSON.stringify({ok:false,error:'Content-Type debe ser application/json.'}));return;}}
        if(!/^\/(?![\/\\])/.test(request.url||'')){response.writeHead(400,{'content-type':'text/plain; charset=utf-8'});response.end('Solicitud no válida');return;}
        const url =
          new URL(
            request.url,
            `http://${HOST}:${PORT}`
          );


        if (url.pathname === '/health') {
          response.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
          response.end(JSON.stringify({ok:true, app:'GREÑA Chat'}));
          return;
        }

        // Fish Audio TTS se ejecuta en Node para que la credencial nunca se envíe
        // al navegador. El frontend solo proporciona texto + ID del modelo de voz.
        if (url.pathname === '/api/fish-tts' && request.method === 'POST') {
          let body='';
          body=await readBody(request,64*1024);
          let incoming={};
          try{ incoming=JSON.parse(body||'{}'); }catch{
            response.writeHead(400,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:false,error:'Solicitud de voz no válida.'}));
            return;
          }

          const text=String(incoming.text||'').trim();
          const referenceId=String(incoming.reference_id||'').trim();
          if(!text || text.length>600){
            response.writeHead(400,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:false,error:'El texto debe tener entre 1 y 600 caracteres.'}));
            return;
          }
          if(!/^[A-Za-z0-9_-]{8,160}$/.test(referenceId)){
            response.writeHead(400,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:false,error:'El ID del modelo Fish Audio no es válido.'}));
            return;
          }
          if(!FISH_AUDIO_API_KEY){
            response.writeHead(503,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:false,error:'Fish Audio no está configurado en esta instalación.'}));
            return;
          }

          const controller=new AbortController();
          let clientClosed=false;
          const abortUpstream=()=>{
            if(response.writableEnded) return;
            clientClosed=true;
            if(!controller.signal.aborted){
              try{controller.abort();}catch{}
            }
          };
          // Si el navegador descarta un prebuffer o reinicia la cola, cancelamos
          // también la petición real hacia Fish. Antes podía quedar viva hasta
          // 45 s y, tras mucho chat, acumular solicitudes huérfanas/concurrencia.
          request.once('aborted',abortUpstream);
          response.once('close',abortUpstream);
          const timer=setTimeout(()=>controller.abort(),42000);
          try{
            const fish=await fetch('https://api.fish.audio/v1/tts',{
              method:'POST',
              headers:{
                'Authorization':`Bearer ${FISH_AUDIO_API_KEY}`,
                'Content-Type':'application/json',
                'model':FISH_AUDIO_MODEL,
                'Accept':'audio/mpeg,application/octet-stream'
              },
              body:JSON.stringify({text,reference_id:referenceId,format:'mp3'}),
              signal:controller.signal
            });

            if(!fish.ok){
              const upstream=String(await fish.text().catch(()=>''));
              let friendly=`Fish Audio respondió HTTP ${fish.status}.`;
              if(fish.status===401||fish.status===403) friendly='Fish Audio rechazó la credencial o el acceso a esa voz.';
              else if(fish.status===404) friendly='Fish Audio no encontró ese ID de modelo.';
              else if(fish.status===429) friendly='Fish Audio está limitando temporalmente las solicitudes. Intenta de nuevo en un momento.';
              else if(upstream && upstream.length<220) friendly += ` ${upstream}`;
              const outgoingStatus = fish.status===429 ? 429 : (fish.status>=500 ? 502 : 400);
              if(!response.writableEnded && !response.destroyed){
                response.writeHead(outgoingStatus,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
                response.end(JSON.stringify({ok:false,error:friendly}));
              }
              return;
            }

            const audio=Buffer.from(await fish.arrayBuffer());
            if(!audio.length || audio.length>20*1024*1024){
              response.writeHead(502,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
              response.end(JSON.stringify({ok:false,error:'Fish Audio devolvió un audio no válido.'}));
              return;
            }
            response.writeHead(200,{
              'content-type':'audio/mpeg',
              'content-length':audio.length,
              'cache-control':'no-store, max-age=0',
              'x-content-type-options':'nosniff'
            });
            response.end(audio);
            return;
          }catch(error){
            // Si el cliente local ya canceló la solicitud, no intentamos escribir
            // una respuesta sobre un socket cerrado. La petición a Fish ya quedó abortada.
            if(clientClosed || response.destroyed) return;
            const msg=error?.name==='AbortError'
              ? 'Fish Audio tardó demasiado en responder.'
              : 'No se pudo conectar con Fish Audio.';
            if(!response.writableEnded){
              response.writeHead(502,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
              response.end(JSON.stringify({ok:false,error:msg}));
            }
            return;
          }finally{
            clearTimeout(timer);
            request.off('aborted',abortUpstream);
            response.off('close',abortUpstream);
          }
        }

        if (url.pathname === '/api/profile-reload' && request.method === 'POST') {
          if(String(request.headers['x-grena-internal']||'')!==BRIDGE_TOKEN){response.writeHead(403);response.end('Forbidden');return;}
          let body='';body=await readBody(request);
          let incoming={};try{incoming=JSON.parse(body||'{}')}catch{}
          await disconnectAll();
          await loadChatProfile(String(incoming.userId||''));
          recentChatHistory.splice(0,recentChatHistory.length);
          for(const set of Object.values(localMutedUsers))set.clear();
          broadcast({type:'multichat-settings',settings:multichatSettings});
          broadcast({type:'profile-changed',profileId:activeProfileId});
          if(connectionPrefs.autoConnect)setTimeout(()=>{autoConnectTwitch();autoConnectTikTok();autoConnectKick()},80);
          response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
          response.end(JSON.stringify({ok:true,profileId:activeProfileId,prefs:connectionPrefs}));
          return;
        }
        // Desconexión coordinada desde el Centro de Control. Evita que un canal
        // quede leyendo chat después de desvincular la cuenta.
        if (url.pathname === '/api/internal/disconnect-platform' && request.method === 'POST') {
          if(String(request.headers['x-grena-internal']||'')!==BRIDGE_TOKEN){response.writeHead(403);response.end('Forbidden');return;}
          let body='';body=await readBody(request);
          const platform=String((JSON.parse(body||'{}')).platform||'').toLowerCase();
          if(!['tiktok','twitch','kick'].includes(platform)){response.writeHead(400,{'content-type':'application/json'});response.end(JSON.stringify({ok:false,error:'Plataforma no válida'}));return;}
          connectionPrefs[platform+'Enabled']=false;connectionPrefs[platform+'Url']='';await saveConnectionPrefs();
          if(platform==='tiktok')await disconnectTikTok();
          if(platform==='twitch')await disconnectTwitch();
          if(platform==='kick')await disconnectKick();
          response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
          response.end(JSON.stringify({ok:true,platform,prefs:connectionPrefs}));return;
        }

        // ===============================
        // CONEXIONES GUARDADAS / AUTOCONEXIÓN
        // ===============================
        if (url.pathname === '/api/connection-prefs') {
          applyCors(request,response);
          response.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
          response.setHeader('Access-Control-Allow-Headers','Content-Type');
          if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
          if(request.method==='GET'){
            response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({
              ok:true,
              prefs:connectionPrefs,
              runtime:{tiktok:!!tiktokConn,twitch:!!twitchClient,kick:!!kickConnected}
            }));
            return;
          }
          if(request.method==='POST'){
            let body='';body=await readBody(request);
            const incoming=JSON.parse(body||'{}');
            const allowed=['autoConnect','tiktokUrl','twitchUrl','kickUrl','tiktokEnabled','twitchEnabled','kickEnabled'];
            const next={...connectionPrefs};
            for(const key of allowed){
              if(!(key in incoming))continue;
              if(key==='autoConnect'||key.endsWith('Enabled')) next[key]=!!incoming[key];
              else next[key]=String(incoming[key]??'').trim();
            }
            connectionPrefs=next;
            await saveConnectionPrefs();
            if(connectionPrefs.autoConnect){
              setTimeout(()=>{autoConnectTwitch();autoConnectTikTok();autoConnectKick()},50);
            }
            response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:true,prefs:connectionPrefs}));
            return;
          }
          response.writeHead(405);response.end('Método no permitido');return;
        }

        // ===============================
        // PUENTE INTERNO KICK -> MULTICHAT / VOZ / OBS
        // ===============================
        if (url.pathname === '/api/internal/kick-chat' && request.method === 'POST') {
          if(String(request.headers['x-grena-internal']||'')!==BRIDGE_TOKEN){response.writeHead(403,{'content-type':'application/json; charset=utf-8'});response.end(JSON.stringify({ok:false,error:'Forbidden'}));return;}
          let body=''; body=await readBody(request);
          const d=JSON.parse(body||'{}');
          const sender=d.sender||{};
          const broadcaster=d.broadcaster||{};
          const user=String(sender.username||sender.channel_slug||'Usuario');
          const nickname=user;
          const text=String(d.content||d.message||'').trim();
          if(text){
            kickUsers.set(user.toLowerCase(),{username:user,nickname,userId:String(sender.user_id||''),isFollower:null,lastSeen:Date.now()});
            broadcastPlatform('kick',{
              type:'chat',
              user,
              nickname,
              text,
              avatar:String(sender.profile_picture||''),
              userId:String(sender.user_id||''),
              messageId:String(d.message_id||''),
              isFollower:null,
              broadcaster:String(broadcaster.username||broadcaster.channel_slug||currentKickChannel||''),
              broadcasterId:String(broadcaster.user_id||'')
            });
          }
          response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
          response.end(JSON.stringify({ok:true,delivered:!!text}));
          return;
        }

        // ===============================
        // MODERACIÓN DESDE GREÑA CHAT
        // ===============================
        if (url.pathname === '/api/moderation/action' && request.method === 'POST') {
          let body='';body=await readBody(request);
          try{
            const d=JSON.parse(body||'{}');const platform=String(d.platform||'').toLowerCase(),action=String(d.action||''),user=String(d.username||d.user||'');
            if(!['tiktok','twitch','kick'].includes(platform))throw Error('Plataforma no válida.');
            if(action==='mute_local'||action==='unmute_local'){
              const key=moderationKey(user);if(!key)throw Error('Falta el usuario.');
              if(action==='mute_local')localMutedUsers[platform].add(key);else localMutedUsers[platform].delete(key);
              broadcast({type:'moderation-update',platform,action,user:key});
              response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
              response.end(JSON.stringify({ok:true,message:action==='mute_local'?`${user} quedó silenciado en GREÑA durante este LIVE.`:`${user} volvió a estar visible en GREÑA.`}));return;
            }
            const rr=await fetch(`${MAIN_ORIGIN}/api/moderation/action`,{method:'POST',headers:{'content-type':'application/json','x-grena-internal':BRIDGE_TOKEN},body:JSON.stringify(d)});
            const out=await rr.json().catch(()=>({ok:false,error:`Moderación HTTP ${rr.status}`}));
            response.writeHead(rr.ok?200:400,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(out));return;
          }catch(e){response.writeHead(400,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({ok:false,error:e?.message||String(e)}));return}
        }

        // ===============================
        // CONTROL REMOTO DEL CHAT DE VOZ DESDE PREVIEW LIVE
        // No crea otro motor TTS: envía la orden a las ventanas de GREÑA Chat ya abiertas.
        // ===============================
        if (url.pathname === '/api/voice-control') {
          applyCors(request,response);
          response.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
          response.setHeader('Access-Control-Allow-Headers','Content-Type');
          if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
          if(request.method==='GET'){response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({ok:true,enabled:voiceControlState}));return;}
          if(request.method==='POST'){let body='';body=await readBody(request);const d=JSON.parse(body||'{}');if(typeof d.enabled!=='boolean'){response.writeHead(400,{'content-type':'application/json; charset=utf-8'});response.end(JSON.stringify({ok:false,error:'Falta enabled true/false'}));return;}voiceControlState=d.enabled;broadcast({type:'voice-control',enabled:voiceControlState,source:'preview-live'});response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({ok:true,enabled:voiceControlState}));return;}
          response.writeHead(405);response.end('Método no permitido');return;
        }

        // ===============================
        // HISTORIAL RECIENTE DEL MULTICHAT PARA OBS
        // Permite que el overlay muestre inmediatamente los últimos mensajes
        // después de abrirse o recargarse.
        // ===============================
        if (url.pathname === '/api/multichat-history') {
          applyCors(request,response);
          response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
          if (request.method === 'GET') {
            const n=Math.max(1,Math.min(30,Number(url.searchParams.get('limit')||multichatSettings.maxMessages||6)));
            response.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:true,messages:recentChatHistory.slice(-n)}));
            return;
          }
          response.writeHead(405); response.end('Método no permitido'); return;
        }

        // ===============================
        // PRUEBA MULTICHAT PARA OBS
        // La prueba se transmite por el mismo WebSocket que usa el chat real,
        // de modo que también aparece en una Fuente de navegador de OBS.
        // ===============================
        if (url.pathname === '/api/multichat-test') {
          applyCors(request,response);
          response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
          if (request.method === 'POST') {
            let body=''; body=await readBody(request);
            let incoming={};
            try { incoming=JSON.parse(body||'{}'); } catch {}
            const platform=['tiktok','twitch','kick'].includes(String(incoming.platform||'').toLowerCase())
              ? String(incoming.platform).toLowerCase()
              : 'tiktok';
            const demo={
              type:'chat',
              platform,
              nickname:String(incoming.nickname||'Usuario de prueba'),
              user:String(incoming.user||'prueba'),
              text:String(incoming.text||'¡Prueba de GREÑA Multichat en OBS! 🔥'),
              avatar:''
            };
            broadcast(demo);
            response.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:true,message:demo}));
            return;
          }
          response.writeHead(405); response.end('Método no permitido'); return;
        }

        // ===============================
        // AJUSTES MULTICHAT (compartidos con OBS)
        // ===============================
        if (url.pathname === '/api/multichat-settings') {
          applyCors(request,response);
          response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
          if (request.method === 'GET') {
            response.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:true,settings:multichatSettings}));
            return;
          }
          if (request.method === 'POST') {
            let body=''; body=await readBody(request);
            const incoming=JSON.parse(body||'{}');
            multichatSettings=sanitizeMultichatSettings(incoming,multichatDefaults);
            await safeWriteJson(MULTICHAT_SETTINGS_FILE,multichatSettings);
            broadcast({type:'multichat-settings',settings:multichatSettings});
            response.writeHead(200, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
            response.end(JSON.stringify({ok:true,settings:multichatSettings}));
            return;
          }
          response.writeHead(405); response.end('Método no permitido'); return;
        }

        // ===============================
        // PÁGINA PRINCIPAL
        // ===============================

        if (
          url.pathname === '/' ||
          url.pathname ===
            '/index.html'
        ) {
          response.writeHead(
            200,
            {
              'content-type':
                'text/html; charset=utf-8',

              'cache-control':
                'no-store'
            }
          );

          let chatHtml=String(await readFile(new URL('./chat.html',import.meta.url),'utf8'));
          let migrateLegacy=false;
          if(activeProfileId){const flag=join(PROFILES_DIR,activeProfileId,'migrate-legacy-chat.flag');try{await readFile(flag);migrateLegacy=true;await unlink(flag).catch(()=>{})}catch{}}
          chatHtml=chatHtml.replace('</head>',`<script>window.__GRENA_ACTIVE_PROFILE__=${JSON.stringify(activeProfileId)};window.__GRENA_MIGRATE_LEGACY_CHAT__=${migrateLegacy?'true':'false'};</script></head>`);
          response.end(chatHtml);

          return;
        }

        // ===============================
        // OVERLAY MULTICHAT PARA OBS
        // ===============================

        if (url.pathname === '/multichat-overlay.html') {
          response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store'
          });
          response.end(await readFile(new URL('./multichat-overlay.html', import.meta.url)));
          return;
        }

        // ===============================
        // AVATAR
        // ===============================

        if (
          url.pathname ===
          '/avatar'
        ) {
          await proxyAvatar(
            url.searchParams.get(
              'url'
            ) || '',
            response
          );

          return;
        }

        response.writeHead(
          404
        );

        response.end(
          'Not found'
        );

      } catch (error) {
        if(response.headersSent){try{response.end()}catch{}return;}
        response.writeHead(
          error?.statusCode||500
        );

        response.end(
          getError(error)
        );
      }
    }
  );

// =====================================
// WEBSOCKET
// =====================================

const wss =
  new WebSocketServer({
    server,

    path:
      '/ws',

    maxPayload: 256*1024,

    verifyClient: ({origin,req}) => originAllowed(origin) && hostAllowed(req.headers.host)
  });

wss.on(
  'connection',
  ws => {
    clients.add(ws);

    send(
      ws,
      {
        type:
          'hello'
      }
    );

    if(typeof voiceControlState==='boolean') send(ws,{type:'voice-control',enabled:voiceControlState,source:'preview-live'});

    ws.on(
      'message',
      async raw => {
        let message;

        try {
          message =
            JSON.parse(
              raw
            );
        } catch {
          return;
        }

        // =============================
        // CONECTAR
        // =============================

        if (
          message.type ===
          'connect'
        ) {
          const platform =
            String(
              message.platform ||
              ''
            ).toLowerCase();

          if (platform === 'tiktok') {
            connectionPrefs.tiktokUrl=String(message.url||'').trim();
            connectionPrefs.tiktokEnabled=true;
            connectionPrefs.autoConnect=true;
            await saveConnectionPrefs();
            try{await connectTikTok(message.url)}
            catch(error){broadcastPlatform('tiktok',{type:'error',message:getError(error)})}

          } else if (platform === 'twitch') {
            connectionPrefs.twitchUrl=String(message.url||'').trim();
            connectionPrefs.twitchEnabled=true;
            connectionPrefs.autoConnect=true;
            await saveConnectionPrefs();
            try{await connectTwitch(message.url)}
            catch(error){broadcastPlatform('twitch',{type:'error',message:getError(error)})}

          } else if (platform === 'kick') {
            connectionPrefs.kickUrl=String(message.url||'').trim();
            connectionPrefs.kickEnabled=true;
            connectionPrefs.autoConnect=true;
            await saveConnectionPrefs();
            try { await connectKick(message.url); }
            catch(error){
              kickConnected=false;
              broadcastPlatform('kick',{type:'error',message:getError(error)});
            }
          } else {
            broadcast({type:'error',message:'Plataforma no reconocida.'});
          }

          return;
        }

        // =============================
        // DESCONECTAR TODO
        // =============================

        if (
          message.type ===
          'disconnect'
        ) {
          connectionPrefs.tiktokEnabled=false;connectionPrefs.twitchEnabled=false;connectionPrefs.kickEnabled=false;await saveConnectionPrefs();
          await disconnectAll();

          return;
        }

        // =============================
        // DESCONECTAR PLATAFORMA
        // =============================

        if (
          message.type ===
          'disconnect-platform'
        ) {
          const platform =
            String(
              message.platform ||
              ''
            ).toLowerCase();

          if (
            platform ===
            'tiktok'
          ) {
            connectionPrefs.tiktokEnabled=false;await saveConnectionPrefs();
            await disconnectTikTok();
          }

          if (
            platform ===
            'twitch'
          ) {
            connectionPrefs.twitchEnabled=false;await saveConnectionPrefs();
            await disconnectTwitch();
          }
          if (platform === 'kick') {
            connectionPrefs.kickEnabled=false;await saveConnectionPrefs();
            await disconnectKick();
          }
        }
      }
    );

    ws.on(
      'close',
      () => {
        clients.delete(ws);
      }
    );
  }
);

// =====================================
// INICIAR SERVIDOR
// =====================================

function bridgeHeartbeat(){
  bridgeStatus('tiktok',!!tiktokConn,!!tiktokConn?`@${currentTikTokUser||'tiktok'} · chat LIVE conectado`:'TikTok chat desconectado',currentTikTokUser||'',{roomId:String(tiktokConn?.roomId||''),heartbeat:true});
  bridgeStatus('twitch',!!twitchClient,!!twitchClient?`${currentTwitchChannel||'twitch'} · chat conectado`:'Twitch chat desconectado',currentTwitchChannel||'',{heartbeat:true});
  bridgeStatus('kick',!!kickConnected,!!kickConnected?`${currentKickChannel||'kick'} · chat conectado`:'Kick chat desconectado',currentKickChannel||'',{heartbeat:true});
  flushBridgeQueue().catch(()=>{});
}
const bridgeHeartbeatTimer=setInterval(bridgeHeartbeat,3000);bridgeHeartbeatTimer.unref?.();setTimeout(bridgeHeartbeat,350);

let autoTikTokBusy=false;
async function autoConnectTikTok(){
  if(!connectionPrefs.autoConnect||!connectionPrefs.tiktokEnabled||!connectionPrefs.tiktokUrl||tiktokConn||autoTikTokBusy)return;
  autoTikTokBusy=true;try{await connectTikTok(connectionPrefs.tiktokUrl)}catch(e){console.log('[AUTO TikTok] LIVE todavía no disponible:',e?.message||e)}finally{autoTikTokBusy=false}
}
async function autoConnectTwitch(){
  if(!connectionPrefs.autoConnect||!connectionPrefs.twitchEnabled||!connectionPrefs.twitchUrl||twitchClient)return;
  try{await connectTwitch(connectionPrefs.twitchUrl)}catch(e){console.log('[AUTO Twitch] reintentará:',e?.message||e)}
}
async function autoConnectKick(){
  if(!connectionPrefs.autoConnect||kickConnected)return;
  // Si el usuario ya vinculó/configuró Kick en GREÑA principal, recuperamos el canal solos.
  if(!connectionPrefs.kickUrl){
    try{
      const r=await fetch(`${MAIN_ORIGIN}/api/kick/config`,{headers:{'x-grena-internal':BRIDGE_TOKEN}});
      const d=await r.json();
      if(d?.slug){connectionPrefs.kickUrl=`https://kick.com/${d.slug}`;connectionPrefs.kickEnabled=true;await saveConnectionPrefs()}
    }catch{}
  }
  if(!connectionPrefs.kickEnabled||!connectionPrefs.kickUrl)return;
  try{await connectKick(connectionPrefs.kickUrl)}catch(e){console.log('[AUTO Kick] reintentará:',e?.message||e)}
}
server.listen(
  PORT,
  HOST,
  async () => {
    console.log(`GREÑA CHAT listo: http://${HOST}:${PORT}`);
    console.log('TikTok + Twitch + Kick preparados. Autoconexión:',connectionPrefs.autoConnect?'ACTIVA':'DESACTIVADA');
    console.log('Chat de voz preparado desde el navegador.');
    await Promise.allSettled([autoConnectTwitch(),autoConnectTikTok(),autoConnectKick()]);
    setInterval(()=>{autoConnectTwitch();autoConnectTikTok();autoConnectKick()},30000);
  }
);