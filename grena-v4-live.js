/* GREÑA LIVE 6.0 — Adaptador REAL para la plantilla V4 (3).
 * No importa CSS antiguo ni reconstruye tarjetas del dashboard.
 * La fuente visual y los nueve paneles son el HTML original del usuario.
 * Datos: endpoints autorizados del backend GREÑA (sin simuladores).
 */
(()=>{
'use strict';
const el=id=>document.getElementById(id);
const Q=(css,root=document)=>root.querySelector(css);
const QA=(css,root=document)=>[...root.querySelectorAll(css)];
const PLATFORM={tiktok:'tt',twitch:'tw',kick:'kk',youtube:'yt'};
const FULL={tt:'tiktok',tw:'twitch',kk:'kick',yt:'youtube'};
const NAME={tt:'TikTok',tw:'Twitch',kk:'Kick',yt:'YouTube'};
const EC={follow:'💛',gift:'🎁',sub:'⭐',cheer:'💎',raid:'🚀',share:'↗',like:'♥'};
const persistent={account:null,license:null,status:{},bridge:{},eventsHealth:{},viewers:{tiktok:0,twitch:0,kick:0,youtube:0},activity:[],chatCursor:'',chats:new Set(),board:[],audio:null,audioSlot:0,voiceFrame:null,observer:null,alertSettings:null,catalog:null,cam:null,minecraft:null,lanUrl:'',obsToken:null,connected:false};
const NO_TEST=window.location.pathname==='/index.html'||window.location.pathname==='/';
const now=()=>Date.now();
const api=async (path,{method='GET',body,raw=false}={})=>{
  const opts={method,cache:'no-store',credentials:'same-origin'};
  if(body!==undefined){
    if(raw){opts.body=body;opts.headers={'content-type':body.type||'application/octet-stream','x-grena-filename':encodeURIComponent(body.name||'audio.mp3')};}
    else{opts.headers={'content-type':'application/json'};opts.body=JSON.stringify(body);}
  }
  const resp=await fetch(path,opts);
  let data={};try{data=await resp.json()}catch{}
  if(!resp.ok||data.ok===false)throw new Error(String(data.error||`GREÑA no respondió (${resp.status})`).slice(0,250));
  return data;
};
const text=(node,v)=>{if(node)node.textContent=String(v??'')};
const fmt=n=>Math.max(0,Number(n)||0).toLocaleString('es-DO');
const badge=(node,on)=>{if(node){node.classList.toggle('on',!!on);node.setAttribute('aria-pressed',String(!!on))}};
const inform=message=>{if(typeof window.toast==='function')window.toast(message);else console.warn(message)};
const fail=e=>inform(e?.message||'No se pudo completar la operación');
const safeName=x=>String(x||'Usuario').slice(0,90);
const clock=t=>{try{return new Date(t||Date.now()).toLocaleTimeString('es-DO',{hour:'2-digit',minute:'2-digit'})}catch{return 'ahora'}};
const nameKey=x=>String(x||'').replace(/^@/,'').trim();
const stateSnapshot=()=>({profile:persistent.account?.user||null,status:persistent.status,bridge:persistent.bridge,viewers:persistent.viewers});
window.__GRENA_V4_LIVE_READONLY__=()=>JSON.parse(JSON.stringify(stateSnapshot()));

// Dialogs are constructed with the template's own premium-shade / premium-dialog DOM and CSS.
const modal=el('premiumOverlay'),mbody=el('premiumBody'),mfooter=el('premiumFooter');
function hideDialog(){modal.hidden=true;mbody.replaceChildren();mfooter.replaceChildren()}
function dialog(title,subtitle,html,actions=[]){
  text(el('premiumTitle'),title);text(el('premiumSub'),subtitle||'GREÑA Live · configuración real');
  el('premiumBack').hidden=true;mbody.innerHTML=html;mfooter.replaceChildren();
  for(const item of actions){const btn=document.createElement('button');btn.className='btn'+(item.primary?' go':'');btn.type='button';btn.textContent=item.label;btn.addEventListener('click',()=>Promise.resolve().then(item.action).catch(fail));mfooter.appendChild(btn)}
  modal.hidden=false;
}
el('premiumClose').addEventListener('click',hideDialog);
modal.addEventListener('click',e=>{if(e.target===modal)hideDialog()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)hideDialog()});

// ---- Identidad y licencias del GREÑA ID auténtico ----
async function loadIdentity(){
  let d;
  try{d=await api('/api/account/me')}catch(e){if(NO_TEST)location.replace('/login.html');throw e}
  if(!d.authenticated||!d.user||!d.active){if(NO_TEST)location.replace('/login.html');throw Error('La sesión GREÑA ID requiere autenticación')}
  persistent.account=d;const u=d.user;
  text(el('profileName'),u.displayName||u.username);text(el('profileHandle'),'@'+u.username);
  const avatar=el('userAvatar');avatar.textContent=String(u.displayName||u.username||'G').trim().slice(0,1).toUpperCase();
  const key='grena-avatar:'+u.id;try{const photo=localStorage.getItem(key);if(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo||'')){avatar.style.backgroundImage='url('+photo+')';avatar.style.backgroundSize='cover';avatar.style.backgroundPosition='center';avatar.textContent=''}}catch{}
  try{persistent.license=await api('/api/license/status')}catch{persistent.license=null}
  const license=persistent.license||{},pill=el('licenseBadge');
  pill.classList.remove('license-admin','license-beta','license-user','license-expired');
  let label='GREÑA ID';let kind='license-user';
  const licenceRecord=license.license||{};
  if(license.permanentAccess===true){label='✦ ADMINISTRADOR';kind='license-admin'}
  else if(license.allowed===true&&licenceRecord.kind==='beta'&&licenceRecord.active===true){label='✦ BETA';kind='license-beta'}
  else if(licenceRecord.active===true&&Number.isFinite(Number(licenceRecord.expiresAt))){
    const days=Math.max(0,Math.ceil((Number(licenceRecord.expiresAt)-Date.now())/86400000));
    label=days+' '+(days===1?'DÍA RESTANTE':'DÍAS RESTANTES');kind=days?'license-user':'license-expired';
  }else if(licenceRecord.expired===true){label='LICENCIA VENCIDA';kind='license-expired'}
  else if(!license.allowed){label='LICENCIA NO ACTIVA';kind='license-expired'}
  pill.classList.add(kind);pill.textContent=label;
  startVoiceEngine(u.id);
}
function profileModal(){
  const u=persistent.account?.user;if(!u)return;
  const name=String(u.displayName||u.username||'Usuario');
  dialog('Mi GREÑA ID','Cuenta autenticada · '+name,`<div class="prem-grid">
    <button class="prem-tile" data-profile="photo"><span class="emoji">📷</span><b>Foto del perfil</b><small>Actualizar la imagen dentro del círculo</small></button>
    <button class="prem-tile" data-profile="fish"><span class="emoji">🎙️</span><b>Fish Audio</b><small>API personal, cifrada en GREÑA</small></button>
    <button class="prem-tile" data-profile="license"><span class="emoji">✦</span><b>Licencia</b><small>Ver tu suscripción y renovación</small></button>
    <button class="prem-tile" data-profile="switch"><span class="emoji">👥</span><b>Cambiar cuenta</b><small>Inicio de sesión con otro GREÑA ID</small></button>
    ${persistent.license?.permanentAccess===true?'<button class="prem-tile" data-profile="admin"><span class="emoji">🛡️</span><b>Administración</b><small>Administrar usuarios y licencias</small></button>':''}
    <button class="prem-tile" data-profile="exit"><span class="emoji">🚪</span><b>Salir de GREÑA</b><small>Cerrar sesión o aplicación</small></button>
  </div>`);
  QA('[data-profile]',mbody).forEach(btn=>btn.addEventListener('click',async()=>{
    const a=btn.dataset.profile;
    if(a==='photo'){choosePhoto();return}
    if(a==='fish'){openFishCredentials();return}
    if(a==='license'){window.open('/license.html','_blank','noopener');return}
    if(a==='admin'){window.open('/license-admin.html','_blank','noopener');return}
    if(a==='switch'){location.assign('/login.html?switch=1');return}
    if(a==='exit'){
      hideDialog();if(!confirm('¿Quieres cerrar GREÑA Live?'))return;
      try{await api('/api/app/exit',{method:'POST',body:{}})}catch{await api('/api/account/logout',{method:'POST'});location.assign('/login.html')}
    }
  }));
}
el('profileTrigger').addEventListener('click',profileModal);
function choosePhoto(){
  const input=document.createElement('input');input.type='file';input.accept='image/*';
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    if(file.size>12*1024*1024)return inform('La fotografía supera los 12 MB');
    const bmp=await createImageBitmap(file);const size=256;
    const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
    const ctx=canvas.getContext('2d');const scale=Math.max(size/bmp.width,size/bmp.height);
    ctx.drawImage(bmp,(size-bmp.width*scale)/2,(size-bmp.height*scale)/2,bmp.width*scale,bmp.height*scale);
    const data=canvas.toDataURL('image/jpeg',.84);localStorage.setItem('grena-avatar:'+persistent.account.user.id,data);
    const avatar=el('userAvatar');avatar.style.backgroundImage='url('+data+')';avatar.style.backgroundSize='cover';avatar.textContent='';hideDialog();inform('Foto actualizada en este perfil GREÑA ID');
  });input.click();
}
async function openFishCredentials(){
  let info;try{info=await api('/api/license/fish-credentials')}catch(e){info={configured:false,warning:e.message}}
  dialog('API personal · Fish Audio','La clave se guarda en GREÑA, nunca en esta plantilla',`<div class="prem-note">${info.warning?'Servicio: '+String(info.warning).replace(/[<>]/g,''):(info.configured?'La API está vinculada. Se puede reemplazar o quitar.':'No hay una API vinculada.')}</div>
    <label class="prem-field">API privada de Fish Audio<input id="v4FishKey" type="password" autocomplete="new-password" maxlength="512" placeholder="Pega tu API privada"></label>`,[
    {label:'Cancelar',action:hideDialog},
    ...(info.configured?[{label:'Quitar API',action:async()=>{await api('/api/license/fish-credentials',{method:'DELETE'});inform('Clave desvinculada');hideDialog()}}]:[]),
    {label:'Guardar API',primary:true,action:async()=>{const key=el('v4FishKey').value.trim();if(key.length<20)throw Error('La clave debe contener al menos 20 caracteres');await api('/api/license/fish-credentials',{method:'POST',body:{apiKey:key}});el('v4FishKey').value='';inform('Clave guardada de forma segura en GREÑA');hideDialog()}}
  ]);
}

