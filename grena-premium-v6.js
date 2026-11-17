/* GREÑA LIVE 6.0 · Capa visual progresiva.
   Nunca fabrica licencias ni modifica estado remoto del streaming. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const license=$('grenaPremiumLicense');
 const safeDays=v=>Number.isFinite(v)?Math.max(0,Math.ceil(v)):null;
 async function refreshLicense(){
  if(!license)return;
  try{
   const r=await fetch('/api/license/status',{cache:'no-store'});
   if(!r.ok)throw Error('no response');
   const d=await r.json(),l=d.license||{};
   if(d.permanentAccess===true){license.dataset.kind='admin';license.textContent='✦ Administrador';license.title='Cuenta propietaria verificada';return}
   if(l.kind==='beta'&&l.active===true){license.dataset.kind='beta';license.textContent='✧ BETA';license.title='Licencia beta activa';return}
   if(l.active===true&&Number.isFinite(Number(l.expiresAt))){
    const days=safeDays((Number(l.expiresAt)-Date.now())/86400000);
    license.dataset.kind=days<=5?'expiring':'days';
    license.textContent='◷ '+days+' '+(days===1?'día restante':'días restantes');
    license.title='Vencimiento: '+new Date(l.expiresAt).toLocaleDateString('es-DO');return;
   }
   license.dataset.kind='unknown';
   license.textContent=l.expired?'Licencia vencida':'Licencia sin activar';
   license.title='Consulta el estado de tu licencia';
  }catch{
   license.dataset.kind='unknown';license.textContent='Licencia no disponible';
   license.title='No se pudo verificar la licencia';
  }
 }
 refreshLicense();setInterval(refreshLicense,60000);

 // El chat REAL ya vive en el iframe único de Creator Control.
 // Abrir los ajustes no carga una segunda instancia ni roba su sesión.
 const card=$('premiumVoiceCard'),switchButton=$('premiumVoiceSwitch');
 const frame=$('chatFrame'),shade=$('premiumVoiceBackdrop'),close=$('premiumVoiceClose');
 function childVoice(){
  try{return frame?.contentDocument?.getElementById('voiceEnabled')||null}catch{return null}
 }
 function voiceSync(){
  const cb=childVoice();
  if(switchButton){switchButton.classList.toggle('on',cb?.checked===true);switchButton.setAttribute('aria-pressed',String(cb?.checked===true));switchButton.title=cb?'Alternar voz real':'Esperando motor de voz'}
  if(card)card.setAttribute('aria-disabled',String(!cb));
 }
 function voiceOpen(){
  const cb=childVoice();if(!cb){window.alert('El motor del chat de voz todavía está cargando.');return}
  try{frame.contentDocument.documentElement.classList.add('grena-v6-voice-only')}catch{return}
  document.body.classList.add('grena-voice-popup');shade.hidden=false;close.focus();
 }
 function voiceClose(){
  document.body.classList.remove('grena-voice-popup');
  if(shade)shade.hidden=true;
  try{frame?.contentDocument?.documentElement.classList.remove('grena-v6-voice-only')}catch{}
  card?.focus();
 }
 card?.addEventListener('click',event=>{if(event.target.closest('#premiumVoiceSwitch'))return;voiceOpen()});
 card?.addEventListener('keydown',event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();voiceOpen()}});
 switchButton?.addEventListener('click',event=>{
  event.preventDefault();event.stopPropagation();const cb=childVoice();
  if(!cb){window.alert('Todavía no está listo el motor de voz.');return}
  cb.click();voiceSync();
 });
 close?.addEventListener('click',voiceClose);
 shade?.addEventListener('click',event=>{if(event.target===shade)voiceClose()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!shade?.hidden)voiceClose()});
 frame?.addEventListener('load',voiceSync);
 setInterval(voiceSync,1300);


 // Reorganizar nodos reales, no clonarlos: se conservan sus IDs, listeners,
 // contadores, fuente OBS, soundboard y conexiones WebSocket.
 (function compactHome(){
  const workspace=document.querySelector('.workspace');
  const overview=document.querySelector('.overview-panel');
  const soundboard=$('soundboardStrip');
  if(!workspace||!overview||!soundboard||$('premiumHero'))return;
  const head=overview.querySelector(':scope > .panel-head');
  const viewers=overview.querySelector(':scope > .viewer-grid');
  if(!head||!viewers)return;
  const hero=document.createElement('section');
  hero.className='panel-shell';hero.id='premiumHero';
  hero.setAttribute('aria-label','Audiencia en directo');
  hero.append(head,viewers);
  workspace.prepend(hero);
  workspace.append(soundboard);
 })();

 // Refleja vinculación real en los contadores, pero conserva filas para conectar.
 const visibility=()=>{
  for(const p of ['tiktok','twitch','kick','youtube']){
   const chip=$(p+'Auth'),card=document.querySelector('.viewer-grid .viewer-card.'+p);
   const row=document.querySelector('.platform-row[data-platform="'+p+'"]');
   if(!chip||!card)continue;
   const auth=chip.classList.contains('on');
   const live=Boolean(row?.querySelector('.state-chip:not(#'+p+'Auth).on'));
   const linked=auth||live;
   card.style.display=linked?'':'none';
   const test=document.querySelectorAll('.test-grid [data-test]');
   for(const b of test){
    const type=b.dataset.test||'';
    const platform=type.startsWith('tt-')?'tiktok':type.startsWith('tw-')?'twitch':type.startsWith('ki-')?'kick':type.startsWith('yt-')?'youtube':'';
    if(platform===p)b.hidden=!linked;
   }
  }
 };
 const observer=new MutationObserver(()=>{requestAnimationFrame(visibility)});
 const chips=['tiktok','twitch','kick','youtube'].map(p=>$(p+'Auth')).filter(Boolean);
 for(const chip of chips)observer.observe(chip,{attributes:true,attributeFilter:['class']});
 visibility();
 // La foto de perfil se mantiene gestionada por grena-avatar.js,
 // que ya ofrece carga/borrado, API Fish Audio y cierre de sesión.
})();
