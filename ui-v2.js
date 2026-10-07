(()=>{
  'use strict';
  const body=document.body;if(!body)return;
  const embedded=new URLSearchParams(location.search).get('embed')==='1'&&window.parent!==window;
  if(embedded)document.documentElement.classList.add('grena-embedded');
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text};

  /* 8 · feedback visual de guardado */
  const saveState=document.createElement('div');saveState.className='ui-save-state';saveState.innerHTML='<i></i><span>Ajustes listos</span>';body.appendChild(saveState);
  let saveTimer;
  function saveFeedback(text='Cambios guardados ✓',kind='ok',hold=1500){clearTimeout(saveTimer);saveState.className='ui-save-state show '+kind;$('span',saveState).textContent=text;saveTimer=setTimeout(()=>saveState.classList.remove('show'),hold)}

  /* 6 · jerarquía automática: solo presentación */
  function classifyButtons(){
    $$('button').forEach(b=>{
      if(b.closest('.ui-segmented,.ui-app-dock')||b.classList.contains('nav')||b.classList.contains('control-tab')||b.classList.contains('widget-module-head'))return;
      const t=(b.textContent||'').trim().toLowerCase();
      if(/desconectar|vaciar|eliminar|restablecer|borrar/.test(t))b.classList.add('ui-btn-danger');
      else if(/guardar|aplicar|conectar|crear mi|entrar a|añadir a la cola|copiar link obs|copiar url/.test(t))b.classList.add('ui-btn-primary');
      else if(/probar|vista previa|pausar|siguiente|silenciar|volver|copiar/.test(t))b.classList.add('ui-btn-secondary');
    });
  }

  /* 4 · semántica única para estados */
  function normalizeStatus(el){
    const t=(el.textContent||'').trim().toLowerCase();
    el.classList.remove('ui-status-success','ui-status-warning','ui-status-danger','ui-status-neutral');
    if(/✓|conectad|activa|activo|lista local|listo|ready|reproduciendo/.test(t)&&!/desconectad|no conectado/.test(t))el.classList.add('ui-status-success');
    else if(/espera|pendiente|iniciando|comprobando|reconectando|procesando|conectando|…/.test(t))el.classList.add('ui-status-warning');
    else if(/error|fallo|desconectad|no conectado|no vinculada/.test(t))el.classList.add('ui-status-danger');
    else el.classList.add('ui-status-neutral');
  }
  function normalizeAllStatuses(){ $$('.state-chip,.status-pill,.status.ready,.status.pending,.badge,.cc-mode,.health-pill').forEach(normalizeStatus); }
  const statusObserver=new MutationObserver(()=>{normalizeAllStatuses();if(body.classList.contains('grena-control'))updateControlDashboard()});
  statusObserver.observe(body,{subtree:true,childList:true,characterData:true});

  /* 2 · sidebar plegable de Alertas */
  function setupSidebar(){
    const side=$('.sidebar');if(!side||!body.classList.contains('grena-alerts'))return;
    const btn=document.createElement('button');btn.type='button';btn.className='ui-sidebar-toggle';btn.title='Plegar / expandir menú';btn.setAttribute('aria-label','Plegar o expandir menú');btn.textContent='‹';side.appendChild(btn);
    const key='grenaUiSidebarCollapsed';const apply=v=>body.classList.toggle('ui-sidebar-collapsed',v);
    apply(localStorage.getItem(key)==='1');btn.onclick=()=>{const next=!body.classList.contains('ui-sidebar-collapsed');apply(next);localStorage.setItem(key,next?'1':'0')};
    $$('.nav',side).forEach(n=>n.title=$('span',n)?.textContent?.trim()||n.textContent.trim());
  }

  /* Navegación compacta para pantallas sin sidebar */
  function setupDock(){
    if(embedded||body.classList.contains('grena-control')||body.classList.contains('grena-alerts')||body.classList.contains('grena-login')||body.classList.contains('grena-chat'))return;
    const page=body.classList.contains('grena-widgets')?'widgets':body.classList.contains('grena-cam-room')?'cam':'';if(!page)return;
    const dock=document.createElement('nav');dock.className='ui-app-dock';dock.setAttribute('aria-label','Navegación GREÑA');dock.innerHTML=`<a href="/" title="Creator Control">⌂<span>Inicio</span></a><a href="/alerts.html" title="Alertas">✦<span>Alertas</span></a><a href="/widgets.html" title="Widgets" class="${page==='widgets'?'active':''}">▦<span>Widgets OBS</span></a><a href="/cam-room.html" title="Cam Room" class="${page==='cam'?'active':''}">▣<span>Cam Room</span></a>`;body.appendChild(dock);
  }

  /* 7 · Vista básica / completa */
  function complexityTarget(){
    if(body.classList.contains('grena-chat'))return $('.sub')||$('h1');
    if(body.classList.contains('grena-widgets'))return $('.sub')||$('h1');
    if(body.classList.contains('grena-alerts'))return $('.topbar');
    return null;
  }
  function markAdvanced(){
    if(body.classList.contains('grena-chat')){
      $$('.voice-box').forEach(box=>{if(/filtros|anti-spam/i.test(box.textContent))box.dataset.uiAdvanced='true'});
      ['tiktokSelectedUsers','twitchSelectedUsers','kickSelectedUsers','blockedUsers','blockedWords'].forEach(id=>{const el=document.getElementById(id);el?.closest('.voice-field')?.setAttribute('data-ui-advanced','true')});
    }
    if(body.classList.contains('grena-widgets')){
      ['mcFont','mcName','mcWidth','mcScale','mcPadY','mcPadX','mcAvatar','mcGap','mcRadius','mcOpacity','mcMax','mcFadeAfter','mcDuration','sgFontSize','sgIconSize','sgTextColor','sgAccent','sgOpacity','sgHold','sgTransition'].forEach(id=>{document.getElementById(id)?.closest('.setting')?.setAttribute('data-ui-advanced','true')});
    }
    if(body.classList.contains('grena-alerts')){$$('.control-tab[data-control-tab="advanced"],.control-tab[data-control-tab="layers"]').forEach(x=>x.classList.add('ui-advanced-only'))}
  }
  function setupComplexity(){
    if(body.classList.contains('grena-control')||body.classList.contains('grena-login')||body.classList.contains('grena-chat'))return;
    markAdvanced();const target=complexityTarget();if(!target)return;
    const key='grenaUiMode:'+(body.className.match(/grena-[\w-]+/)||['page'])[0];let mode=localStorage.getItem(key)||'basic';
    const bar=document.createElement('div');bar.className='ui-complexity-bar';bar.innerHTML='<div class="ui-complexity-copy"><i>☰</i><div><b>Nivel de configuración</b><small>Lo esencial primero; los controles finos siguen disponibles.</small></div></div><div class="ui-segmented"><button type="button" data-ui-mode="basic">BÁSICA</button><button type="button" data-ui-mode="full">COMPLETA</button></div>';
    target.insertAdjacentElement('afterend',bar);
    function apply(){body.classList.toggle('ui-basic-mode',mode==='basic');$$('[data-ui-mode]',bar).forEach(b=>b.classList.toggle('on',b.dataset.uiMode===mode));if(mode==='basic'&&body.classList.contains('grena-alerts')){const active=$('.control-tab.active');if(active&&['advanced','layers'].includes(active.dataset.controlTab))$('.control-tab[data-control-tab="style"]')?.click()}}
    $$('[data-ui-mode]',bar).forEach(b=>b.onclick=()=>{mode=b.dataset.uiMode;localStorage.setItem(key,mode);apply()});apply();
  }

  /* 1 + 10 · estado principal y Dashboard */
  let controlDashboardReady=false;
  function platformSummary(row){
    const auth=$('[id$="Auth"]',row),live=$('[id$="Live"]',row),events=$('[id$="Events"]',row);if(!auth||!live||!events)return;
    let label=$('.ui-platform-summary',row);if(!label){label=document.createElement('span');label.className='ui-platform-summary';const copy=$('.platform-id>div',row);copy?.appendChild(label)}
    const on=e=>e.classList.contains('on')||/✓/.test(e.textContent||'');const wait=e=>e.classList.contains('waiting')||/espera|…/.test(e.textContent||'');
    label.className='ui-platform-summary';
    if(!on(auth)){setText(label,'Cuenta sin vincular');label.classList.add('danger')}
    else if(on(live)&&on(events)){setText(label,'Todo listo para el directo');label.classList.add('success')}
    else if(wait(live)||wait(events)){setText(label,'Cuenta lista · esperando motor en vivo');label.classList.add('warning')}
    else{setText(label,'Cuenta vinculada · servicios parciales');label.classList.add('warning')}
  }
  function setupControlDashboard(){
    if(!body.classList.contains('grena-control'))return;
    $$('.platform-row').forEach(platformSummary);
    const stack=$('.platform-stack');if(stack&&!$('.ui-dashboard-strip')){
      const strip=document.createElement('div');strip.className='ui-dashboard-strip';strip.innerHTML=`<div class="ui-glance-card"><span class="ui-glance-icon">◎</span><div><small>CUENTAS</small><b id="uiAccountsCount">0 de 3 conectadas</b></div></div><div class="ui-glance-card events"><span class="ui-glance-icon">⚡</span><div><small>ACTIVIDAD</small><b id="uiEventsGlance">0 eventos esta sesión</b></div></div><div class="ui-glance-card cam"><span class="ui-glance-icon">▣</span><div><small>CAM ROOM</small><b id="uiCamGlance">Sin sala activa</b></div></div>`;stack.insertAdjacentElement('beforebegin',strip);
    }
    updateControlDashboard();controlDashboardReady=true;
    refreshCamGlance();setInterval(refreshCamGlance,10000);
    const obs=new MutationObserver(()=>{$$('.platform-row').forEach(platformSummary);updateControlDashboard()});$$('.state-chip').forEach(ch=>obs.observe(ch,{attributes:true,childList:true,characterData:true,subtree:true}));
  }
  function updateControlDashboard(){
    if(!body.classList.contains('grena-control'))return;const auths=['tiktokAuth','twitchAuth','kickAuth'].map(id=>document.getElementById(id)).filter(Boolean);const n=auths.filter(el=>el.classList.contains('on')||/✓/.test(el.textContent||'')).length;
    const ac=document.getElementById('uiAccountsCount');if(ac)setText(ac,`${n} de 3 conectadas`);const ec=document.getElementById('eventCount');const eg=document.getElementById('uiEventsGlance');if(ec&&eg)setText(eg,`${ec.textContent||0} eventos esta sesión`);
  }
  async function refreshCamGlance(){
    if(!body.classList.contains('grena-control'))return;const el=document.getElementById('uiCamGlance');if(!el)return;try{const d=await fetch('/api/cam-room/current',{cache:'no-store'}).then(r=>r.json());if(!d.room){setText(el,'Sin sala activa');el.title='';return}const n=Number(d.connectedCount||0);setText(el,`${n} conectado${n===1?'':'s'} · ${d.room.code}`);el.title='Abrir GREÑA Cam Room'}catch{setText(el,'Cam Room disponible')}
  }

  /* 5 · mensajes vacíos más humanos */
  function improveEmptyStates(){
    const empty=document.getElementById('empty');if(empty&&body.classList.contains('grena-chat'))empty.setAttribute('aria-label','Sin mensajes todavía');
    $$('.empty').forEach(e=>e.setAttribute('role','status'));
  }

  /* 8 · conecta señales de guardado existentes sin reemplazar sus handlers */
  function hookSaveFeedback(){
    const ids=['saveDesign','quickSaveBottom','saveSettings','mcApplyBtn','loyaltySave','sgReset','mcReset'];
    ids.forEach(id=>{const b=document.getElementById(id);if(!b)return;b.addEventListener('click',()=>{saveFeedback('Guardando…','',650);setTimeout(()=>{const t=(b.textContent||'').toLowerCase();if(/error|⚠/.test(t))saveFeedback('No se pudo guardar','error',1900);else saveFeedback('Cambios guardados ✓','ok',1500)},720)})});
    let autoTimer;$$('#sgTikTok,#sgTwitch,#sgKick,#sgFont,#sgFontSize,#sgIconSize,#sgStyle,#sgTextColor,#sgAccent,#sgOpacity,#sgHold,#sgTransition,#sgAt,#sgUpper').forEach(el=>el.addEventListener('input',()=>{clearTimeout(autoTimer);autoTimer=setTimeout(()=>saveFeedback('Cambios guardados ✓','ok',1100),450)}));
  }

  /* Embedded: regresar al dashboard sin descargar chat */
  if(embedded){$$('a[href="/"],a[href="/index.html"],.cc-home-link').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();window.parent.postMessage({type:'grena-module-close'},location.origin)}))}

  setupSidebar();setupDock();setupComplexity();setupControlDashboard();improveEmptyStates();hookSaveFeedback();classifyButtons();normalizeAllStatuses();
  // Reaplica jerarquía si módulos dinámicos agregan controles.
  setTimeout(classifyButtons,700);
})();