// ---- El motor de voz existente vive en UN iframe invisible y único.
// Nada de arrastrar a la pantalla la interfaz antigua ni crear motores duplicados.
function startVoiceEngine(id){
  if(persistent.voiceFrame)return;
  const frame=document.createElement('iframe');frame.id='grenaV4VoiceEngine';frame.title='Motor de Fish Audio';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
  frame.style.cssText='position:fixed;left:-1800px;top:-1800px;width:650px;height:480px;opacity:0;pointer-events:none;border:0;z-index:-1';
  frame.src=location.origin+'/chat/?embed=1&profile='+encodeURIComponent(id);
  frame.addEventListener('load',()=>{
    try{const v=frame.contentDocument?.getElementById('voiceEnabled');if(v){badge(el('vsw'),v.checked);el('wave').classList.toggle('on',v.checked);v.addEventListener('change',()=>{badge(el('vsw'),v.checked);el('wave').classList.toggle('on',v.checked)})}}catch{}
  });
  document.body.appendChild(frame);persistent.voiceFrame=frame;
}
function voiceControl(id){try{return persistent.voiceFrame?.contentDocument?.getElementById(id)}catch{return null}}
function setVoiceControl(id,value){const input=voiceControl(id);if(!input)throw Error('El motor de voz está conectándose.');if(input.type==='checkbox')input.checked=!!value;else input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
const vsw=el('vsw');vsw.setAttribute('aria-pressed','false');vsw.classList.remove('on');el('wave').classList.remove('on');
vsw.addEventListener('click',e=>{e.stopPropagation();try{setVoiceControl('voiceEnabled',!voiceControl('voiceEnabled')?.checked)}catch(err){fail(err)}});
Q('.side .voice').addEventListener('click',e=>{if(e.target.closest('#vsw'))return;openVoiceModal()});
Q('.side .voice').style.cursor='pointer';Q('.side .voice').title='Abrir ajustes reales de Fish Audio';
function openVoiceModal(){
  const enabled=voiceControl('voiceEnabled');if(!enabled){inform('El motor de voz sigue conectando.');return}
  const value=id=>voiceControl(id)?.value||'';
  const checked=id=>voiceControl(id)?.checked===true;
  const voiceChoices=voiceControl('voiceSelect')?.options||[];
  const options=[...voiceChoices].map(o=>`<option value="${String(o.value).replaceAll('"','&quot;')}">${String(o.textContent).replace(/[<>]/g,'')}</option>`).join('');
  dialog('Chat de voz · Fish Audio','Configuración real del motor actual · 4 segundos fijos por usuario',`<div class="prem-note">Este panel controla el chat de voz existente, sin crear una segunda voz ni modificar la espera fija de 4 s.</div>
    <div class="prem-row"><span><b>Activar voz</b></span><button id="v4VoiceEnabled" type="button" class="sw ${checked('voiceEnabled')?'on':''}" aria-label="Activar voz"></button></div>
    <div class="prem-row"><span><b>Leer nombre del usuario</b></span><button id="v4ReadName" type="button" class="sw ${checked('voiceReadUsername')?'on':''}" aria-label="Leer nombre del usuario"></button></div>
    <label class="prem-field">Motor y voz<select id="v4VoiceSelect">${options}</select></label>
    <label class="prem-field">Velocidad de voz<input type="range" id="v4VoiceRate" min="0.6" max="1.6" step="0.05" value="${value('voiceRate')||1}"></label>
    <label class="prem-field">Volumen<input type="range" id="v4VoiceVolume" min="0" max="1" step="0.05" value="${value('voiceVolume')||1}"></label>
    <label class="prem-field">Filtro de idiomas<select id="v4VoiceLang"><option value="all">Todos</option><option value="es">Español</option><option value="en">Inglés</option><option value="es-en">Español e inglés</option></select></label>
    <div class="prem-label">Cinco voces Fish Audio</div>
    ${[1,2,3,4,5].map(i=>`<label class="prem-field">Voz ${i} · ID<input id="v4FishModel${i}" type="text" autocomplete="off" spellcheck="false" maxlength="128"></label>`).join('')}`,[
      {label:'Cerrar',action:hideDialog},{label:'Guardar en GREÑA',primary:true,action:()=>{
        setVoiceControl('voiceEnabled',el('v4VoiceEnabled').classList.contains('on'));
        setVoiceControl('voiceReadUsername',el('v4ReadName').classList.contains('on'));
        setVoiceControl('voiceSelect',el('v4VoiceSelect').value);
        setVoiceControl('voiceRate',el('v4VoiceRate').value);
        setVoiceControl('voiceVolume',el('v4VoiceVolume').value);
        setVoiceControl('voiceLanguageFilter',el('v4VoiceLang').value);
        for(let i=1;i<=5;i++)if(voiceControl('fishModelId'+i))setVoiceControl('fishModelId'+i,el('v4FishModel'+i).value.trim());
        hideDialog();inform('Configuración guardada en el motor de voz');
      }}]);
  for(const [id,target] of [['v4VoiceEnabled','voiceEnabled'],['v4ReadName','voiceReadUsername']])el(id).addEventListener('click',e=>badge(e.currentTarget,!e.currentTarget.classList.contains('on')));
  el('v4VoiceSelect').value=value('voiceSelect');el('v4VoiceLang').value=['all','es','en','es-en'].includes(value('voiceLanguageFilter'))?value('voiceLanguageFilter'):'all';
  for(let i=1;i<=5;i++)text(el('v4FishModel'+i),'');
  for(let i=1;i<=5;i++)el('v4FishModel'+i).value=value('fishModelId'+i);
}

// ---- Conexiones reales, espectadores, mensajes y eventos ----
function renderPlatforms(){
  for(const item of PL){
    const p=FULL[item[0]],s=persistent.status[p]||{};
    const auth=!!s.authenticated,live=!!(persistent.bridge[p]||s.runtimeConnected),linked=auth||live;
    item[1]=auth?((s.account||NAME[item[0]])+' · cuenta vinculada'):(live?'Chat en directo conectado':'Sin cuenta vinculada');
    item[2]=linked?1:0;item[3]=live?'ok':auth?'warn':'';
    if(LV[item[0]]){LV[item[0]][0]=item[1];LV[item[0]][1]=live?1:0;LV[item[0]][2]=Number(persistent.viewers[p]||0)}
  }
  pl();lv();
  // The V4 markup is preserved; only its button callbacks are attached to actual APIs.
  QA('#plats button[data-i]').forEach(btn=>btn.addEventListener('click',()=>platformAction(PL[Number(btn.dataset.i)]?.[0])));
  QA('#lv button[data-k]').forEach(btn=>btn.addEventListener('click',()=>platformAction(btn.dataset.k)));
  // Status in the V4 Alerts section is live, never a static 'No conectado'.
  const badges=QA('#pg4 .g2 .card:nth-child(1) .tag');
  ['tiktok','twitch','kick'].forEach((p,i)=>{const s=persistent.status[p]||{},ready=!!(s.authenticated||persistent.bridge[p]);if(badges[i]){badges[i].textContent=ready?'Vinculado':'No conectado';badges[i].style.color=ready?'var(--ok)':'var(--bad)'}});
}
async function platformAction(key){
  const p=FULL[key];if(!p)return;
  const title=NAME[key];const status=persistent.status[p]||{};
  try{
    if(status.authenticated){
      if(!confirm('¿Desconectar '+title+' de GREÑA Live?'))return;
      await api('/api/disconnect/'+p,{method:'POST'});inform(title+' desconectado');await refreshStatus();return;
    }
    if(p==='tiktok'){
      dialog('Conectar TikTok LIVE','Pega el enlace real del LIVE o tu usuario',`<label class="prem-field">TikTok LIVE<input id="v4TikTokUrl" placeholder="https://www.tiktok.com/@usuario/live" autocomplete="off"></label>`,[
        {label:'Cancelar',action:hideDialog},
        {label:'Conectar LIVE',primary:true,action:async()=>{const url=el('v4TikTokUrl').value.trim();if(!url)throw Error('Falta el enlace de TikTok LIVE');await api('/api/tiktok/live-link',{method:'POST',body:{url}});hideDialog();inform('TikTok vinculado al LIVE');await refreshStatus()}}
      ]);return;
    }
    if(p==='youtube'){
      const diagnostic=await api('/api/youtube/diagnostic');
      if(!diagnostic.brokerEnabled)throw Error(diagnostic.workerError||'YouTube OAuth no está disponible');
    }
    const popup=window.open('/oauth/'+p+'/start','grena_oauth_'+p,'width=640,height=780');
    if(!popup)throw Error('Permite la ventana de autorización para '+title);
    inform('Autoriza '+title+' para GREÑA Live');
    const check=setInterval(()=>{if(popup.closed){clearInterval(check);refreshStatus().catch(()=>{})}},600);
  }catch(e){fail(e)}
}
function renderAudience(){
  const vs=persistent.viewers||{},keys=['tiktok','twitch','kick','youtube'];
  const numbers=keys.map(k=>Math.max(0,Number(vs[k])||0));const total=numbers.reduce((a,b)=>a+b,0);
  text(el('tot'),fmt(total));text(el('fl'),fmt(total));
  const legend=el('leg');legend.replaceChildren();
  const colors=['tt','tw','kk','yt'];
  numbers.forEach((count,i)=>{const span=document.createElement('span');span.className=colors[i];span.innerHTML=ic(colors[i]);const value=document.createElement('b');value.style.color='var(--t)';value.textContent=fmt(count);const label=document.createElement('em');label.textContent=NAME[colors[i]];span.append(value,label);legend.appendChild(span)});
  const segments=QA('#split i'),sum=Math.max(1,total);
  segments.forEach((n,i)=>n.style.flex=String(total?Math.max(0,numbers[i]/sum):0.0001));
  const previous=D.at(-1)||0;
  if(persistent.firstAudience===undefined){D.fill(total);persistent.firstAudience=true;persistent.lastMinuteCount=total;persistent.lastMinuteAt=Date.now()}
  else {D.push(total);while(D.length>30)D.shift()}
  draw();
  if(!persistent.lastMinuteAt||Date.now()-persistent.lastMinuteAt>=60000){persistent.lastMinuteAt=Date.now();persistent.lastMinuteCount=previous}
  const delta=total-(persistent.lastMinuteCount??total);const d=el('dl');
  text(d,(delta>=0?'▲ +':'▼ ')+fmt(Math.abs(delta))+' en el último minuto');d.style.color=delta>=0?'var(--ok)':'var(--bad)';
  // Preserve the EXACT original V4 livebadge DOM: green dot, spacing and typography.
  const live=keys.some(k=>persistent.bridge[k]||persistent.status[k]?.runtimeConnected);
  const liveBadge=Q('.hero .livebadge');
  if(liveBadge){
    let label=liveBadge.querySelector('[data-live-label]');
    if(!label){
      for(const child of [...liveBadge.childNodes])if(child.nodeType===3)child.remove();
      label=document.createElement('span');label.dataset.liveLabel='';liveBadge.appendChild(label);
    }
    label.textContent=live?'EN VIVO AHORA':'ESPERANDO DIRECTO';
    const dot=liveBadge.querySelector('.dot');
    if(dot)dot.classList.toggle('ok',!!live);
    liveBadge.classList.toggle('is-offline',!live);
  }
}
function addActivityRecord(item){
  if(!item||!item.platform)return;
  const marker=[item.platform,item.event,item.name,item.receivedAt].join('|');
  if(persistent.activity.some(v=>v.__marker===marker))return;
  persistent.activity.unshift({...item,__marker:marker});
  if(persistent.activity.length>80)persistent.activity.length=80;
}
function renderActivity(){
  const list=el('ev');text(el('evc'),persistent.activity.length+' eventos');list.replaceChildren();
  if(!persistent.activity.length){const div=document.createElement('div');div.className='empty';div.style.cssText='padding:18px 0';div.textContent='⚡ Esperando actividad real de tus directos.';list.appendChild(div);return}
  for(const a of persistent.activity.slice(0,55)){
    const row=document.createElement('div');row.className='evi';
    const emo=document.createElement('span');emo.className='e';emo.textContent=EC[a.event]||'⚡';
    const body=document.createElement('div'),label=document.createElement('b'),detail=document.createElement('small');
    label.textContent=safeName(a.name||a.user)+' · '+(a.platform||'');
    let note=String(a.action||a.message||'Evento recibido');
    if(a.event==='gift'&&a.giftName)note+=' · '+a.giftName+(a.count>1?' ×'+a.count:'');
    if(a.event==='cheer'&&Number(a.bits)>0)note+=' · '+fmt(a.bits)+' Bits';
    detail.textContent=note+' · '+clock(a.receivedAt);
    body.append(label,detail);row.append(emo,body);list.appendChild(row);
  }
}
function chatPlatform(value){return PLATFORM[String(value||'').toLowerCase()]||''}
function appendChat(m){
  if(!m||m.type!=='chat')return;
  const key=String(m._historyId||m._historyCursor||[m.platform,m.user,m.text,m.messageId,m.timestamp].join('|'));
  if(persistent.chats.has(key))return;
  persistent.chats.add(key);if(persistent.chats.size>5000)persistent.chats.delete(persistent.chats.values().next().value);
  const platform=chatPlatform(m.platform);if(!platform)return;
  const row=document.createElement('div');row.className='msg';row.dataset.p=platform;
  const av=document.createElement('div');av.className='mav '+platform;av.innerHTML=ic(platform);
  const inner=document.createElement('div'),name=document.createElement('b'),time=document.createElement('small'),message=document.createElement('p');
  name.className=platform;name.textContent=safeName(m.nickname&&m.nickname!=='Usuario'?m.nickname:m.user);
  time.textContent='ahora';message.textContent=String(m.text||'(mensaje sin texto)');
  inner.append(name,time,message);
  const mod=document.createElement('button');mod.className='mod';mod.textContent='Silenciar';mod.title='Silenciar usuario en GREÑA';
  mod.addEventListener('click',async e=>{
    e.stopPropagation();const username=String(m.user||m.nickname||'').replace(/^@/,'').trim();
    if(!username)return inform('No se puede identificar a este usuario');
    if(!confirm('¿Silenciar a '+username+' en GREÑA Live?'))return;
    try{await api('/api/moderation/action',{method:'POST',body:{platform:m.platform,action:'mute_local',username,userId:String(m.userId||'')}});QA('#feed .msg').forEach(x=>{if(x.dataset.user===username&&x.dataset.p===platform)x.remove()});inform('Usuario silenciado en GREÑA')}catch(err){fail(err)}
  });row.dataset.user=String(m.user||m.nickname||'').replace(/^@/,'').trim();row.append(av,inner,mod);
  el('feed').appendChild(row);
  const visible=pf==='all'||pf===platform;row.style.display=visible&&row.textContent.toLowerCase().includes(qs)?'':'none';
  while(el('feed').children.length>300)el('feed').firstElementChild.remove();
  if(visible)el('feed').scrollTop=el('feed').scrollHeight;
}
let pollingChat=false;
async function refreshChat(){
  if(pollingChat||!persistent.account)return;pollingChat=true;
  try{
    let batch=0;
    for(let page=0;page<4;page++){
      const qs=new URLSearchParams({limit:'150'});if(persistent.chatCursor)qs.set('after',persistent.chatCursor);
      const data=await api('/api/chat/live-messages?'+qs);
      if(data.gap){persistent.chatCursor='';continue}
      for(const m of data.messages||[]){appendChat(m);batch++}
      if(data.cursor)persistent.chatCursor=data.cursor;
      if(!data.more||!data.messages?.length)break;
    }
  }catch(e){/* GREÑA Chat puede estar reiniciando: se reintentará con el mismo cursor. */}
  finally{pollingChat=false}
}
let refreshing=false;
async function refreshStatus(){
  if(refreshing||!persistent.account)return;refreshing=true;
  try{
    const [s,a,v]=await Promise.all([api('/api/status'),api('/api/activity?limit=60'),api('/api/viewers')]);
    persistent.status=s.status||{};persistent.bridge=s.bridgeRuntime||{};persistent.eventsHealth=s.eventHealth||{};
    persistent.viewers=v.viewers||{};
    for(const entry of (a.activity||[]).slice().reverse())addActivityRecord(entry);
    renderPlatforms();renderAudience();renderActivity();persistent.connected=true;
  }catch(e){persistent.connected=false;console.warn('[GREÑA V4] Actualizando sistemas:',e.message)}
  finally{refreshing=false}
}
let liveWS=null,liveRetry=null;
function connectLiveSocket(){
  if(!persistent.account)return;
  try{
    const sock=new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/');liveWS=sock;
    sock.addEventListener('message',e=>{
      let d;try{d=JSON.parse(e.data)}catch{return}
      if(d.type==='hello'||d.type==='platform-status'||d.type==='event-health'){
        if(d.status)persistent.status=d.status;
        if(d.bridgeRuntime)persistent.bridge=d.bridgeRuntime;
        if(d.eventHealth)persistent.eventsHealth=d.eventHealth;
        if(d.viewers)persistent.viewers=d.viewers;
        renderPlatforms();renderAudience();
      }
      if(d.type==='viewers'){persistent.viewers=d.viewers||persistent.viewers;renderAudience()}
      if(d.type==='activity'&&d.activity){addActivityRecord(d.activity);renderActivity()}
      if(d.type==='profile-changed'&&d.profile&&d.profile.id!==persistent.account?.user?.id)location.assign('/login.html');
    });
    sock.addEventListener('close',()=>{clearTimeout(liveRetry);liveRetry=setTimeout(connectLiveSocket,1500)});
    sock.addEventListener('error',()=>{try{sock.close()}catch{}});
  }catch(e){clearTimeout(liveRetry);liveRetry=setTimeout(connectLiveSocket,1500)}
}

const alertSamples={
  'Follow':{platform:'TikTok',event:'follow',name:'USUARIO_PRUEBA',action:'te siguió'},
  'Rosa ×5':{platform:'TikTok',event:'gift',name:'USUARIO_PRUEBA',giftName:'Rosa',count:5,totalDiamonds:5,unitDiamonds:1,action:'envió Rosa ×5'},
  'Sub':{platform:'Twitch',event:'sub',name:'USUARIO_PRUEBA',action:'se suscribió'},
  '500 Bits':{platform:'Twitch',event:'cheer',name:'USUARIO_PRUEBA',bits:500,action:'envió 500 Bits'},
  'Raid':{platform:'Twitch',event:'raid',name:'USUARIO_PRUEBA',viewers:25,action:'envió una raid de 25 espectadores'}
};
QA('#tg button:not(#obs)').forEach(b=>b.addEventListener('click',async()=>{
  const payload=alertSamples[b.textContent.trim()];if(!payload)return;
  try{await api('/api/alert',{method:'POST',body:payload});inform('Alerta de prueba enviada a OBS')}catch(e){fail(e)}
}));
async function overlayUrl(path='/overlay.html'){
  const d=await api('/api/obs-token');if(!d.token)throw Error('No se recibió el enlace privado OBS');
  const url=new URL(path,location.origin);url.searchParams.set('obs',d.token);return url.href;
}
async function copyLink(url){if(!url)throw Error('No hay enlace disponible para copiar');try{await navigator.clipboard.writeText(url)}catch{const input=document.createElement('textarea');input.value=url;input.style.position='fixed';input.style.left='-3000px';document.body.appendChild(input);input.select();if(!document.execCommand('copy'))throw Error('No se pudo copiar');input.remove()}inform('Enlace copiado')}
el('obs').addEventListener('click',async()=>{try{await copyLink(await overlayUrl())}catch(e){fail(e)}});

// ---- Soundboard real de GREÑA: cinco slots y persistencia por GREÑA ID ----
const slotElement=i=>QA('#prow .pad')[i-1];
function setActiveSlot(n){
  for(let i=1;i<=5;i++){
    const node=slotElement(i);if(!node)continue;
    node.classList.toggle('on',i===n);text(node.querySelector('.play'),i===n?'■':'▶');
  }
}
function renderBoard(){
  for(let i=1;i<=5;i++){
    const m=persistent.board.find(s=>s.slot===i)||{empty:true,slot:i};const node=slotElement(i);if(!node)continue;
    const name=node.querySelector('b'),sub=node.querySelector('small');
    text(name,m.label||'Audio '+i);text(sub,m.empty?'Vacío · subir':(m.name||'Audio guardado')+(m.shortcut?' · '+m.shortcut:''));
    node.title=m.empty?'Clic para subir audio':'Clic para reproducir · clic derecho para configurar';
  }
}
async function refreshBoard(){try{const d=await api('/api/soundboard');persistent.board=d.slots||[];renderBoard()}catch(e){console.warn('[GREÑA V4 soundboard]',e.message)}}
const inputAudio=document.createElement('input');inputAudio.type='file';inputAudio.accept='.mp3,.wav,.ogg,.m4a,.aac,.webm,audio/*';inputAudio.hidden=true;document.body.appendChild(inputAudio);
let uploadSlot=0;
function selectAudio(slot){uploadSlot=slot;inputAudio.click()}
inputAudio.addEventListener('change',async()=>{
  const file=inputAudio.files?.[0],slot=uploadSlot;inputAudio.value='';if(!file||!slot)return;
  if(!file.size)return inform('El archivo de audio está vacío');
  try{await api('/api/soundboard/slot/'+slot,{method:'POST',body:file,raw:true});await refreshBoard();inform('Audio '+slot+' guardado en GREÑA ID')}catch(e){fail(e)}
});
function stopPad(fade=false){
  const sound=persistent.audio;if(!sound){setActiveSlot(0);return}
  persistent.audio=null;persistent.audioSlot=0;setActiveSlot(0);
  if(!fade){sound.pause();sound.currentTime=0;return}
  const start=performance.now(),volume=sound.volume;
  function step(t){if(persistent.audio===sound)return;const p=Math.min(1,(t-start)/420);sound.volume=Math.max(0,volume*(1-p));if(p>=1){sound.pause();sound.currentTime=0}else requestAnimationFrame(step)}requestAnimationFrame(step);
}
async function togglePad(slot){
  const meta=persistent.board.find(s=>s.slot===slot)||{empty:true};
  if(meta.empty){selectAudio(slot);return}
  if(persistent.audioSlot===slot){stopPad(meta.fade!==false);return}
  if(persistent.audio)stopPad(false);
  const audio=new Audio(meta.url);audio.preload='auto';audio.volume=meta.fade!==false?0:1;
  persistent.audio=audio;persistent.audioSlot=slot;setActiveSlot(slot);
  audio.addEventListener('ended',()=>{if(persistent.audio===audio){persistent.audio=null;persistent.audioSlot=0;setActiveSlot(0)}});
  audio.addEventListener('error',()=>{if(persistent.audio===audio)stopPad(false);inform('No se pudo reproducir ese archivo')});
  try{await audio.play()}catch(e){stopPad(false);fail(e);return}
  if(meta.fade!==false){const begin=performance.now();function rise(t){if(persistent.audio!==audio)return;audio.volume=Math.min(1,(t-begin)/650);if(audio.volume<1)requestAnimationFrame(rise)}requestAnimationFrame(rise)}
}
QA('#prow .pad').forEach((pad,index)=>{
  const slot=index+1;
  pad.addEventListener('click',()=>togglePad(slot));
  pad.addEventListener('contextmenu',e=>{e.preventDefault();soundConfig(slot)});
});
function soundConfig(slot){
  const item=persistent.board.find(x=>x.slot===slot)||{};
  dialog('Audio rápido '+slot,'Configura el slot real de GREÑA ID',`<label class="prem-field">Nombre visible<input id="v4PadName" maxlength="32" placeholder="Audio ${slot}"></label><label class="prem-field">Atajo (F1–F12, Ctrl+tecla)<input id="v4PadShortcut" maxlength="40" placeholder="Ejemplo: F5"></label><div class="prem-row"><span>Desvanecer al detener</span><button id="v4PadFade" class="sw ${item.fade!==false?'on':''}"></button></div>`,[
    {label:'Cambiar archivo',action:()=>{hideDialog();selectAudio(slot)}},
    {label:'Cerrar',action:hideDialog},
    {label:'Guardar',primary:true,action:async()=>{
      await api('/api/soundboard/config/'+slot,{method:'POST',body:{label:el('v4PadName').value.trim(),shortcut:el('v4PadShortcut').value.trim()}});
      if(!item.empty)await api('/api/soundboard/fade/'+slot,{method:'POST',body:{enabled:el('v4PadFade').classList.contains('on')}});
      await refreshBoard();hideDialog();inform('Audio '+slot+' configurado');
    }}
  ]);
  el('v4PadName').value=item.label||'';el('v4PadShortcut').value=item.shortcut||'';
  el('v4PadFade').onclick=e=>badge(e.currentTarget,!e.currentTarget.classList.contains('on'));
}
document.addEventListener('keydown',e=>{
  if(e.repeat||['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)||!persistent.board.length)return;
  const key=/^F\d+$/.test(e.code)?e.code:e.code;
  const shortcut=(e.ctrlKey?'Ctrl+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':'')+(e.metaKey?'Meta+':'')+key;
  for(const m of persistent.board){if(m.shortcut===shortcut){e.preventDefault();togglePad(m.slot);return}}
});

// ---- GREÑA Mobile: QR y enlaces generados exclusivamente por el servidor ----
function drawRealQR(id,url){
  const target=el(id);target.replaceChildren();
  if(typeof QRCode!=='function')throw Error('Falta el generador QR local de GREÑA');
  new QRCode(target,{text:url,width:160,height:160,colorDark:'#111111',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.M});
  target.dataset.url=url;
}
function setMobileLink(url){persistent.lanUrl=url;drawRealQR('q1',new URL('/mobile.html',url).href);el('cp1').disabled=false;el('cp1').style.opacity='1';}
el('wf').addEventListener('click',async()=>{
  try{const data=await api('/api/mobile/lan/enable',{method:'POST'});if(!data.url)throw Error('GREÑA no devolvió la dirección local');setMobileLink(data.url);inform('Enlace local GREÑA Mobile habilitado')}
  catch(e){fail(e)}
});
el('cp1').addEventListener('click',()=>copyLink(el('q1').dataset.url).catch(fail));
let pairingTimer=null;
el('gq').addEventListener('click',async()=>{
  try{
    const pair=await api('/api/mobile/pair/create',{method:'POST'});
    if(!pair.pairUrl||!pair.installationUrl)throw Error('La vinculación segura no devolvió sus enlaces');
    drawRealQR('q2',pair.pairUrl);drawRealQR('q1',pair.installationUrl);el('cp1').disabled=false;el('cp1').style.opacity='1';el('q2').dataset.url=pair.pairUrl;
    clearInterval(pairingTimer);
    const count=()=>{const left=Math.max(0,Math.ceil((Number(pair.expiresAt)-Date.now())/1000));text(el('cd'),left?'Caduca en '+left+' s':'Código caducado');if(!left){clearInterval(pairingTimer);el('q2').replaceChildren();text(el('q2'),'Código caducado. Genera uno nuevo.');delete el('q2').dataset.url}};
    count();pairingTimer=setInterval(count,1000);
    inform('QR temporal seguro generado por GREÑA ID');
  }catch(e){fail(e)}
});

// ---- Flotante: usa la acción nativa registrada en Electron, no un popup de demostración ----
document.addEventListener('click',e=>{
  const act=e.target.closest('[data-v4-action]');if(!act)return;
  const action=act.dataset.v4Action;
  if(action==='floating-open'){window.location.href='/__grena_bubble_mode__';return}
  if(action==='floating-reset'){inform('La posición de la ventana se conserva en Electron; no se ha modificado.');return}
});

// ---- AFTERGLOW: estilos y sonidos reales y persistentes por cuenta ----
const STYLES=['minecraft','domino','ascension','grena_catalog','grena_fullscreen','grena_grenito','grena_mascots'];
async function getAlertSettings(){const d=await api('/api/afterglow-settings');persistent.alertSettings=d.settings||{};drawAlertSelection();return persistent.alertSettings}
function drawAlertSelection(){
  const selected=persistent.alertSettings?.theme||'minecraft';
  QA('#stl .card').forEach((node,i)=>{const on=STYLES[i]===selected;node.classList.toggle('sel',on);const btn=node.querySelector('.btn');btn.classList.toggle('go',on);btn.textContent=on?'✓ Activo':'Elegir estilo'});
}
async function saveAfterglow(patch){
  // Always merge with latest server document to avoid erasing custom audio or unrelated settings.
  const prior=await getAlertSettings();const settings={...prior,...patch};
  const result=await api('/api/afterglow-settings',{method:'POST',body:settings});persistent.alertSettings=result.settings||settings;drawAlertSelection();return persistent.alertSettings;
}
QA('#stl .card').forEach((card,i)=>card.querySelector('.btn')?.addEventListener('click',async()=>{try{await saveAfterglow({theme:STYLES[i]});inform('Estilo de alertas guardado en GREÑA')}catch(e){fail(e)}}));
const charSelect=Q('#pg4 select');
const charNames=['dg','zp','bm','sk','pg'];
charSelect?.addEventListener('change',async()=>{try{await saveAfterglow({mascotCharacter:charNames[charSelect.selectedIndex]||'zp'});inform('Mascota guardada')}catch(e){fail(e)}});
const eventKinds=[['follow','Seguidores','💛'],['gift','Regalos','🎁'],['sub','Suscripciones','⭐'],['raid','Raids','🚀'],['share','Compartir','↗'],['likes','Tap Taps','♥']];
async function openSoundEditor(){
  try{
    const settings=await getAlertSettings();
    dialog('Editor de sonidos · Afterglow','Seis eventos · archivos y volúmenes guardados en GREÑA ID',`<div class="prem-note">Los archivos se protegen en GREÑA. La vista previa no almacena sonidos ni contraseñas.</div>
      <label class="prem-field">Tipo de evento<select id="v4AlertEvent">${eventKinds.map(x=>`<option value="${x[0]}">${x[2]} ${x[1]}</option>`).join('')}</select></label>
      <label class="prem-field">Reemplazar MP3/WAV/OGG (máx. 6 MB)<input type="file" id="v4AlertFile" accept=".mp3,.wav,.ogg"></label>
      <div class="prem-row"><span>Sonido activado</span><button id="v4AlertEnabled" class="sw" type="button"></button></div>
      <label class="prem-field">Volumen de este evento<input id="v4AlertVolume" type="range" min="0" max="100" value="54"></label>
      <div class="prem-note" id="v4AlertFileHint">Sin sonido personalizado</div>`,[
        {label:'Cerrar',action:hideDialog},
        {label:'Restaurar sonido original',action:async()=>{const kind=el('v4AlertEvent').value;const previous=await getAlertSettings();await saveAfterglow({audioFiles:{...previous.audioFiles,[kind]:''}});updateSoundFields();inform('Sonido original restaurado')}},
        {label:'Guardar',primary:true,action:async()=>{
          const kind=el('v4AlertEvent').value,prior=await getAlertSettings();
          const files={...prior.audioFiles},levels={...prior.eventLevels},sounds={...prior.sounds};
          const uploaded=el('v4AlertFile').files?.[0];
          if(uploaded){
            const ext=uploaded.name.toLowerCase().split('.').pop();const mime={mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg'}[ext];
            if(!mime||uploaded.size<1||uploaded.size>6*1024*1024)throw Error('Solo MP3, WAV u OGG, máximo 6 MB');
            const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('No se pudo leer el archivo'));r.readAsDataURL(uploaded)});
            const remote=await api('/api/custom-alerts/media',{method:'POST',body:{mime,data:b64}});if(!remote.url)throw Error('GREÑA no devolvió URL del archivo');files[kind]=remote.url;
          }
          levels[kind]=Number(el('v4AlertVolume').value);sounds[kind]=el('v4AlertEnabled').classList.contains('on');
          await saveAfterglow({audioFiles:files,eventLevels:levels,sounds});hideDialog();inform('Sonido y volumen guardados en GREÑA');
        }}]);
    function updateSoundFields(){const kind=el('v4AlertEvent').value;el('v4AlertVolume').value=settings.eventLevels?.[kind]??settings.volume??54;badge(el('v4AlertEnabled'),settings.sounds?.[kind]!==false);text(el('v4AlertFileHint'),settings.audioFiles?.[kind]?'Archivo personalizado guardado':'Usa el sonido predeterminado')}
    el('v4AlertEvent').addEventListener('change',updateSoundFields);el('v4AlertEnabled').onclick=e=>badge(e.currentTarget,!e.currentTarget.classList.contains('on'));updateSoundFields();
  }catch(e){fail(e)}
}
el('openSoundEditor').onclick=openSoundEditor;

// Real private links replace the hardcoded loopback links shown in prototype only.
async function refreshObsLinks(){
  try{
    const d=await api('/api/obs-token');if(!d.token)return;persistent.obsToken=d.token;
    for(const row of QA('#pg4 .code').filter(x=>x.textContent.includes('afterglow-overlay'))){const url=new URL(String(row.textContent).trim(),location.origin);url.protocol=location.protocol;url.host=location.host;url.searchParams.set('obs',d.token);row.textContent=url.href}
    for(const row of QA('#pg5 .code')){
      const raw=String(row.textContent).trim();const u=new URL(raw,location.origin);
      u.protocol=location.protocol;u.host=location.host;u.searchParams.set('obs',d.token);row.textContent=u.href;
    }
  }catch(e){console.warn('[GREÑA V4 OBS]',e.message)}
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-copy-near]');if(!b)return;
  e.preventDefault();e.stopPropagation();
  const raw=b.closest('.row')?.querySelector('.code')?.textContent?.trim();if(raw)copyLink(raw).catch(fail);
  else inform('No se encontró un enlace real para copiar');
},true);

