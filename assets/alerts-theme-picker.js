/* GREÑA Alerts two-style selection — uses existing authenticated settings
   and the original private vertical/horizontal OBS sources. */
(function(){
 'use strict';
 const buttons=[...document.querySelectorAll('[data-grena-theme]')],status=document.getElementById('styleSaveStatus');
 if(!buttons.length)return;
 let settings={},theme='original',busy=false;
 function show(value){
   theme=value==='minecraft'?'minecraft':'original';
   for(const btn of buttons){
     const active=btn.dataset.grenaTheme===theme;
     btn.setAttribute('aria-pressed',String(active));
     const tag=btn.querySelector('.style-choice-name span');
     if(tag)tag.textContent=active?'✓ Activo':'Elegir estilo';
   }
 }
 async function load(){
   try{
     const r=await fetch('/api/afterglow-settings',{cache:'no-store',credentials:'same-origin'});
     if(!r.ok)throw Error('Inicia sesión para elegir tu estilo.');
     const json=await r.json();settings=json.settings||{};show(settings.theme);
     status.textContent='Este diseño se utilizará en vertical y horizontal, sin cambiar tus enlaces.';
     status.classList.remove('style-select-error');
   }catch(e){status.textContent=e.message||'No se pudo cargar el estilo';status.classList.add('style-select-error')}
 }
 async function choose(next){
   if(busy)return; // Cada clic reafirma el tema y reenvía la actualización a OBS.
   const previous=theme;busy=true;buttons.forEach(b=>b.disabled=true);
   show(next);status.classList.remove('style-select-error');status.textContent='Guardando el estilo…';
   try{
     // Always reload settings before POST so a recent sound/color change is retained.
     const fresh=await fetch('/api/afterglow-settings',{cache:'no-store',credentials:'same-origin'});
     if(!fresh.ok)throw Error('Sesión caducada.');
     const values=(await fresh.json()).settings||settings;
     const response=await fetch('/api/afterglow-settings',{
       method:'POST',credentials:'same-origin',
       headers:{'content-type':'application/json'},
       body:JSON.stringify({...values,theme:next})
     });
     const result=await response.json();
     if(!response.ok)throw Error(result.error||'No se pudo cambiar el estilo');
     settings=result.settings||{...values,theme:next};show(settings.theme);
     status.textContent=(theme==='minecraft'?'Minecraft activado':'Original activado')+' · Ambos enlaces OBS se actualizaron.';
   }catch(e){show(previous);status.classList.add('style-select-error');status.textContent=e.message||'No se pudo guardar'}
   finally{buttons.forEach(b=>b.disabled=false);busy=false}
 }
 buttons.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.grenaTheme)));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)load()});
 load();
})();
