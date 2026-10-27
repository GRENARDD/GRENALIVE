/* GREÑA · foto de perfil por usuario (se guarda en este navegador/PC) + limpieza de la barra */
(()=>{
  if(!/Electron\/\d+/i.test(navigator.userAgent)) document.getElementById('grenaBubbleModeControl')?.remove();
  const av=document.getElementById('profileAvatar'); if(!av) return;
  const SIZE=256; let key='grena-avatar:guest';
  const OK=/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/;
  const apply=()=>{let d=null;try{d=localStorage.getItem(key)}catch{}
    if(d&&!OK.test(d)) d=null;
    av.classList.toggle('has-photo',!!d); av.style.backgroundImage=d?`url(${d})`:''};
  fetch('/api/account/me',{cache:'no-store'}).then(r=>r.json())
    .then(d=>{if(d&&d.user&&d.user.id) key='grena-avatar:'+d.user.id; apply()}).catch(apply);

  const input=Object.assign(document.createElement('input'),{type:'file',accept:'image/*',hidden:true});
  const menu=document.createElement('div'); menu.className='gx-avatar-menu'; menu.hidden=true; menu.setAttribute('role','menu');
  menu.innerHTML='<button type="button" role="menuitem" data-a="pick">📷 Cambiar foto</button><button type="button" role="menuitem" data-a="clear">🗑 Quitar foto</button><button type="button" role="menuitem" data-a="settings">⚙ Configuración</button><button type="button" role="menuitem" data-a="logout">↪ Cerrar sesión</button>';
  document.body.append(input,menu);
  const logout=document.getElementById('logoutBtn');
  if(logout) logout.style.display='none';
  const pill=document.getElementById('profilePill');
  const settings=document.createElement('dialog');
  settings.className='gx-profile-settings';
  settings.innerHTML=`<section style="background:#121827;color:white;padding:24px;border-radius:16px;width:min(90vw,440px)">
    <h2 style="margin-top:0">Configuración</h2>
    <h3>Fish Audio · Tu propia API</h3>
    <p>Disponible en FREE y PRO. Tu API queda cifrada y vinculada exclusivamente a tu GREÑA ID. Los créditos se descuentan de tu propia cuenta Fish Audio.</p>
    <p data-fish-status role="status">Consultando estado…</p>
    <form data-fish-form autocomplete="off"><label for="gx-fish-key">API privada Fish Audio</label>
      <input id="gx-fish-key" type="password" autocomplete="new-password" spellcheck="false" minlength="20" maxlength="512" placeholder="Pega tu clave Fish Audio" required style="width:100%;padding:12px;margin:8px 0 12px;border-radius:8px;color:white;background:#080d16;border:1px solid #526080">
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="submit">Guardar API</button><button data-s="fish-clear" type="button">Quitar mi API</button></div>
    </form>
    <p style="font-size:12px;color:#a7b5c7">Ninguna API se muestra de nuevo al guardarse. El propietario puede asignarla desde Administración.</p>
    <button data-s="close" type="button" style="margin-top:12px">Cerrar</button>
  </section>`;
  document.body.append(settings);
  const fishStatus=settings.querySelector('[data-fish-status]'),fishForm=settings.querySelector('[data-fish-form]');
  const fishRequest=async(method,body)=>{
    const response=await fetch('/api/license/fish-credentials',{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw Error(data.error||'No se pudo conectar con GREÑA.');
    return data;
  };
  async function fishRefresh(){
    try{
      const access=await fetch('/api/license/status',{cache:'no-store'}).then(r=>r.json());
      if(access.permanentAccess===true){fishForm.hidden=true;fishStatus.textContent='Propietario: se conserva tu configuración original de Fish Audio sin alteraciones.';return}
      const r=await fishRequest('GET');
      fishStatus.textContent=r.configured?'✓ API configurada para esta cuenta. Puedes reemplazarla.':'Sin API propia configurada.';
    }catch(e){fishStatus.textContent=e.message||'No se pudo consultar Fish Audio.'}
  }
  fishForm.addEventListener('submit',async e=>{
    e.preventDefault();const input=settings.querySelector('#gx-fish-key'),apiKey=input.value.trim();
    if(apiKey.length<20)return;
    const submit=fishForm.querySelector('[type="submit"]');submit.disabled=true;
    try{await fishRequest('POST',{apiKey});fishStatus.textContent='✓ API privada guardada y cifrada para tu cuenta.'}
    catch(error){fishStatus.textContent=error.message||'No se pudo guardar.'}
    finally{input.value='';submit.disabled=false}
  });
  settings.addEventListener('click',async e=>{
    const b=e.target.closest('[data-s]');if(!b)return;
    if(b.dataset.s==='close')settings.close();
    if(b.dataset.s==='fish-clear'&&confirm('¿Quitar tu API Fish Audio?')){
      b.disabled=true;try{await fishRequest('DELETE');fishStatus.textContent='API quitada.'}catch(err){fishStatus.textContent=err.message}finally{b.disabled=false}
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
  menu.addEventListener('click',e=>{
    const a=e.target.closest('button')?.dataset.a; if(!a) return; menu.hidden=true;
    if(a==='pick') input.click();
    if(a==='settings'){settings.showModal();fishRefresh()}
    if(a==='logout') logout?.click();
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
