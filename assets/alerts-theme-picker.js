/* GREÑA Alerts two-style selection — uses existing authenticated settings
   and the original private vertical/horizontal OBS sources. */
(function(){
 'use strict';
 const buttons=[...document.querySelectorAll('[data-grena-theme]')],status=document.getElementById('styleSaveStatus');
 if(!buttons.length)return;
 let settings={},theme='minecraft',busy=false;
 const characterPanel=document.getElementById('mascotCharacterPanel'),characterSelect=document.getElementById('mascotCharacterSelect');
 const chars=['zp','pg','bm','sk','dg'];
 function show(value){
   theme=['minecraft','domino','ascension','grena_catalog','grena_fullscreen','grena_mascots','celestial','sakura','comic','hologram','inferno','arcade','royal','void'].includes(value)?value:'minecraft';
   if(characterPanel)characterPanel.hidden=theme!=='grena_mascots';
   if(characterSelect&&document.activeElement!==characterSelect)characterSelect.value=chars.includes(settings.mascotCharacter)?settings.mascotCharacter:'zp';
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
     status.textContent=(theme==='minecraft'?'Minecraft activado':theme==='domino'?'Dominó activado':theme==='ascension'?'Ascensión Premium activada':theme==='grena_catalog'?'Premium de Catálogo activada':theme==='grena_fullscreen'?'Pantalla Completa activada':theme==='grena_mascots'?'Mascot Alerts activada':'Alerta básica '+theme+' activada')+' · Ambos enlaces OBS se actualizaron.';
   }catch(e){show(previous);status.classList.add('style-select-error');status.textContent=e.message||'No se pudo guardar'}
   finally{buttons.forEach(b=>b.disabled=false);busy=false}
 }
 if(characterSelect)characterSelect.addEventListener('change',async()=>{
   if(busy||theme!=='grena_mascots')return;
   const chosen=chars.includes(characterSelect.value)?characterSelect.value:'zp';
   busy=true;characterSelect.disabled=true;
   try{
     const response=await fetch('/api/afterglow-settings',{cache:'no-store',credentials:'same-origin'});
     if(!response.ok)throw Error('Sesión GREÑA requerida');
     const fresh=(await response.json()).settings||settings;
     const saved=await fetch('/api/afterglow-settings',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({...fresh,theme:'grena_mascots',mascotCharacter:chosen})});
     const data=await saved.json();if(!saved.ok)throw Error(data.error||'No se pudo guardar el personaje');
     settings=data.settings||{...fresh,theme:'grena_mascots',mascotCharacter:chosen};show(settings.theme);
     status.textContent='✓ Personaje guardado para ambas fuentes OBS. Pulsa Probar alerta para verlo.';
     status.classList.remove('style-select-error');
   }catch(e){status.textContent=e.message||'No se pudo guardar';status.classList.add('style-select-error');characterSelect.value=chars.includes(settings.mascotCharacter)?settings.mascotCharacter:'zp'}
   finally{busy=false;characterSelect.disabled=false}
 });
 buttons.forEach(b=>b.addEventListener('click',()=>choose(b.dataset.grenaTheme)));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)load()});
 load();
})();
