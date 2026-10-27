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
  menu.innerHTML='<button type="button" role="menuitem" data-a="pick">📷 Cambiar foto</button><button type="button" role="menuitem" data-a="clear">🗑 Quitar foto</button>';
  document.body.append(input,menu);
  av.tabIndex=0; av.setAttribute('role','button'); av.title='Clic para cambiar tu foto de perfil'; av.setAttribute('aria-haspopup','menu'); av.setAttribute('aria-expanded','false');
  const note=msg=>{const t=document.createElement('div');t.className='gx-toast';t.setAttribute('role','status');t.textContent=msg;document.body.append(t);setTimeout(()=>t.remove(),3200)};
  const toggle=()=>{const r=av.getBoundingClientRect();
    menu.style.top=r.bottom+10+'px'; menu.style.left=Math.max(8,Math.min(r.left,innerWidth-190))+'px'; menu.hidden=!menu.hidden; av.setAttribute('aria-expanded',String(!menu.hidden))};
  av.addEventListener('click',e=>{e.stopPropagation();toggle()});
  av.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
  document.addEventListener('click',()=>{menu.hidden=true;av.setAttribute('aria-expanded','false')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;av.setAttribute('aria-expanded','false')}});
  menu.addEventListener('click',e=>{
    const a=e.target.closest('button')?.dataset.a; if(!a) return; menu.hidden=true;
    if(a==='pick') input.click();
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
