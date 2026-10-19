/* GREÑA Minecraft — distinctive pixel world visual alert, transparent and OBS-safe.
   Receives already normalized real platform events. No second websocket. */
(function(global){
  'use strict';
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const armor='<svg class="mc-character" viewBox="0 0 36 55" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true">'
    +'<path fill="#112e30" d="M9 1h18v4h4v13h-4v3H9v-3H5V5h4z"/>'
    +'<path fill="#64eaf0" d="M9 1h18v4H9zM5 5h5v13H5zM26 5h5v13h-5z"/>'
    +'<path fill="#d9ffff" d="M12 7h12v3H12z"/>'
    +'<path fill="#7d4a2c" d="M10 10h16v11H10z"/>'
    +'<path fill="#edba90" d="M10 13h16v8H10z"/>'
    +'<path fill="#161c20" d="M13 14h4v3h-4zm8 0h4v3h-4z"/>'
    +'<path fill="#26bace" d="M9 22h18v15H9zM4 24h5v12H4zm23 0h5v12h-5z"/>'
    +'<path fill="#6effee" d="M9 23h18v4H9zM4 24h5v3H4zm23 0h5v3h-5z"/>'
    +'<path fill="#174953" d="M12 28h12v9H12z"/>'
    +'<path fill="#29bcda" d="M10 37h7v16h-7zm9 0h7v16h-7z"/>'
    +'<path fill="#dcffff" d="M10 39h7v3h-7zm9 0h7v3h-7z"/>'
    +'<path fill="#174953" d="M10 51h7v3h-7zm9 0h7v3h-7z"/>'
    +'</svg>';
  const icon={
    follow:armor,
    gift:'<svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true"><path fill="#1b5248" d="M9 3h14v4h4v7h-4v4h-4v4h-6v-4H9v-4H5V7h4z"/><path fill="#a7ffcf" d="M9 3h14v4H9zM5 7h4v7H5zm18 0h4v7h-4z"/><path fill="#4ae4c4" d="M9 7h14v10H9zM13 17h6v5h-6z"/><path fill="#eefffe" d="M12 10h8v3h-8z"/><path fill="#0e3b39" d="M13 22h6v5h-6z"/></svg>',
    sub:'<svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true"><path fill="#e5ac36" d="M2 8h5v5h5V8h5v5h5V8h8v16H2z"/><path fill="#ffeb8b" d="M2 8h5v5H2zm10 0h5v5h-5zm10 0h8v5h-8zM5 17h22v4H5z"/><path fill="#916319" d="M4 24h24v3H4z"/></svg>',
    raid:'<svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true"><path fill="#c4a6ff" d="M18 1h6v4h-3v4h-3v4h-3v5h-3v5H6v8h5v-5h5v-5h3v-4h4v-4h3V9h3V5h-5V1z"/><path fill="#633b90" d="M10 29h4v3h-4z"/></svg>',
    share:'<svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true"><path fill="#93ed95" d="M23 3h6v6h-4v4h-4v4h-5v5H7v5H3v-9h4v-5h9V9h7z"/><path fill="#224c2b" d="M5 25h10v3H5z"/></svg>',
    likes:'<svg viewBox="0 0 32 32" shape-rendering="crispEdges" aria-hidden="true"><path fill="#ff668d" d="M5 5h9v4h4V5h9v4h4v10h-4v4h-5v4h-5v4h-4v-4H8v-4H3V9h2z"/><path fill="#ffd3dd" d="M7 8h6v3H7z"/></svg>'
  };
  const labels={
    follow:['¡NUEVO GREÑERO!','SE UNIÓ AL TEAM GREÑA'],
    gift:['¡REGALO RECIBIDO!','TESORO CONSEGUIDO'],
    sub:['¡SUBIDA DE NIVEL!','SUSCRIPCIÓN DESBLOQUEADA'],
    raid:['¡INVASIÓN ÉPICA!','UNA COMUNIDAD SE ACERCA'],
    share:['¡MUNDO COMPARTIDO!','LA AVENTURA SE EXPANDE'],
    likes:['¡CORAZONES!','ENERGÍA PARA EL TEAM']
  };
  function render(type,s,options={}){
    const detail=labels[type]||labels.follow;
    const platform=safe(options.platform||'LIVE');
    const user=safe(s.name||'GREÑERO');
    const amount=safe(s.amount||1);
    const gift=safe(s.gift||'Regalo');
    const giftIcon=(type==='gift'&&typeof options.giftMarkup==='string')?options.giftMarkup:icon[type]||icon.follow;
    let extra='';
    if(type==='gift')extra='<span class="mc-object">'+gift+'</span><span class="mc-count">×'+amount+'</span>';
    else if(type==='raid')extra='<span class="mc-count">'+amount+' ESPECTADORES</span>';
    else if(type==='likes')extra='<span class="mc-count">+'+amount+' ♥</span>';
    return '<div class="mc-scene mc-'+type+'">'
     +'<div class="mc-sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>'
     +'<div class="mc-art" aria-hidden="true">'+giftIcon+'</div>'
     +'<div class="mc-content"><div class="mc-eyebrow">'+platform+' · TEAM GREÑA</div>'
     +'<div class="mc-action">'+detail[0]+'</div><div class="mc-user">'+user+'</div>'
     +'<div class="mc-extra">'+extra+'</div><div class="mc-footer">'+detail[1]+'</div>'
     +'<div class="mc-xp"><span></span></div></div></div>';
  }
  global.AfterglowMinecraft={render,events:Object.keys(labels)};
})(window);
