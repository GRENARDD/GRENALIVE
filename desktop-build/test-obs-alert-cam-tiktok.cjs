// GREÑA Desktop regression tests: OBS token, alerts, Studio, Cam Room and TikTok.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ROOT=path.resolve(__dirname,'..');
const get=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const server=get('server.mjs');
const chat=get('chat-server.mjs');
const overlay=get('multichat-overlay.html');
const widgets=get('widgets.html');
const alertHub=get('alerts.html');
const alertOverlay=get('afterglow-overlay.html');
const picker=get('assets/alerts-theme-picker.js');
const control=get('control-center.js');
const cam=get('cam-room.js');

test('OBS local permite lectura de multichat con token privado y SIN cookie GREÑA',()=>{
  const i=server.indexOf('function obsAuthorized(req){'),j=server.indexOf('\nfunction assignObsCookie',i);
  assert.ok(i>=0&&j>i,'No se encontró la función real obsAuthorized');
  const code=server.slice(i,j);
  assert.doesNotMatch(code,/!CLOUD_MODE/,'OBS local no debe desactivar la autorización por token.');
  const ctx=vm.createContext({
    activeUserId:'profile1',obsToken:'TEST_PRIVATE_TOKEN_1234567890',URL,
    safeTokenEqual:(a,b)=>a===b,parseCookies:()=>({})
  });
  vm.runInContext(code,ctx);
  assert.equal(ctx.obsAuthorized({url:'/chat/multichat-overlay.html?obs=TEST_PRIVATE_TOKEN_1234567890'}),true);
  assert.equal(ctx.obsAuthorized({url:'/chat/multichat-overlay.html?obs=wrong'}),false);
  assert.equal(ctx.obsAuthorized({url:'/chat/multichat-overlay.html'}),false);
  assert.match(server,/obsAuthorized\(req\)&&req\.method==='GET'&&\(chatOverlay\|\|chatApi\|\|chatAvatar\)/);
});
test('Multichat OBS propaga token a API, historial, avatar y WebSocket',()=>{
  assert.match(overlay,/const OBS_ACCESS=new URLSearchParams\(location\.search\)\.get\('obs'\)/);
  assert.match(overlay,/OBS_SUFFIX/);
  assert.match(overlay,/CHAT_WS=.*OBS_ACCESS/);
  assert.match(overlay,/multichat-settings\?ts=.*OBS_SUFFIX/);
  assert.match(overlay,/multichat-history\?limit=.*OBS_SUFFIX/);
  assert.match(overlay,/avatar\?url=.*OBS_SUFFIX/);
  assert.match(widgets,/getElementById\('chatPreview'\)\.src=chat/);
  assert.match(widgets,/chat=protect\('\/chat\/multichat-overlay\.html'\)/);
});
test('solo se seleccionan PixelCraft y las ocho alertas básicas, sin Original',()=>{
  const allowed=['minecraft','celestial','sakura','comic','hologram','inferno','arcade','royal','void'];
  for(const name of allowed){
    assert.ok(alertHub.includes('data-grena-theme="'+name+'"'),'Falta tarjeta '+name);
  }
  assert.doesNotMatch(alertHub,/data-grena-theme="original"/,'Afterglow Original no debe estar visible');
  assert.match(alertHub,/Alertas básicas/);
  assert.match(picker,/if\(busy\)return;/);
  assert.doesNotMatch(picker,/busy\|\|next===theme/);
  assert.match(alertOverlay,/GrenaBasicAlerts\.render\(cfg\.theme/);
  assert.match(alertOverlay,/GrenaBasicAlerts\.play\(cfg\.theme/);
  assert.match(alertOverlay,/settingsSyncTimer=setInterval\(syncSettingsFromServer,5000\)/);
  assert.match(server,/\/api\/afterglow-settings.*\/api\/overlay-version/);
});
test('Afterglow Studio abre dentro de la ventana Electron, no mediante pestañas bloqueadas',()=>{
  assert.match(control,/studio:\{path:'\/afterglow-studio\.html\?embed=1'/);
  assert.match(alertHub,/grena-module-open',module:'studio'/);
  const links=alertHub.match(/href="\/afterglow-studio\.html"[^>]*>/g)||[];
  assert.equal(links.length,4);
  for(const link of links)assert.doesNotMatch(link,/target="_blank"/);
});
test('Cam Room verifica el gateway HTTPS y rechaza enlaces viejos o de otro servidor',async()=>{
  const start=server.indexOf('async function camProbeExternalGateway(');
  const end=server.indexOf('\nfunction camHostPayload(',start);
  assert.ok(start>0&&end>start);
  assert.match(server,/lastProbeOk:true,lastProbeAt:Date\.now\(\)/);
  assert.match(server,/await camProbeExternalGateway\(externalBase,3\)/);
  const source=server.slice(start,end);
  const env=vm.createContext({
    URL,AbortController,setTimeout,clearTimeout,
    camCleanBase:(value)=>String(value||'').replace(/\/+$/,''),
    camIsLocalBase:v=>['127.0.0.1','localhost'].includes(new URL(v).hostname),
    fetch:async()=>({ok:true,status:200,json:async()=>({ok:true,app:'GREÑA Cam Gateway'})})
  });
  vm.runInContext(source,env);
  assert.equal(await env.camProbeExternalGateway('https://valid.trycloudflare.com/',1),true);
  env.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,app:'Servicio equivocado'})});
  await assert.rejects(env.camProbeExternalGateway('https://invalid.trycloudflare.com',1),/no responde desde internet/);
  await assert.rejects(env.camProbeExternalGateway('http://127.0.0.1:8790',1),/HTTPS externo/);
  assert.match(cam,/tunnelError/);
});
test('TikTok reconoce textos anidados y cuenta posibles descartes sin mostrar datos privados',()=>{
  // Windows git checkout usa CRLF en algunos archivos; normalizamos antes del corte.
  const normalizedChat=chat.replace(/\r\n/g,'\n');
  const start=normalizedChat.indexOf('function extractTikTokChat(data) {'),end=normalizedChat.indexOf('\n}\n',start)+2;
  assert.ok(start>0&&end>start);
  const code=normalizedChat.slice(start,end);
  assert.match(code,/data\?\.data\?\.comment\?\.text/);
  const ctx=vm.createContext({
    firstString:(...xs)=>xs.find(x=>typeof x==='string'&&x.trim())||'',
    findUrl:()=>'',getTikTokFollowerStatus:()=>false,getTikTokSubscriberStatus:()=>false
  });
  vm.runInContext(code,ctx);
  const d=ctx.extractTikTokChat({data:{user:{uniqueId:'otro_usuario',nickname:'Persona'},comment:{text:'Mensaje con estructura nueva'}}});
  assert.equal(d.user,'otro_usuario');
  assert.equal(d.text,'Mensaje con estructura nueva');
  assert.match(chat,/const tiktokChatStats=\{/);
  assert.match(chat,/tiktokChatStats\.muted\+\+/);
  assert.match(chat,/tiktokChatStats\.forwarded\+\+/);
  assert.match(chat,/comments:\{\.\.\.tiktokChatStats\}/);
  assert.doesNotMatch(chat,/'\[TIKTOK CHAT\]'\s*,\s*chat\.user/);
});
