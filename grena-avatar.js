/* GREÑA · foto de perfil por usuario (se guarda en este navegador/PC) + limpieza de la barra */
(()=>{
  if(!/Electron\/\d+/i.test(navigator.userAgent)) document.getElementById('grenaBubbleModeControl')?.remove();
  const av=document.getElementById('profileAvatar'); if(!av) return;
  const SIZE=256; let key='grena-avatar:guest';
  const OK=/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/;
  const inlinePhoto=document.getElementById('profileNamePhoto');
  const apply=()=>{let d=null;try{d=localStorage.getItem(key)}catch{}
    if(d&&!OK.test(d)) d=null;
    av.classList.toggle('has-photo',!!d); av.style.backgroundImage=d?`url(${d})`:'';
    // Both badges always use the same local profile-scoped image, never
    // another user's avatar. The fallback remains a simple name initial.
    if(inlinePhoto){
      inlinePhoto.classList.toggle('has-photo',!!d);
      inlinePhoto.style.backgroundImage=d?`url(${d})`:'';
      inlinePhoto.textContent=d?'':String(document.getElementById('profileName')?.textContent||'G').trim().slice(0,1).toUpperCase();
    }
  };
  addEventListener('storage',event=>{if(event.key===key)apply()});
  fetch('/api/account/me',{cache:'no-store'}).then(r=>r.json())
    .then(d=>{if(d&&d.user&&d.user.id) key='grena-avatar:'+d.user.id; apply()}).catch(apply);

  const input=Object.assign(document.createElement('input'),{type:'file',accept:'image/*',hidden:true});
  const menu=document.createElement('div'); menu.className='gx-avatar-menu'; menu.hidden=true; menu.setAttribute('role','menu');
  menu.innerHTML='<button type="button" role="menuitem" data-a="pick">📷 Cambiar foto</button><button type="button" role="menuitem" data-a="clear">🗑 Quitar foto</button><button type="button" role="menuitem" data-a="settings">⚙ Configuración</button><button type="button" role="menuitem" data-a="switch">🔄 Cambiar GREÑA ID</button><button type="button" role="menuitem" data-a="new-account">➕ Crear otro GREÑA ID</button><button type="button" role="menuitem" data-a="logout">↪ Cerrar sesión</button>';
  document.body.append(input,menu);
  const logout=document.getElementById('logoutBtn');
  if(logout) logout.style.display='none';
  const pill=document.getElementById('profilePill');
  const settings=document.createElement('dialog');
  settings.className='gx-profile-settings';
  settings.innerHTML=`<section style="background:#121827;color:white;padding:24px;border-radius:16px;width:min(90vw,460px)">
    <h2 style="margin-top:0">Configuración</h2>
    <h3>Fish Audio</h3>
    <p>Vincula tu API de Fish Audio a tu GREÑA ID. Disponible para FREE y PRO. Cada cuenta utiliza sus propios créditos.</p>
    <p data-sync-status role="status" style="font-size:12px;color:#b7c7e5"></p>
    <p data-owner-info hidden>Cuenta propietaria: tus dos APIs originales se conservan sin cambios y no se comparten con otros usuarios.</p>
    <div data-fish-panel>
      <p data-fish-status role="status" aria-live="polite">Consultando tu API…</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
        <button data-s="fish-manage" type="button">Vincular API</button>
        <button data-s="fish-clear" type="button" hidden>Quitar API</button>
        <button data-s="fish-sync" type="button">Sincronizar con Cloudflare</button>
      </div>
      <form data-fish-form hidden autocomplete="off">
        <label for="gx-fish-key">Tu API privada de Fish Audio</label>
        <input id="gx-fish-key" type="password" autocomplete="new-password" spellcheck="false" minlength="20" maxlength="512" placeholder="Pega aquí tu API" required style="width:100%;padding:12px;margin:8px 0 12px;border-radius:8px;color:white;background:#080d16;border:1px solid #526080">
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit">Guardar API</button><button data-s="fish-cancel" type="button">Cancelar</button></div>
      </form>
      <p style="font-size:12px;color:#a7b5c7">Por seguridad, tu API nunca se muestra después de guardarla.</p>
    </div>
    <button data-s="close" type="button" style="margin-top:12px">Cerrar</button>
  </section>`;
  document.body.append(settings);
  const fishStatus=settings.querySelector('[data-fish-status]');
  const fishForm=settings.querySelector('[data-fish-form]');
  const fishPanel=settings.querySelector('[data-fish-panel]');
  const fishManage=settings.querySelector('[data-s="fish-manage"]');
  const fishClear=settings.querySelector('[data-s="fish-clear"]');
  const fishSync=settings.querySelector('[data-s="fish-sync"]');
  const syncStatus=settings.querySelector('[data-sync-status]');
  const ownerInfo=settings.querySelector('[data-owner-info]');
  let fishConfigured=false,fishNeedsSync=false,fishRevision=0;
  const fishRequest=async(method,body,path='/api/license/fish-credentials')=>{
    const response=await fetch(path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw Error(data.error||'No se pudo conectar con GREÑA.');
    return data;
  };
  function fishDraw(){
    fishManage.textContent=fishConfigured?'Cambiar API':'Vincular API';
    fishClear.hidden=!fishConfigured;
    fishSync.hidden=false; // Siempre disponible para comprobar el estado o reintentar la sincronización.
    fishForm.hidden=true;
    fishForm.querySelector('input').value='';
  }
  function fishSavedStatus(state){
    fishConfigured=state.configured===true;
    // A cloud label requires explicit D1 readback. Local protection alone
    // must never masquerade as remote registration.
    fishNeedsSync=fishConfigured&&(state.needsSync===true||state.source!=='cloud'||state.verified!==true);
    fishStatus.textContent=!fishConfigured?'No tienes ninguna API vinculada.':
      fishNeedsSync?'✓ API protegida en este equipo. Pendiente de sincronizar con Cloudflare.':
        '✓ API cifrada y vinculada a tu GREÑA ID en Cloudflare.';
    if(state.warning&&fishNeedsSync)fishStatus.textContent+=' '+state.warning;
    fishDraw();
  }
  async function fishRefresh(){
    const current=++fishRevision;
    fishForm.hidden=true;
    try{
      const response=await fetch('/api/license/status',{cache:'no-store'});
      const access=await response.json();
      if(current!==fishRevision)return; // Don't overwrite a newer save with an old GET.
      if(!response.ok||!access.ok)throw Error(access.error||'No se pudo verificar tu GREÑA ID.');
      if(!access.registered||!access.connected){
        syncStatus.textContent='Tu GREÑA ID aún no está sincronizado con Cloudflare. Inicia sesión nuevamente en GREÑA Live con internet. '+(access.syncError||'');
      }else{
        syncStatus.textContent='GREÑA ID sincronizado con Cloudflare.';
      }
      const owner=access.permanentAccess===true;
      ownerInfo.hidden=!owner;
      fishPanel.hidden=owner;
      if(owner)return; // Preserve both existing owner Fish APIs untouched.
      const state=await fishRequest('GET');
      if(current!==fishRevision)return;
      fishSavedStatus(state);
    }catch(error){
      if(current!==fishRevision)return;
      syncStatus.textContent=error.message||'Sin conexión con el servicio de cuentas.';
      fishStatus.textContent='No fue posible consultar tu API. No se modificó ninguna configuración.';
      fishForm.hidden=true;
    }
  }
  fishForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const input=fishForm.querySelector('#gx-fish-key'),apiKey=input.value.trim();
    if(apiKey.length<20||apiKey.length>512){fishStatus.textContent='Introduce una API válida de Fish Audio.';return}
    ++fishRevision; // Cancel any stale GET started when the settings dialog opened.
    const submit=fishForm.querySelector('[type="submit"]');submit.disabled=true;
    try{
      const saved=await fishRequest('POST',{apiKey});
      if(saved.configured!==true||saved.source!=='cloud'||saved.verified!==true)throw Error('Todavía no se confirmó el guardado en Cloudflare D1.');
      fishSavedStatus(saved);
    }catch(error){
      // Keep the value until the user retries or cancels. Never fake success.
      fishStatus.textContent=error.message||'No se pudo guardar la API.';
      fishForm.hidden=false;
      input.value=apiKey;
    }finally{submit.disabled=false}
  });
  settings.addEventListener('click',async e=>{
    const b=e.target.closest('[data-s]');if(!b)return;
    if(b.dataset.s==='close'){++fishRevision;settings.close()}
    if(b.dataset.s==='fish-manage'){
      ++fishRevision;
      fishForm.hidden=false;fishForm.querySelector('input').focus();
    }
    if(b.dataset.s==='fish-cancel'){
      fishForm.querySelector('input').value='';fishForm.hidden=true;
    }
    if(b.dataset.s==='fish-sync'){
      ++fishRevision;
      b.disabled=true;
      const previous=fishStatus.textContent;
      fishStatus.textContent='Comprobando la API con Cloudflare…';
      try{
        // GET always rechecks the actual central record, even when the UI
        // previously believed the account had no Fish key.
        const state=await fishRequest('GET');
        if(state.configured===true&&state.source==='cloud'&&state.verified===true){
          fishSavedStatus(state);
          fishStatus.textContent='✓ API verificada en Cloudflare D1 para tu GREÑA ID. No hace falta volver a guardarla.';
        }else if(state.configured===true&&state.source==='device'&&state.needsSync===true){
          fishStatus.textContent='API encontrada en la copia cifrada local. Sincronizando…';
          const synced=await fishRequest('POST',undefined,'/api/license/fish-credentials/sync');
          if(synced.verified!==true||synced.source!=='cloud')throw Error('Cloudflare no confirmó la sincronización.');
          fishSavedStatus(synced);
        }else if(state.configured===false){
          fishSavedStatus(state);
          fishStatus.textContent='No hay API vinculada ni copia local recuperable. Pulsa Vincular API para introducir tu clave Fish Audio.';
        }else{
          fishStatus.textContent=previous||'No se pudo comprobar la API.';
          throw Error('El estado de la API es incierto. No se ha confirmado ninguna sincronización.');
        }
      }catch(err){
        fishStatus.textContent=err.message||'No fue posible comprobar o sincronizar la API en Cloudflare.';
      }finally{b.disabled=false}
    }
    if(b.dataset.s==='fish-clear'&&fishConfigured&&confirm('¿Quitar tu API de Fish Audio de esta cuenta GREÑA ID?')){
      ++fishRevision;b.disabled=true;
      try{
        const removed=await fishRequest('DELETE');
        if(removed.configured!==false)throw Error('El servidor no confirmó que se quitó la API.');
        fishSavedStatus({configured:false});
        fishStatus.textContent='API desvinculada. Puedes vincular otra cuando quieras.';
      }catch(err){fishStatus.textContent=err.message||'No se pudo quitar la API.'}
      finally{b.disabled=false}
    }
  });
  if(pill){pill.style.cursor='pointer';pill.addEventListener('click',e=>{if(e.target.closest('#logoutBtn')||e.target===av)return;e.stopPropagation();toggle()})}

  av.tabIndex=0; av.setAttribute('role','button'); av.title='Clic para cambiar tu foto de perfil'; av.setAttribute('aria-haspopup','menu'); av.setAttribute('aria-expanded','false');
  const note=msg=>{const t=document.createElement('div');t.className='gx-toast';t.setAttribute('role','status');t.textContent=msg;document.body.append(t);setTimeout(()=>t.remove(),3200)};
  const toggle=()=>{const r=(pill||av).getBoundingClientRect();
    menu.style.top=r.bottom+10+'px'; menu.style.left=Math.max(8,Math.min(r.left,innerWidth-190))+'px'; menu.hidden=!menu.hidden; av.setAttribute('aria-expanded',String(!menu.hidden))};
  av.addEventListener('click',e=>{e.stopPropagation();toggle()});
  av.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
  document.addEventListener('click',()=>{menu.hidden=true;av.setAttribute('aria-expanded','false')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;av.setAttribute('aria-expanded','false')}});
  menu.addEventListener('click',async e=>{
    const a=e.target.closest('button')?.dataset.a; if(!a) return; menu.hidden=true;
    if(a==='pick') input.click();
    if(a==='settings'){settings.showModal();fishRefresh()}
    if(a==='logout') logout?.click();
    if(a==='switch'||a==='new-account'){
      // Only one local profile drives OBS, streaming and TTS per app instance.
      // Ending this session NEVER deletes the old user's local settings, Fish
      // vault, account record or its independent sessions on another PC.
      try{
        const r=await fetch('/api/account/logout',{method:'POST',cache:'no-store'});
        if(!r.ok)throw Error('No se pudo cerrar la sesión anterior.');
        location.replace(a==='new-account'?'/login.html#register':'/login.html#login');
      }catch(error){note(error?.message||'No fue posible cambiar de GREÑA ID.');}
    }
    if(a==='clear'){try{localStorage.removeItem(key)}catch{} apply()}
  });
  input.addEventListener('change',()=>{
    const f=input.files[0]; input.value=''; if(!f||!/^image\//.test(f.type)) return;
    const img=new Image(), url=URL.createObjectURL(f);
    img.onload=()=>{
      const s=Math.min(img.width,img.height), c=document.createElement('canvas'); c.width=c.height=SIZE;
      const g=c.getContext('2d'); g.fillStyle='#0b0f1e'; g.fillRect(0,0,SIZE,SIZE);
      g.drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,SIZE,SIZE);
      URL.revokeObjectURL(url);
      try{localStorage.setItem(key,c.toDataURL('image/jpeg',.88))}catch{note('No se pudo guardar la foto: el almacenamiento del navegador está lleno.')}
      apply();
    };
    img.onerror=()=>{URL.revokeObjectURL(url);note('Ese archivo no se pudo leer como imagen.')}; img.src=url;
  });
})();
