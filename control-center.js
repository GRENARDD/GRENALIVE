const $=id=>document.getElementById(id);
const state={status:{},bridge:{tiktok:false,twitch:false,kick:false,youtube:false},eventHealth:{},viewers:{tiktok:0,twitch:0,kick:0,youtube:0},activity:[],chatConnected:false,profile:null};
const icons={follow:'＋',gift:'🎁',cheer:'◆',sub:'★',share:'↗',raid:'⚡',like:'♥'};

async function initAccount(){
 try{
  const d=await fetch('/api/account/me',{cache:'no-store'}).then(r=>r.json());
  if(!d.authenticated||!d.user||!d.active){location.replace('/login.html');return false}
  state.profile=d.user;
  $('profileName').textContent=d.user.displayName||d.user.username;
  $('profileUser').textContent='@'+d.user.username;
  $('profileAvatar').textContent=String(d.user.displayName||d.user.username||'G').trim().slice(0,1).toUpperCase();
  const chat=$('chatFrame');
  const cloud=location.protocol==='https:'||!['127.0.0.1','localhost'].includes(location.hostname);
  const wanted=cloud?`${location.origin}/chat/?embed=1&profile=${encodeURIComponent(d.user.id)}`:`http://127.0.0.1:8788/?embed=1&profile=${encodeURIComponent(d.user.id)}`;
  if(chat.src!==wanted)chat.src=wanted;
  return true;
 }catch{location.replace('/login.html');return false}
}
$('logoutBtn').onclick=async()=>{try{await fetch('/api/account/logout',{method:'POST'});}catch{}location.replace('/login.html')};
$('exitAppBtn').onclick=async()=>{
 const btn=$('exitAppBtn');
 const cloud=location.protocol==='https:'||!['127.0.0.1','localhost'].includes(location.hostname);
 if(cloud){
  if(!confirm('¿Salir de tu cuenta de GREÑA LIVE PRO?'))return;
  btn.disabled=true;btn.textContent='Saliendo…';
  try{await fetch('/api/account/logout',{method:'POST'});}catch{}
  location.replace('/login.html');return;
 }
 if(!confirm('¿Salir de GREÑA LIVE PRO? Se cerrarán Chat + Voz, conexiones, Cam Room, túneles y todos los procesos internos de GREÑA.'))return;
 btn.disabled=true;btn.textContent='Cerrando…';
 try{await fetch('/api/app/exit',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});toast('Cerrando GREÑA LIVE PRO…')}catch{toast('Cerrando GREÑA…')}
};
async function verifyOwnerSession(){
 try{const r=await fetch('/api/account/me',{cache:'no-store'}),d=await r.json();if(!r.ok||!d.authenticated||!d.active||!d.user||d.user.id!==state.profile?.id){location.replace('/login.html');return false}return true}
 catch{location.replace('/login.html');return false}
}
function profileKey(base){return `${base}:${state.profile?.id||'legacy'}`}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),2400)}
function clock(t){return new Date(t||Date.now()).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function renderSystem(ok){$('systemDot').classList.toggle('on',ok);$('systemText').textContent=ok?'Sistema local listo':'Reconectando sistema…'}
const viewerTrend={values:[]};
function renderViewerSparkline(total){
 const value=Math.max(0,Number(total)||0);viewerTrend.values.push(value);if(viewerTrend.values.length>10)viewerTrend.values.shift();
 const vals=viewerTrend.values.length>1?viewerTrend.values:[value,value];
 const min=Math.min(...vals),max=Math.max(...vals),range=Math.max(1,max-min);const width=72,top=4,bottom=23;
 const pts=vals.map((v,i)=>{const x=vals.length===1?width:(i/(vals.length-1))*width;const y=max===min?18:bottom-((v-min)/range)*(bottom-top);return [x,y]});
 const line=$('viewerSparklineLine'),dot=$('viewerSparklineDot');if(!line||!dot)return;
 const points=pts.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');line.setAttribute('points',points);
 const [lastX,lastY]=pts[pts.length-1];dot.setAttribute('cx',lastX.toFixed(1));dot.setAttribute('cy',lastY.toFixed(1));
 line.classList.remove('updated');dot.classList.remove('updated');void line.getBoundingClientRect();line.classList.add('updated');dot.classList.add('updated');
}
function renderViewers(){
 const v={tiktok:Math.max(0,Number(state.viewers.tiktok)||0),twitch:Math.max(0,Number(state.viewers.twitch)||0),kick:Math.max(0,Number(state.viewers.kick)||0),youtube:Math.max(0,Number(state.viewers.youtube)||0)};
 const total=Object.values(v).reduce((a,b)=>a+b,0);
 for(const p of Object.keys(v)){
  const el=$(p+'Viewers');if(el)el.textContent=v[p].toLocaleString('es-DO');
  const card=document.querySelector('.viewer-grid .viewer-card.'+p);
  if(card)card.classList.toggle('is-hidden',v[p]<1);
 }
 document.querySelector('.viewer-grid')?.classList.toggle('is-empty',total<1);
 $('totalViewers').textContent=total.toLocaleString('es-DO');
 renderViewerSparkline(total);
}
function platformAccount(p){const s=state.status[p]||{};const account=s.account||(p==='tiktok'?'TikTok':p==='twitch'?'Twitch':p==='youtube'?'YouTube':'Kick');return s.authenticated?(account?(p==='tiktok'?`@${String(account).replace(/^@/,'')} · LIVE vinculado`:`${account} · cuenta vinculada`):(p==='tiktok'?'LIVE vinculado':'Cuenta vinculada')):(state.bridge[p]?'Conexión LIVE activa':'Cuenta no vinculada')}
function renderPlatforms(){
 const labels={tiktok:'TikTok',twitch:'Twitch',kick:'Kick',youtube:'YouTube'};
 const chipClass=status=>status==='ready'?' on':status==='degraded'||status==='connecting'?' warn':status==='fallback'?' fallback':status==='waiting'?' waiting':' off';
 for(const p of ['tiktok','twitch','kick','youtube']){
  const s=state.status[p]||{},health=state.eventHealth[p]||{},auth=!!s.authenticated;
  const runtimeLive=p==='kick'?!!(s.runtimeConnected||state.bridge[p]):!!state.bridge[p];
  const chatState=String(health.chat||(runtimeLive?'ready':auth?'waiting':'off'));
  const eventState=String(health.events||(auth?'waiting':'off'));
  $(p+'Account').textContent=platformAccount(p);
  const a=$(p+'Auth'),l=$(p+'Live'),e=$(p+'Events'),btn=$('login'+labels[p]);

  a.className='state-chip'+(auth?' on':' off');
  a.textContent=p==='tiktok'?(auth?'Link ✓':'Link —'):(auth?'Cuenta ✓':'Cuenta —');
  a.title=p==='tiktok'?(auth?'LIVE de TikTok vinculado por enlace':'TikTok no vinculado'):(auth?'Cuenta autorizada en GREÑA':'Cuenta no vinculada');

  const liveLabel=p==='tiktok'?'LIVE':'Chat';
  l.className='state-chip'+chipClass(chatState)+(chatState==='ready'?' live':'');
  l.textContent=chatState==='ready'?`${liveLabel} ✓`:chatState==='degraded'?`${liveLabel} !`:chatState==='connecting'?`${liveLabel}…`:chatState==='fallback'?`${liveLabel} local`:chatState==='waiting'?`${liveLabel} espera`:`${liveLabel} —`;
  l.title=chatState==='ready'?`${liveLabel} conectado`:chatState==='waiting'?`Cuenta vinculada; ${liveLabel.toLowerCase()} esperando conexión`:(health.lastError||health.source||`${liveLabel} no conectado`);

  e.className='state-chip'+chipClass(eventState);
  e.textContent=eventState==='ready'?'Eventos ✓':eventState==='degraded'?'Eventos !':eventState==='connecting'?'Eventos…':eventState==='fallback'?'Eventos local':eventState==='waiting'?'Eventos espera':'Eventos —';
  e.title=eventState==='ready'?'Eventos en tiempo real activos':eventState==='waiting'?'Cuenta vinculada; eventos esperando que el motor en vivo esté disponible':(health.lastError||health.source||'Eventos no activos');

  btn.textContent=auth?'Desconectar':'Conectar';btn.classList.toggle('connected',auth);btn.title=auth?`Desconectar ${labels[p]}`:`Conectar ${labels[p]}`;
 }
 maybeOnboarding();
}
function detailFor(a){if(a.event==='gift'&&a.giftName){const parts=[];parts.push(`${a.giftName}${Number(a.count||1)>1?' × '+a.count:''}`);if(Number(a.totalDiamonds)>0)parts.push(`${Number(a.totalDiamonds).toLocaleString('es-DO')} diamantes`);return parts.join(' · ')}if(a.event==='cheer'&&Number(a.bits)>0)return `${Number(a.bits).toLocaleString('es-DO')} Bits`;if(a.event==='raid'&&Number(a.viewers)>0)return `${Number(a.viewers).toLocaleString('es-DO')} espectadores`;return ''}
function addActivity(a,fromHistory=false){if(!a||!['TikTok','Twitch','Kick'].includes(a.platform))return;const id=[a.platform,a.event,a.name,a.receivedAt].join('|');if(state.activity.some(x=>x.__id===id))return;a.__id=id;state.activity.unshift(a);if(state.activity.length>80)state.activity.length=80;if(!fromHistory)renderActivity();}
function renderActivity(){const box=$('activityFeed');$('eventCount').textContent=state.activity.length;if(!state.activity.length){box.innerHTML='<div class="empty-state"><span>⚡</span><b>Esperando actividad</b><small>Follows, regalos, compartidos, subs, Bits y raids aparecerán aquí con el detalle exacto.</small></div>';return}box.innerHTML=state.activity.map(a=>{const p=a.platform==='TikTok'?'tt':a.platform==='Kick'?'kick':'tw',detail=detailFor(a),action=a.action||a.message||'realizó una acción';return `<div class="event-row"><div class="event-icon">${icons[a.event]||'•'}</div><div class="event-copy"><div class="event-top"><b>${esc(a.name||'Usuario')}</b><span class="event-platform ${p}">${esc(a.platform)}</span></div><div class="event-action">${esc(action)}</div>${detail&&!String(action).includes(detail)?`<div class="event-detail">${esc(detail)}</div>`:''}</div><span class="event-time">${clock(a.receivedAt)}</span></div>`}).join('')}
async function loadInitial(){try{const [st,ac,v]=await Promise.all([fetch('/api/status',{cache:'no-store'}).then(r=>r.json()),fetch('/api/activity?limit=60',{cache:'no-store'}).then(r=>r.json()),fetch('/api/viewers',{cache:'no-store'}).then(r=>r.json())]);state.status=st.status||{};state.bridge={...state.bridge,...(st.bridgeRuntime||{})};state.eventHealth=st.eventHealth||state.eventHealth;state.viewers=v.viewers||state.viewers;state.activity=[];(ac.activity||[]).slice().reverse().forEach(a=>addActivity(a,true));renderActivity();renderPlatforms();renderViewers();renderSystem(true)}catch{renderSystem(false)}}
let coreWS,retryCore;function connectCore(){clearTimeout(retryCore);try{coreWS?.close()}catch{}const ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);coreWS=ws;ws.onopen=()=>renderSystem(true);ws.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.type==='hello'){state.status=d.status||state.status;state.bridge={...state.bridge,...(d.bridgeRuntime||{})};state.eventHealth=d.eventHealth||state.eventHealth;state.viewers=d.viewers||state.viewers;renderPlatforms();renderViewers()}if(d.type==='platform-status'){state.status=d.status||state.status;renderPlatforms()}if(d.type==='event-health'){state.eventHealth=d.eventHealth||state.eventHealth;renderPlatforms()}if(d.type==='viewers'){state.viewers=d.viewers||state.viewers;renderViewers()}if(d.type==='activity'){addActivity(d.activity);renderActivity()}if(d.type==='profile-changed'){if(!d.profile||d.profile.id!==state.profile?.id){location.replace('/login.html');return}state.profile=d.profile;$('profileName').textContent=d.profile.displayName||d.profile.username;$('profileUser').textContent='@'+d.profile.username;$('profileAvatar').textContent=String(d.profile.displayName||d.profile.username||'G').slice(0,1).toUpperCase()}}catch{}};ws.onclose=()=>{renderSystem(false);verifyOwnerSession().then(ok=>{if(ok)retryCore=setTimeout(connectCore,1500)})};ws.onerror=()=>{try{ws.close()}catch{}}}
let chatWS,retryChat;function connectChatEngine(){clearTimeout(retryChat);try{chatWS?.close()}catch{}const cloud=location.protocol==='https:'||!['127.0.0.1','localhost'].includes(location.hostname);const ws=new WebSocket(cloud?`${location.protocol==='https:'?'wss':'ws'}://${location.host}/chat-ws`:`ws://${location.hostname}:8788/ws`);chatWS=ws;ws.onopen=()=>{state.chatConnected=true;$('chatEngineDot').classList.add('on');$('chatEngineText').textContent='Motor de chat conectado'};ws.onmessage=e=>{try{const d=JSON.parse(e.data),p=String(d.platform||'').toLowerCase();if(['tiktok','twitch','kick'].includes(p)){if(d.type==='connected'){state.bridge[p]=true;renderPlatforms()}if(['disconnected','ended'].includes(d.type)){state.bridge[p]=false;renderPlatforms()}}}catch{}};ws.onclose=()=>{state.chatConnected=false;$('chatEngineDot').classList.remove('on');$('chatEngineText').textContent='Reconectando motor de chat…';retryChat=setTimeout(connectChatEngine,1500)};ws.onerror=()=>{try{ws.close()}catch{}}}
async function postAlert(payload){const r=await fetch('/api/alert',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw Error('No se pudo enviar la alerta')}
const tests={
 'tt-follow':{platform:'TikTok',event:'follow',name:'USUARIO_PRUEBA',action:'te siguió'},
 'tt-gift':{platform:'TikTok',event:'gift',name:'USUARIO_PRUEBA',giftName:'Rosa',count:5,unitDiamonds:1,totalDiamonds:5,action:'envió Rosa × 5 · 5 diamantes'},
 'tt-share':{platform:'TikTok',event:'share',name:'USUARIO_PRUEBA',action:'compartió el LIVE'},
 'tw-sub':{platform:'Twitch',event:'sub',name:'USUARIO_PRUEBA',action:'se suscribió · Tier 1'},
 'tw-bits':{platform:'Twitch',event:'cheer',name:'USUARIO_PRUEBA',bits:500,action:'envió 500 Bits'},
 'ki-follow':{platform:'Kick',event:'follow',name:'USUARIO_PRUEBA',action:'te siguió'},
 'ki-sub':{platform:'Kick',event:'sub',name:'USUARIO_PRUEBA',action:'se suscribió'}
};
document.querySelectorAll('[data-test]').forEach(b=>b.onclick=async()=>{
 const payload=tests[b.dataset.test];
 if(!payload){toast('Esta prueba todavía no está configurada.');return}
 try{await postAlert(payload);toast('Alerta de prueba enviada a OBS')}catch(e){toast(e.message)}
});
fetch('/api/obs-token',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(d?.token){const u=new URL('/overlay.html',location.origin);u.searchParams.set('obs',d.token);$('overlayUrl').textContent=u.toString()}}).catch(()=>{});
$('copyOverlay').onclick=async()=>{try{await navigator.clipboard.writeText($('overlayUrl').textContent);toast('Link del overlay copiado')}catch{toast('Copia el link manualmente')}};
function openTikTokLinkModal(){
 const modal=$('tiktokLinkModal'),input=$('tiktokLiveUrl'),hint=$('tiktokLinkHint');if(!modal)return;
 hint.textContent='No necesitas iniciar sesión ni autorizar permisos de TikTok.';hint.classList.remove('error');
 input.value='';modal.classList.add('show');modal.setAttribute('aria-hidden','false');setTimeout(()=>input.focus(),30);
}
function closeTikTokLinkModal(){const modal=$('tiktokLinkModal');if(!modal)return;modal.classList.remove('show');modal.setAttribute('aria-hidden','true')}
async function submitTikTokLiveLink(){
 const input=$('tiktokLiveUrl'),hint=$('tiktokLinkHint'),btn=$('tiktokLinkConnect'),url=String(input?.value||'').trim();
 if(!url){hint.textContent='Pega primero el link del LIVE de TikTok.';hint.classList.add('error');input?.focus();return}
 btn.disabled=true;hint.textContent='Conectando GREÑA a ese LIVE…';hint.classList.remove('error');
 try{
  const r=await fetch('/api/tiktok/live-link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url})}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'No se pudo conectar ese LIVE de TikTok.');
  closeTikTokLinkModal();toast(d.message||'TikTok conectado por link del LIVE.');setTimeout(loadInitial,350);
 }catch(e){hint.textContent=e.message||'No se pudo conectar TikTok.';hint.classList.add('error')}
 finally{btn.disabled=false}
}
$('tiktokLinkCancel')?.addEventListener('click',closeTikTokLinkModal);
$('tiktokLinkConnect')?.addEventListener('click',submitTikTokLiveLink);
$('tiktokLiveUrl')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submitTikTokLiveLink()}if(e.key==='Escape')closeTikTokLinkModal()});
$('tiktokLinkModal')?.addEventListener('click',e=>{if(e.target===$('tiktokLinkModal'))closeTikTokLinkModal()});