// ---- GREÑA Cam Room: HTTPS invitation generated by the real service ----
async function refreshCamera(){
  try{const d=await api('/api/cam-room/current');persistent.cam=d.room||null;
    const box=el('room');if(!box)return;
    box.replaceChildren();
    if(!d.room){const note=document.createElement('div');note.className='prem-note';note.textContent='Sin sala activa. Crea una sala para obtener tu enlace HTTPS real.';box.appendChild(note);return}
    const row=document.createElement('div');row.className='row';row.style.marginTop='14px';
    const code=document.createElement('div');code.className='code';code.textContent=d.room.inviteUrl||'Enlace HTTPS aún no verificado';
    const copy=document.createElement('button');copy.className='btn go';copy.textContent='Copiar invitación';copy.disabled=!d.room.externalReady;copy.onclick=()=>copyLink(d.room.inviteUrl).catch(fail);
    const close=document.createElement('button');close.className='btn';close.textContent='Cerrar sala';close.onclick=async()=>{if(!confirm('¿Cerrar la sala de Cam Room?'))return;try{await api('/api/cam-room/close',{method:'POST'});await refreshCamera();inform('Sala cerrada')}catch(e){fail(e)}};
    row.append(code,copy,close);box.append(row);
    const status=document.createElement('small');status.textContent='Participantes: '+(d.connectedCount||0)+(d.tunnelError?' · '+d.tunnelError:'');box.appendChild(status);
  }catch(e){console.warn('[GREÑA Cam Room]',e.message)}
}
el('mk')?.addEventListener('click',async()=>{
  try{
    const pin=el('pin')?.value||'';if(pin&&!/^\d{4,8}$/.test(pin))throw Error('El PIN de cámara debe tener entre 4 y 8 dígitos');
    // The real backend generates HTTPS invitation; per-participant PINs are handled by WebRTC.
    const d=await api('/api/cam-room/create',{method:'POST',body:{}});
    if(!d.room)throw Error('No se creó la sala');await refreshCamera();inform('Cam Room segura creada')
  }catch(e){fail(e)}
});

