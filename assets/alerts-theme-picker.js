/* GREÑA Alerts — per-account persistent themes + private OBS sources.
   The preview iframe is not a second live overlay: ?preview=1 disables the live socket. */
(function(){
 'use strict';
 const buttons=[...document.querySelectorAll('[data-grena-theme]')];
 const status=document.getElementById('styleSaveStatus');
 const frame=document.getElementById('stylePreviewFrame');
 const windowEl=document.getElementById('stylePreviewWindow');
 const layoutButtons=[...document.querySelectorAll('[data-preview-layout]')];
 const eventButtons=[...document.querySelectorAll('[data-preview-event]')];
 if(!buttons.length||!status)return;
 const validThemes=['original','minecraft','halloween','christmas'];
 let settings={},theme='original',busy=false,layout='horizontal',event='follow';
 let replay=0;
 const friendly={original:'Afterglow',minecraft:'Minecraft',halloween:'Halloween',christmas:'Navidad'};
 const normalize=t=>validThemes.includes(t)?t:'original';
 function show(value){
  theme=normalize(value);
  for(const btn of buttons){
   const active=btn.dataset.grenaTheme===theme;
   btn.setAttribute('aria-pressed',String(active));
   const tag=btn.querySelector('.style-choice-name span');
   if(tag)tag.textContent=active?'✓ Activo':'Elegir';
  }
 }
 function updatePreview(){
  if(!frame)return;
  const isSeasonal=theme==='halloween'||theme==='christmas';
  const u=new URL(theme==='christmas'?'/navidad-alertas-3d.html':theme==='halloween'?'/halloween-alertas-3d.html':'/afterglow-overlay.html',location.origin);
  if(isSeasonal){
   u.searchParams.set('mode','overlay');
   u.searchParams.set('orient',layout==='horizontal'?'h':'v');
   u.searchParams.set('previewEvent',event);
  }else{
   u.searchParams.set('layout',layout);
   u.searchParams.set('preview','1');
   u.searchParams.set('demo','1');
   u.searchParams.set('event',event==='premium'?'gift':event==='like'?'like':event==='cheer'?'cheer':event);
  }
  u.searchParams.set('replay',String(++replay));
  if(windowEl)windowEl.dataset.layout=layout;
  frame.src=u.toString();
  for(const b of layoutButtons)b.setAttribute('aria-pressed',String(b.dataset.previewLayout===layout));
  for(const b of eventButtons)b.setAttribute('aria-pressed',String(b.dataset.previewEvent===event));
 }
 async function load(){
  try{
   const r=await fetch('/api/afterglow-settings',{cache:'no-store',credentials:'same-origin'});
   if(!r.ok)throw Error('Inicia sesión para elegir el tema.');
   const json=await r.json();settings=json.settings||{};show(settings.theme);
   status.textContent='Tema activo: '+friendly[theme]+' · Se utiliza en ambos enlaces OBS.';
   status.classList.remove('style-select-error');
   updatePreview();
  }catch(e){status.textContent=e.message||'No se pudo cargar el tema';status.classList.add('style-select-error')}
 }
 async function choose(next){
  if(busy)return;
  next=normalize(next);
  const previous=theme;busy=true;buttons.forEach(b=>b.disabled=true);
  show(next);status.classList.remove('style-select-error');status.textContent='Aplicando '+friendly[next]+'…';
  try{
   const r=await fetch('/api/afterglow-settings',{cache:'no-store',credentials:'same-origin'});
   if(!r.ok)throw Error('La sesión ha caducado.');
   const values=(await r.json()).settings||settings;
   const response=await fetch('/api/afterglow-settings',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
    body:JSON.stringify({...values,theme:next})
   });
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'No se pudo cambiar el tema');
   settings=result.settings||{...values,theme:next};show(settings.theme);
   status.textContent=friendly[theme]+' activado · OBS conserva sus enlaces actuales.';
   updatePreview();
  }catch(e){
   show(previous);updatePreview();
   status.classList.add('style-select-error');status.textContent=e.message||'No se pudo guardar el tema';
  }finally{buttons.forEach(b=>b.disabled=false);busy=false}
 }
 for(const b of buttons)b.addEventListener('click',()=>choose(b.dataset.grenaTheme));
 for(const b of layoutButtons)b.addEventListener('click',()=>{layout=b.dataset.previewLayout;updatePreview()});
 for(const b of eventButtons)b.addEventListener('click',()=>{event=b.dataset.previewEvent;updatePreview()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)load()});
 load();
})();