async function connectPlatformAccount(platform,label){
 if(platform==='tiktok'){openTikTokLinkModal();return}
 try{
  const st=await fetch('/api/status',{cache:'no-store'}).then(r=>r.json());
  if(st.oauthConfigured?.[platform]===false){
   const detail=st.authService?.configured?(st.authService?.lastError||'El servicio de autenticación aún no tiene esta plataforma activada.'):'GREÑA Auth todavía no está configurado por el administrador.';
   toast(detail);return;
  }
  const w=640,h=780,left=Math.max(0,(screen.width-w)/2),top=Math.max(0,(screen.height-h)/2);
  const popup=window.open(`/oauth/${platform}/start`,`grena_oauth_${platform}`,`width=${w},height=${h},left=${left},top=${top}`);
  if(!popup){toast('Permite ventanas emergentes para conectar '+label+'.');return}
  toast(`Inicia sesión en ${label} y autoriza GREÑA.`);
  const timer=setInterval(()=>{if(popup.closed){clearInterval(timer);setTimeout(loadInitial,500)}},650);
 }catch(e){toast(e.message||`No se pudo iniciar ${label}`)}
}
async function disconnectPlatformAccount(platform,label){
 try{
  const r=await fetch(`/api/disconnect/${platform}`,{method:'POST'}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||`No se pudo desconectar ${label}.`);
  toast(`${label} desconectado.`);await loadInitial();
 }catch(e){toast(e.message||`No se pudo desconectar ${label}.`)}
}
function platformAction(platform,label){return state.status[platform]?.authenticated?disconnectPlatformAccount(platform,label):connectPlatformAccount(platform,label)}
$('loginTikTok').onclick=()=>platformAction('tiktok','TikTok');
$('loginTwitch').onclick=()=>platformAction('twitch','Twitch');
$('loginKick').onclick=()=>platformAction('kick','Kick');
$('loginYouTube').onclick=()=>platformAction('youtube','YouTube');