// ---- Minecraft Dynamics: persistent backend room, not a local-only simulated vote ----
async function refreshMinecraft(){
  try{
    const d=await api('/api/dynamics/minecraft');persistent.minecraft=d;
    const page=el('pg6');if(!page)return;
    const first=Q('.g3 .card',page);const toggle=Q('.sw',first),state=Q('.tag',first);
    if(toggle)badge(toggle,!!d.enabled);
    if(state)text(state,d.enabled?'ACTIVADA':'DESACTIVADA');
    const bridge=Q('.g3 .card:nth-child(3) p.m',page);
    if(bridge)text(bridge,d.bedrockBridge?.connected?'Minecraft Bedrock conectado':'Puente Minecraft esperando conexión');
    const vote=Q('.g3 .card:last-child p.m',page);
    if(vote)text(vote,d.room?.active?'Votación activa · '+(d.room?.active?.question||'A o B'):'No hay votación activa.');
  }catch(e){console.warn('[GREÑA Minecraft]',e.message)}
}
const minecraftPage=el('pg6');
if(minecraftPage){
  const first=Q('.g3 .card',minecraftPage),toggle=Q('.sw',first);
  toggle?.addEventListener('click',async e=>{
    e.stopPropagation();const want=!persistent.minecraft?.enabled;
    try{await api('/api/dynamics/minecraft',{method:'POST',body:{action:'enable',enabled:want}});await refreshMinecraft();inform(want?'Dinámica de Minecraft activada':'Dinámica pausada')}catch(error){fail(error)}
  });
}
const routeAction=async(action,root)=>{
  if(action==='floating-open'||action==='floating-reset'||action==='widget-config')return;
  if(action==='minecraft-test-follow'){
    const user=Q('#pg6 .g3 .card:nth-child(2) input')?.value?.trim()||'USUARIO_PRUEBA';
    await api('/api/dynamics/minecraft',{method:'POST',body:{action:'test-follow',platform:'TikTok',name:user}});
    inform('Evento de prueba enviado a Dinámicas');await refreshMinecraft();return;
  }
  if(action==='minecraft-test-vote-a'||action==='minecraft-test-vote-b'){
    await api('/api/dynamics/minecraft',{method:'POST',body:{action:'test-vote',platform:'TikTok',userId:'local-test',vote:action.endsWith('-a')?'A':'B'}});
    inform('Voto de prueba enviado a Dinámicas');await refreshMinecraft();return;
  }
  if(action==='minecraft-save-gamertag'){
    const gamertag=Q('#pg6 .g3 .card:nth-child(4) input')?.value?.trim()||'';
    if(!/^[a-zA-Z0-9_ ]{3,32}$/.test(gamertag))throw Error('Introduce un gamertag válido');
    localStorage.setItem('grena-minecraft-gamertag:'+persistent.account.user.id,gamertag);
    inform('Gamertag guardado en este GREÑA ID y dispositivo');return;
  }
  if(action==='minecraft-invite'){
    const fields=QA('#pg6 .g3 .card:nth-child(4) input');
    const friendId=fields[1]?.value?.trim();if(!friendId)throw Error('Indica el GREÑA ID del amigo');
    await api('/api/dynamics/minecraft',{method:'POST',body:{action:'invite',friendId}});
    inform('Invitación enviada a GREÑA ID');await refreshMinecraft();return;
  }
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-v4-action]');if(!b)return;routeAction(b.dataset.v4Action,b.closest('.card')).catch(fail)});

