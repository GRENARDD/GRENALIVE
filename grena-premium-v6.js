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