function onboardingKey(){return profileKey('grenaOnboardingDismissedV4')}
function maybeOnboarding(){
 const box=$('onboarding');if(!box||!state.profile)return;
 const any=['tiktok','twitch','kick'].some(p=>state.status[p]?.authenticated);
 const dismissed=localStorage.getItem(onboardingKey())==='1';
 box.classList.toggle('show',!any&&!dismissed);box.setAttribute('aria-hidden',any||dismissed?'true':'false');
}
document.querySelectorAll('[data-onboard]').forEach(b=>b.onclick=()=>{const p=b.dataset.onboard,label=p==='tiktok'?'TikTok':p==='twitch'?'Twitch':'Kick';connectPlatformAccount(p,label)});
$('onboardingLater')?.addEventListener('click',()=>{localStorage.setItem(onboardingKey(),'1');maybeOnboarding()});

// ===== NAVEGACIÓN PERSISTENTE =====
// Alertas y Widgets se abren en una capa interna. El iframe de Chat + Voz
// permanece montado y activo, por lo que SpeechSynthesis y sus colas no se destruyen.
const moduleLayer=$('moduleLayer'), moduleFrame=$('moduleFrame'), moduleTitle=$('moduleTitle');
const moduleMap={
  alerts:{path:'/alerts.html?embed=1',title:'Editor de alertas'},
  widgets:{path:'/widgets.html?embed=1',title:'Widgets OBS'},
  cam:{path:'/cam-room.html?embed=1',title:'GREÑA Cam Room · Cámaras para OBS'},
  catalog:{path:'/gift-catalog.html?embed=1',title:'Catálogo universal de regalos'}
};
let activeModule='';
let moduleKeepaliveTimer=null;
function pingBackgroundEngines(){
  try{$('chatFrame')?.contentWindow?.postMessage({type:'grena-background-keepalive',source:'creator-control'},'*')}catch{}
}
function startBackgroundKeepalive(){
  clearInterval(moduleKeepaliveTimer);
  pingBackgroundEngines();
  moduleKeepaliveTimer=setInterval(pingBackgroundEngines,2500);
}
function stopBackgroundKeepalive(){
  clearInterval(moduleKeepaliveTimer);
  moduleKeepaliveTimer=null;
  pingBackgroundEngines();
}
function moduleFromHash(){const h=String(location.hash||'').replace(/^#/,'').toLowerCase();return moduleMap[h]?h:''}
function syncTopNavigation(name=''){
  document.querySelectorAll('.primary-nav [data-module]').forEach(a=>a.classList.toggle('active',a.dataset.module===name));
  document.querySelectorAll('.primary-nav [data-home]').forEach(a=>a.classList.toggle('active',!name));
}
function openModule(name,{updateHash=true}={}){
  const cfg=moduleMap[name];if(!cfg||!moduleLayer||!moduleFrame)return;
  activeModule=name;
  const current=moduleFrame.getAttribute('data-module');
  if(current!==name){
    moduleFrame.src=cfg.path;
    moduleFrame.setAttribute('data-module',name);
  }
  moduleTitle.textContent=cfg.title;
  moduleLayer.classList.add('open');
  moduleLayer.setAttribute('aria-hidden','false');
  document.body.classList.add('module-open');
  startBackgroundKeepalive();
  document.querySelectorAll('[data-module-switch]').forEach(b=>b.classList.toggle('active',b.dataset.moduleSwitch===name));
  syncTopNavigation(name);
  if(updateHash&&location.hash!=='#'+name)history.pushState({module:name},'',location.pathname+location.search+'#'+name);
}
function closeModule({updateHash=true}={}){
  if(!moduleLayer)return;
  activeModule='';
  moduleLayer.classList.remove('open');
  moduleLayer.setAttribute('aria-hidden','true');
  document.body.classList.remove('module-open');
  stopBackgroundKeepalive();
  document.querySelectorAll('[data-module-switch]').forEach(b=>b.classList.remove('active'));
  syncTopNavigation('');
  // No descargamos chatFrame. El módulo secundario sí puede quedar cargado.
  if(updateHash&&location.hash)history.pushState({},'',location.pathname+location.search);
}
document.querySelectorAll('a[data-module]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();openModule(a.dataset.module)}));
document.querySelectorAll('a[data-home]').forEach(a=>a.addEventListener('click',e=>{
  e.preventDefault();
  closeModule();
  try{window.scrollTo({top:0,behavior:'smooth'})}catch{}
}));
document.querySelectorAll('[data-module-switch]').forEach(b=>b.addEventListener('click',()=>openModule(b.dataset.moduleSwitch)));
$('closeModuleBtn')?.addEventListener('click',()=>closeModule());
window.addEventListener('message',e=>{
  if(e.origin!==location.origin)return;
  if(e.data?.type==='grena-module-close')closeModule();
  if(e.data?.type==='grena-module-open'&&moduleMap[e.data?.module])openModule(e.data.module);
});
window.addEventListener('popstate',()=>{const m=moduleFromHash();m?openModule(m,{updateHash:false}):closeModule({updateHash:false})});


// ===== SOUNDBOARD · 5 AUDIOS RÁPIDOS =====
const SOUNDBOARD_FADE_SECONDS=.65;
const SOUNDBOARD_MANUAL_FADE_MS=420;
const soundboard={
 slots:new Map(),
 activeSlot:0,
 audio:null,
 uploadSlot:0,
 replaceSlot:0,
 configSlot:0,
 configShortcut:'',
 holdTimer:null,
 holdButton:null,
 suppressClick:0,
 envelopeFrame:0,
 manualFadeFrame:0,
 stopping:false
};
function soundPad(slot){return document.querySelector('.sound-pad[data-sound-slot="'+slot+'"]')}
function soundFadeInput(slot){return document.querySelector('[data-sound-fade="'+slot+'"]')}
function soundFadeEnabled(slot){const meta=soundboard.slots.get(Number(slot));return !meta||meta.fade!==false}
function soundName(name='',slot=1){
 const clean=String(name||'').replace(/\.[^.]+$/,'').trim();
 return clean||('Audio '+slot);
}
function formatSoundShortcut(chord=''){
 return String(chord||'').replace(/Key([A-Z])/g,'$1').replace(/Digit([0-9])/g,'$1').replace(/Numpad([0-9])/g,'Num $1');
}
function renderSoundPad(slot){
 const b=soundPad(slot);if(!b)return;
 const meta=soundboard.slots.get(slot),fade=soundFadeInput(slot),fadeLabel=fade?.closest('.sound-slot-fade');
 const label=String(meta?.label||'').trim()||soundName(meta?.name,slot);
 const shortcut=meta?.shortcut?formatSoundShortcut(meta.shortcut):'';
 const hint=shortcut?' · '+shortcut:'';
 b.classList.remove('empty','playing','paused','uploading','holding');
 const icon=b.querySelector('.sound-pad-icon'),title=b.querySelector('b'),small=b.querySelector('small');
 title.textContent=label;b.title=label+(shortcut?' · Atajo: '+shortcut:'');
 if(!meta||meta.empty){
  b.classList.add('empty');icon.textContent='＋';small.textContent='Vacío · subir'+hint;
  if(fade){fade.checked=true;fade.disabled=true}
  fadeLabel?.classList.add('disabled');
  return;
 }
 if(fade){fade.checked=meta.fade!==false;fade.disabled=false}
 fadeLabel?.classList.remove('disabled');
 if(soundboard.activeSlot===slot&&soundboard.audio){
  b.classList.add('playing');icon.textContent='■';
  small.textContent=soundboard.stopping?(soundFadeEnabled(slot)?'Desvaneciendo…':'Deteniendo…'):'Sonando'+hint;
 }else{icon.textContent='▶';small.textContent='Reproducir'+hint}
}
function renderSoundboard(){for(let i=1;i<=5;i++)renderSoundPad(i)}
async function loadSoundboard(){
 try{
  const r=await fetch('/api/soundboard',{cache:'no-store'}),d=await r.json();
  if(!r.ok)throw Error(d.error||'No se pudieron cargar los audios.');
  soundboard.slots.clear();
  for(const item of (d.slots||[]))soundboard.slots.set(Number(item.slot),item);
  renderSoundboard();
 }catch(e){console.warn('[soundboard]',e?.message||e)}
}
function cancelSoundEnvelope(){
 if(soundboard.envelopeFrame)cancelAnimationFrame(soundboard.envelopeFrame);
 soundboard.envelopeFrame=0;
}
function cancelManualSoundFade(){
 if(soundboard.manualFadeFrame)cancelAnimationFrame(soundboard.manualFadeFrame);
 soundboard.manualFadeFrame=0;
}
function startSoundEnvelope(audio,slot=soundboard.activeSlot){
 cancelSoundEnvelope();
 // Chrome detiene requestAnimationFrame al minimizar. No inicies un audio invisible a volumen 0.
 // Con GREÑA oculta reproducimos al volumen normal; el fade sigue intacto con la pestaña visible.
 if(!soundFadeEnabled(slot)||document.hidden){try{audio.volume=1}catch{};return}
 const tick=()=>{
  if(soundboard.audio!==audio||soundboard.stopping||audio.paused||audio.ended){soundboard.envelopeFrame=0;return}
  if(!soundFadeEnabled(slot)||document.hidden){
   try{audio.volume=1}catch{}
   soundboard.envelopeFrame=0;return;
  }
  const t=Math.max(0,Number(audio.currentTime)||0);
  const duration=Number(audio.duration);
  let level=Math.min(1,t/SOUNDBOARD_FADE_SECONDS);
  if(Number.isFinite(duration)&&duration>0){
   const remaining=Math.max(0,duration-t);
   level=Math.min(level,remaining/SOUNDBOARD_FADE_SECONDS);
  }
  try{audio.volume=Math.max(0,Math.min(1,level))}catch{}
  soundboard.envelopeFrame=requestAnimationFrame(tick);
 };
 soundboard.envelopeFrame=requestAnimationFrame(tick);
}
function fadeAudioToZero(audio,slot=soundboard.activeSlot,durationMs=SOUNDBOARD_MANUAL_FADE_MS){
 cancelManualSoundFade();
 if(!soundFadeEnabled(slot))return Promise.resolve();
 const from=Math.max(0,Math.min(1,Number(audio?.volume)||0));
 if(!audio||audio.paused||from<=.001)return Promise.resolve();
 if(document.hidden){try{audio.volume=0}catch{};return Promise.resolve()}
 return new Promise(resolve=>{
  let finished=false;
  const started=performance.now();
  const finish=()=>{
   if(finished)return;
   finished=true;
   document.removeEventListener('visibilitychange',onVisibility);
   if(soundboard.manualFadeFrame)cancelAnimationFrame(soundboard.manualFadeFrame);
   soundboard.manualFadeFrame=0;
   resolve();
  };
  const onVisibility=()=>{
   if(!document.hidden)return;
   try{audio.volume=0}catch{}
   finish();
  };
  document.addEventListener('visibilitychange',onVisibility);
  const step=now=>{
   if(finished)return;
   if(soundboard.audio!==audio){finish();return}
   if(document.hidden){onVisibility();return}
   const p=Math.max(0,Math.min(1,(now-started)/durationMs));
   try{audio.volume=from*(1-p)}catch{}
   if(p>=1){finish();return}
   soundboard.manualFadeFrame=requestAnimationFrame(step);
  };
  soundboard.manualFadeFrame=requestAnimationFrame(step);
 });
}
async function stopSoundboardAudio(reset=true,smooth=true){
 const audio=soundboard.audio,old=soundboard.activeSlot;
 if(!audio)return;
 soundboard.stopping=true;cancelSoundEnvelope();if(old)renderSoundPad(old);
 if(smooth&&soundFadeEnabled(old))await fadeAudioToZero(audio,old);
 if(soundboard.audio!==audio)return;
 try{audio.pause();if(reset)audio.currentTime=0;audio.volume=0}catch{}
 soundboard.audio=null;soundboard.activeSlot=0;soundboard.stopping=false;cancelManualSoundFade();
 if(old)renderSoundPad(old);
}
// Con la página oculta, Chrome no dibuja fotogramas: recuperar inmediatamente el volumen.
document.addEventListener('visibilitychange',()=>{
 const audio=soundboard.audio;
 if(!audio||soundboard.stopping||audio.paused)return;
 if(document.hidden){
  cancelSoundEnvelope();
  try{audio.volume=1}catch{}
 }else startSoundEnvelope(audio,soundboard.activeSlot);
});

async function toggleSound(slot){
 const meta=soundboard.slots.get(slot);
 if(!meta||meta.empty){openSoundPicker(slot);return}
 if(soundboard.activeSlot===slot&&soundboard.audio){
  if(!soundboard.stopping)await stopSoundboardAudio(true,soundFadeEnabled(slot));
  return;
 }
 if(soundboard.audio)await stopSoundboardAudio(true,soundFadeEnabled(soundboard.activeSlot));
 const audio=new Audio(meta.url);audio.preload='auto';audio.volume=soundFadeEnabled(slot)?0:1;
 soundboard.audio=audio;soundboard.activeSlot=slot;soundboard.stopping=false;
 audio.addEventListener('ended',()=>{
  if(soundboard.audio!==audio)return;
  cancelSoundEnvelope();cancelManualSoundFade();
  try{audio.currentTime=0;audio.volume=0}catch{}
  soundboard.audio=null;soundboard.activeSlot=0;soundboard.stopping=false;renderSoundPad(slot);
 });
 audio.addEventListener('error',()=>{
  if(soundboard.audio!==audio)return;
  cancelSoundEnvelope();cancelManualSoundFade();
  soundboard.audio=null;soundboard.activeSlot=0;soundboard.stopping=false;renderSoundPad(slot);toast('No se pudo reproducir ese audio.');
 });
 try{
  await audio.play();
  if(soundboard.audio!==audio)return;
  renderSoundPad(slot);startSoundEnvelope(audio,slot);
 }catch{
  soundboard.audio=null;soundboard.activeSlot=0;soundboard.stopping=false;renderSoundPad(slot);toast('No se pudo reproducir ese audio.');
 }
}
async function setSoundFade(slot,enabled){
 const meta=soundboard.slots.get(slot);
 if(!meta||meta.empty){renderSoundPad(slot);return}
 const previous=meta.fade!==false;meta.fade=!!enabled;renderSoundPad(slot);
 try{
  const r=await fetch('/api/soundboard/fade/'+slot,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!!enabled})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'No se pudo guardar el ajuste.');
  soundboard.slots.set(slot,d.slot);
  if(soundboard.activeSlot===slot&&soundboard.audio&&!soundboard.stopping){
   cancelSoundEnvelope();cancelManualSoundFade();
   if(d.slot.fade===false){try{soundboard.audio.volume=1}catch{}}
   else startSoundEnvelope(soundboard.audio,slot);
  }
  renderSoundPad(slot);toast(d.slot.fade===false?'Fade desactivado para Audio '+slot+'.':'Fade activado para Audio '+slot+'.');
 }catch(e){
  meta.fade=previous;renderSoundPad(slot);toast(e.message||'No se pudo guardar el fade.');
 }
}
document.querySelectorAll('[data-sound-fade]').forEach(input=>{
 const slot=Number(input.dataset.soundFade);
 input.addEventListener('change',()=>setSoundFade(slot,input.checked));
 input.addEventListener('click',e=>e.stopPropagation());
});

function soundChordFromEvent(e){
 const code=String(e.code||'');
 if(!/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-2]))$/.test(code))return '';
 if(!e.ctrlKey&&!e.altKey&&!e.metaKey&&!/^F(?:[1-9]|1[0-2])$/.test(code))return '';
 return [e.ctrlKey?'Ctrl':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null,e.metaKey?'Meta':null,code].filter(Boolean).join('+');
}
function openSoundConfig(slot){
 soundboard.configSlot=slot;
 const m=soundboard.slots.get(slot)||{};
 $('soundboardConfigTitle').textContent='Configurar botón '+slot;
 $('soundboardCustomName').value=String(m.label||'');
 soundboard.configShortcut=String(m.shortcut||'');
 $('soundboardShortcut').value=formatSoundShortcut(soundboard.configShortcut);
 $('soundboardConfigDialog')?.showModal();
}
document.querySelectorAll('[data-sound-config]').forEach(btn=>btn.addEventListener('click',()=>openSoundConfig(Number(btn.dataset.soundConfig))));
$('soundboardShortcut')?.addEventListener('keydown',e=>{
 if(e.key==='Escape')return;
 e.preventDefault();e.stopPropagation();
 if(e.key==='Backspace'||e.key==='Delete'){soundboard.configShortcut='';$('soundboardShortcut').value='';return}
 const chord=soundChordFromEvent(e);
 if(chord){soundboard.configShortcut=chord;$('soundboardShortcut').value=formatSoundShortcut(chord)}
});
$('soundboardClearShortcut')?.addEventListener('click',()=>{soundboard.configShortcut='';$('soundboardShortcut').value=''});
$('soundboardConfigCancel')?.addEventListener('click',()=>{soundboard.configSlot=0;$('soundboardConfigDialog')?.close()});
$('soundboardConfigDialog')?.addEventListener('close',()=>{soundboard.configSlot=0});
$('soundboardConfigSave')?.addEventListener('click',async()=>{
 const slot=soundboard.configSlot;if(!slot)return;
 const label=$('soundboardCustomName').value.trim().slice(0,32),shortcut=soundboard.configShortcut;
 const btn=$('soundboardConfigSave');btn.disabled=true;
 try{
  const r=await fetch('/api/soundboard/config/'+slot,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label,shortcut})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'No se pudo guardar la configuración.');
  soundboard.slots.set(slot,d.slot);renderSoundPad(slot);
  $('soundboardConfigDialog')?.close();toast('Botón '+slot+' configurado.');
 }catch(e){toast(e.message||'Error al guardar configuración.')}finally{btn.disabled=false}
});
document.addEventListener('keydown',e=>{
 if(e.repeat||e.isComposing||e.defaultPrevented)return;
 const target=e.target;
 if(target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName||'')||document.querySelector('dialog[open]'))return;
 const chord=soundChordFromEvent(e);if(!chord)return;
 for(let slot=1;slot<=5;slot++){
  if(soundboard.slots.get(slot)?.shortcut===chord){e.preventDefault();toggleSound(slot);return}
 }
});
document.addEventListener('grena-global-hotkey',e=>{
 const slot=Number(e.detail?.slot);
 if(Number.isInteger(slot)&&slot>=1&&slot<=5)toggleSound(slot);
});