// ---- Catalog: all cards originate from GREÑA's live real server catalog ----
let loadedCatalog=[];let giftFilter='all',giftQuery='',onlyAnimated=false;
const catFilterMap={tt:'TikTok',tw:'Twitch',kk:'Kick',yt:'YouTube'};
async function refreshCatalog(){
  try{const d=await api('/api/gift-catalog');loadedCatalog=Array.isArray(d.items)?d.items:[];persistent.catalog=d;renderCatalog()}
  catch(e){console.warn('[GREÑA catalog]',e.message);text(el('gc'),'Catálogo no disponible temporalmente')}
}
function renderCatalog(){
  if(!persistent.catalog)return;
  const allowed=loadedCatalog.filter(g=>(giftFilter==='all'||g.platform===catFilterMap[giftFilter])&&(!onlyAnimated||!!g.animatedImage)&&[g.name,g.nameEs,g.giftKind].some(t=>String(t||'').toLowerCase().includes(giftQuery)));
  text(el('gc'),'Mostrando '+allowed.length+' regalos del catálogo real de GREÑA');
  const stats=persistent.catalog.stats||{};
  QA('#pg8 .stat b').forEach((node,i)=>text(node,fmt([stats.total,stats.tiktok,stats.twitch,stats.kick,stats.youtube,stats.animated][i])));
  const feed=el('gg');feed.replaceChildren();
  for(const gift of allowed.slice(0,240)){
    const card=document.createElement('div');card.className='card gift';
    const heading=document.createElement('div');heading.className='tp';
    const pl=document.createElement('span');pl.className='tag '+(PLATFORM[gift.platform?.toLowerCase()]||'');pl.textContent=gift.platform||'';
    const anim=document.createElement('span');anim.className='tag';anim.textContent=gift.animatedImage?'ANIMADO':'ESTÁTICO';heading.append(pl,anim);
    const preview=document.createElement('div');preview.className='em';
    const url=gift.animatedImage||gift.image;
    if(url){const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';img.style.cssText='max-width:64px;max-height:66px;object-fit:contain';img.onerror=()=>{img.remove();preview.textContent='🎁'};preview.appendChild(img)}else{preview.textContent='🎁'}
    const title=document.createElement('b');title.textContent=gift.nameEs||gift.name||'Regalo';
    const amount=document.createElement('small');amount.textContent=String(gift.amount||'')+' '+String(gift.unit||'');
    const actions=document.createElement('div');actions.className='row';
    const send=document.createElement('button');send.className='btn go';send.style.flex='1';send.textContent='▶ Probar alerta';
    send.onclick=async()=>{
      const isBits=gift.platform==='Twitch'&&gift.giftKind==='bits';
      const event=isBits?'cheer':'gift';
      const item={platform:gift.platform,event,name:'USUARIO_PRUEBA',giftName:gift.nameEs||gift.name,giftId:gift.id,giftImage:gift.image,giftAnimatedImage:gift.animatedImage,amount:Number(gift.amount||0),unitDiamonds:Number(gift.amount||0),bits:isBits?Number(gift.amount||0):0,action:'Prueba de '+(gift.nameEs||gift.name)};
      try{await api('/api/alert',{method:'POST',body:item});inform('Alerta de prueba enviada a OBS')}catch(e){fail(e)}
    };
    const json=document.createElement('button');json.className='btn';json.textContent='{ }';json.title='Copiar metadatos del regalo';json.onclick=()=>copyLink(JSON.stringify({platform:gift.platform,id:gift.id,name:gift.name,amount:gift.amount,unit:gift.unit})).catch(fail);
    actions.append(send,json);card.append(heading,preview,title,amount,actions);feed.appendChild(card);
  }
  if(!allowed.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No hay regalos disponibles con esos filtros';feed.appendChild(empty)}
}
el('gq2').oninput=e=>{giftQuery=e.target.value.toLowerCase();renderCatalog()};
QA('#gt button').forEach(btn=>btn.onclick=()=>{QA('#gt button').forEach(b=>b.classList.toggle('on',b===btn));giftFilter=btn.dataset.p;renderCatalog()});
el('ga').onclick=e=>{onlyAnimated=!onlyAnimated;badge(e.currentTarget,onlyAnimated);renderCatalog()};

// ---- Widgets: V4 cards retain their exact markup; links and settings come from GREÑA ----
async function openWidgetConfig(card){
  const widget=card?.querySelector('b')?.textContent||'Widget',code=card?.querySelector('.code')?.textContent?.trim()||'';
  const fields=widget==='Contador'?'<p class="prem-note">El contador toma los espectadores verificados de GREÑA en tiempo real.</p>':widget==='Multichat'?'<p class="prem-note">El multichat OBS se actualiza desde el motor de GREÑA, independiente de Fish Audio.</p>':'<p class="prem-note">El widget sigue utilizando su enlace OBS y configuración guardada en GREÑA.</p>';
  dialog('Configurar · '+widget,'Enlace real de OBS y editor original de este widget',fields+`<div class="prem-preview"><strong>${widget.replace(/[<>]/g,'')}</strong><small>Conectado al motor GREÑA</small></div><label class="prem-field">Enlace OBS<input id="v4WidgetUrl" readonly></label>`,[
    {label:'Cerrar',action:hideDialog},
    {label:'Copiar enlace',action:()=>copyLink(el('v4WidgetUrl').value)},
    {label:'Abrir configuración avanzada',primary:true,action:()=>{hideDialog();window.open('/widgets.html?embed=1','_blank','noopener')}}
  ]);el('v4WidgetUrl').value=code;
}
QA('#pg5 [data-v4-action="widget-config"]').forEach(btn=>btn.addEventListener('click',()=>openWidgetConfig(btn.closest('.wd'))));

// ---- Actual initialization ----
(async()=>{
  try{
    // The template remains usable as a read-only layout even when GREÑA is offline.
    await loadIdentity();
    await Promise.all([refreshStatus(),refreshBoard(),getAlertSettings(),refreshObsLinks(),refreshChat()]);
    connectLiveSocket();
    setInterval(()=>refreshChat(),1250);
    setInterval(()=>refreshStatus(),7000);
    const lazy={4:()=>getAlertSettings(),5:()=>refreshObsLinks(),6:()=>refreshMinecraft(),7:()=>refreshCamera(),8:()=>refreshCatalog()};
    QA('#nav .nb').forEach((btn,i)=>btn.addEventListener('click',()=>{if(lazy[i])lazy[i]().catch(fail)}));
  }catch(e){console.warn('[GREÑA V4]',e?.message||e)}
})();
})();