function openSoundPicker(slot){
 soundboard.uploadSlot=slot;
 const input=$('soundboardFile');if(!input)return;
 input.value='';input.click();
}
function showReplaceSoundDialog(slot){
 const meta=soundboard.slots.get(slot);if(!meta||meta.empty)return;
 soundboard.replaceSlot=slot;
 $('soundboardReplaceTitle').textContent='Reemplazar Audio '+slot;
 $('soundboardReplaceName').textContent='Actual: '+String(meta.name||('Audio '+slot))+' · el audio nuevo ocupará este mismo botón.';
 const dialog=$('soundboardReplaceDialog');
 if(dialog?.showModal)dialog.showModal();else openSoundPicker(slot);
}
function cancelSoundHold(){
 clearTimeout(soundboard.holdTimer);soundboard.holdTimer=null;
 if(soundboard.holdButton)soundboard.holdButton.classList.remove('holding');
 soundboard.holdButton=null;
}
document.querySelectorAll('.sound-pad').forEach(btn=>{
 const slot=Number(btn.dataset.soundSlot);
 btn.addEventListener('click',e=>{
  if(soundboard.suppressClick===slot){soundboard.suppressClick=0;e.preventDefault();return}
  toggleSound(slot);
 });
 btn.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const meta=soundboard.slots.get(slot);if(!meta||meta.empty)return;
  cancelSoundHold();soundboard.holdButton=btn;btn.classList.add('holding');
  soundboard.holdTimer=setTimeout(()=>{
   soundboard.holdTimer=null;soundboard.suppressClick=slot;btn.classList.remove('holding');soundboard.holdButton=null;
   showReplaceSoundDialog(slot);
  },5000);
 });
 ['pointerup','pointercancel','pointerleave'].forEach(ev=>btn.addEventListener(ev,cancelSoundHold));
 btn.addEventListener('contextmenu',e=>e.preventDefault());
});
$('soundboardReplaceCancel')?.addEventListener('click',()=>{$('soundboardReplaceDialog')?.close();soundboard.replaceSlot=0});
$('soundboardReplaceConfirm')?.addEventListener('click',async()=>{
 const slot=soundboard.replaceSlot;$('soundboardReplaceDialog')?.close();soundboard.replaceSlot=0;
 if(slot){if(soundboard.activeSlot===slot)await stopSoundboardAudio(true,soundFadeEnabled(slot));openSoundPicker(slot)}
});
$('soundboardReplaceDialog')?.addEventListener('cancel',()=>{soundboard.replaceSlot=0});
$('soundboardFile')?.addEventListener('change',async e=>{
 const file=e.target.files?.[0],slot=soundboard.uploadSlot;soundboard.uploadSlot=0;
 if(!file||!slot)return;
 if(file.size>15*1024*1024){toast('Ese audio pesa más de 15 MB.');return}
 const ext=(file.name.match(/\.[^.]+$/)?.[0]||'').toLowerCase();
 if(!['.mp3','.wav','.ogg','.m4a','.aac','.webm'].includes(ext)){toast('Usa MP3, WAV, OGG, M4A, AAC o WEBM.');return}
 const btn=soundPad(slot);btn?.classList.add('uploading');if(btn?.querySelector('small'))btn.querySelector('small').textContent='Guardando audio…';
 try{
  const r=await fetch('/api/soundboard/slot/'+slot,{method:'POST',headers:{'content-type':file.type||'application/octet-stream','x-grena-filename':encodeURIComponent(file.name)},body:file});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'No se pudo guardar el audio.');
  soundboard.slots.set(slot,d.slot);renderSoundPad(slot);toast('Audio '+slot+' guardado.');
 }catch(err){renderSoundPad(slot);toast(err.message||'No se pudo guardar el audio.')}
});

(async()=>{if(!(await initAccount()))return;await loadInitial();await loadSoundboard();connectCore();connectChatEngine();const m=moduleFromHash();if(m)openModule(m,{updateHash:false})})();
