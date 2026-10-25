/* GREÑA PixelCraft 2.0 — original handcrafted voxel-style sprite system.
   No Minecraft game files/audio are copied. Six event scenes,
   real gifts rasterized to 24px (including animated GIF/WebP when browser permits). */
(function(global){
'use strict';
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palettes={
  emerald:{K:'#103923',D:'#22663a',M:'#38a858',L:'#82ef86',W:'#d5ffe0',S:'#fff5bd',B:'#562f1d',R:'#fe718d'},
  ruby:{K:'#42142b',D:'#822948',M:'#d24b63',L:'#ff8196',W:'#ffe1e5',S:'#ffed9d',B:'#5f2732'},
  diamond:{K:'#143b42',D:'#1d7382',M:'#36bdc9',L:'#8afbfc',W:'#e1ffff',S:'#ffffff',B:'#27506b'},
  gold:{K:'#503719',D:'#a36c26',M:'#edaf3d',L:'#ffe16f',W:'#fff7bb',S:'#ffffed',B:'#704322'},
  magic:{K:'#362046',D:'#613482',M:'#9f6ace',L:'#d7a5f8',W:'#f9e5ff',S:'#fddcf4',B:'#222147'},
  wood:{K:'#34271d',D:'#664222',M:'#986a39',L:'#cca16b',W:'#fbe3af',S:'#e4d6af',B:'#572916'}
};
const textures={
  diamond:[
    '......DD......','.....DLLD.....','....DLWWLD....','...DLWWW WLD...'.replace(' ',''),'..DLMWWWWMLD..','..DLWWWWWWLD..','...DLWWWWLD...','....DLWWLD....','.....DWWD.....','......DD......'
  ],
  emerald:[
    '......DD......','....DDLLDD....','...DLLWWLD....','..DLWWWWWWLD..','..DLWLWWLWLD..','..DLWWWWWWLD..','...DLWWWWLD...','....DLLLLD....','......DD......'
  ],
  rose:[
    '....DDMMDD....','...DMLLLLMD...','..DMLWLLWLMD..','..DMLLLLLLMD..','...DMLLLLMD...','....DDMMDD....','......DD......','.....DMD......','.....DMD......','...DDMMD......','..DLMMD.......','...DDD........','.....DD.......'
  ],
  heart:[
    '..DDDDD..DDDDD..','.DMLLLMD DMLLLMD.'.replace(' ',''),'DMLWWLLMDMLWWLLMD','DMLLLLLLLLLLLLMD','.DMLLLLLLLLLMD..','..DMLLLLLLLMD...','...DMLLLLLMD....','....DMLLLMD.....','.....DMLMD......','......DDD.......'
  ],
  helmet:[
    '....DDDDDDDD....','..DDMLLLLLLMDD..','..DMLWWWWWWLMD..','.DMLWWWWWWWWLMD.','DMLLLLLLLLLLLLMD','DMLLDDDDDDDDLLMD','DMLLD......DLLMD','DMLLD......DLLMD','DDDDD......DDDDD'
  ],
  chest:[
    '..DDDDDDDDDDDD..','..DMMMMMMMMMMD..','..DLLLLLLLLLLD..','..DMDDDDDDDDMD..','..DMLLLLLLLLMD..','..DMLLLWWLLLMD..','..DMLLLWWLLLMD..','..DMLLLLLLLLMD..','..DMMMMMMMMMMD..','..DDDDDDDDDDDD..'
  ],
  apple:[
    '......BB.......','......BD.......','....DDMDDD.....','...DMLLLLMD....','..DMLWWLLLMD...','..DMLLLLLLMD...','..DMLLLLLLMD...','...DMLLLLMD....','....DMMMD......','.....DDD.......'
  ],
  star:[
    '......DD......','......LL......','.....DLLD.....','DDDDDMLLDDDDD.','.DMLLLLLLLMD..','..DMLWWLLMD...','...DMLLLMD....','...DLLLLLD....','..DD....DD....'
  ],
  potion:[
    '.....DDDD.....','.....DLLD.....','......DD......','....DDDDDD....','...DMLLLLMD...','..DMLWWWWLMD..','..DMLWWWWLMD..','..DMLLLLLLMD..','...DMMMMMD....','....DDDDDD....'
  ],
  music:[
    '.....DDDDDD...','.....DLMMLD...','.....DLMMLD...','.....DLMMMD...','.....DLMD.....','..DD.DLMD.....','.DMLD.DLMD.....','..DD...DD......'
  ],
  coin:[
    '....DDDDDD.....','..DDMMMMMDD....','.DMLLLLLLLMD...','DMLLLWWLLLLMD..','DMLLLWWLLLLMD..','DMLLLWWLLLLMD..','.DMLLLLLLLMD...','..DDMMMMMDD....','....DDDDDD.....'
  ],
  sword:[
    '............WW','...........WLL','..........WLLD','.........WLLD.','........WLLD..','.......WLLD...','..DD..WLLD....','..DMLDLLD.....','...DMLLD......','....DDD.......','....DBD.......','...DBBD.......'
  ],
  crown:[
    'D...........D.','DL...D...D..LD','DLL.DLD.DLDLLD','DLLLMLMLMLLLLD','DMLLLLLLLLLLMD','DMLLWWLLWWLLMD','DMMMMMMMMMMMMD','DDDDDDDDDDDDDD'
  ],
  compass:[
    '....DDDDDD....','..DDLLLLLLDD..','.DMLLWWWWLLMD.','DMLLLDDDLLLLMD','DMLLDDMLDLLLMD','DMLLDMMMDLLLMD','DMLLLDDDLLLLMD','.DMLLWWWWLLMD.','..DDLLLLLLDD..','....DDDDDD....'
  ],
  bread:[
    '....DDDDDDD....','...DMMMMMMMD...','..DMLLLLLLLMD..','.DMLWLLLLLWMD.','.DMLLWLLWLWMD.','.DMLLLLLLLLMD.','..DMMMMMMMMD..','...DDDDDDDDD...'
  ],
  sparkle:[
    '......DD......','......LM......','....DMLLMD....','...DMLWWLMD...','DDDDDMLLDDDDD.','...DMLWWLMD...','....DMLLMD....','......LM......','......DD......'
  ],
  player:[
    '....DDDDDDDD....','...DMLLLLLLMD...','..DMLWWWWWWLMD..','..DMLKKLLKKLMD..','..DMLLLLLLLLMD..','...DMMMMMMMMD...','..DDDLLLLLDDD...','.DMLLLWWLLLMD...','DMLLLLWWLLLLMD..','DMLLLLWWLLLLMD..','DDDLLLLLLLLDDD..','...DMLLLLMD.....','...DML..LMD.....','...DMD..DMD.....','...DDD..DDD.....'
  ]
};
function sprite(kind,palette='diamond',extra=''){
  const rows=textures[kind]||textures.chest,colors=palettes[palette]||palettes.diamond;
  const w=Math.max(...rows.map(s=>s.length));
  let cells='';
  // Merge horizontal runs so even the larger pixel characters need few SVG elements.
  for(let y=0;y<rows.length;y++){
    const row=rows[y];let x=0;
    while(x<row.length){
      const c=row[x];if(c==='.'||!colors[c]){x++;continue}
      let end=x+1;while(end<row.length&&row[end]===c)end++;
      cells+='<rect x="'+x+'" y="'+y+'" width="'+(end-x)+'" height="1" fill="'+colors[c]+'"/>';
      x=end;
    }
  }
  return '<svg class="mc-sprite mc-sprite-'+kind+'" viewBox="0 0 '+w+' '+rows.length+'" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" aria-hidden="true" '+extra+'>'+cells+'</svg>';
}
function giftType(gift){
 const n=String(gift||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(/sombrero|hat|cap|casco|helmet/.test(n))return ['helmet','diamond'];
 if(/rosa|flor|flower|rose|tulip|garden/.test(n))return ['rose','ruby'];
 if(/coraz|amor|heart|quiereme|love|kiss|beso/.test(n))return ['heart','ruby'];
 if(/diamante|diamond|crystal|cristal|joya|gem/.test(n))return ['diamond','diamond'];
 if(/esmeralda|emerald|verde/.test(n))return ['emerald','emerald'];
 if(/corona|crown|rey|queen|king/.test(n))return ['crown','gold'];
 if(/oro|gold|coin|moneda|kicks|bits|starvie/.test(n))return ['coin','gold'];
 if(/manzana|apple|food|comida/.test(n))return ['apple','ruby'];
 if(/pan|bread|cake|pastel|torta/.test(n))return ['bread','wood'];
 if(/musica|music|disco|guitarra|song|radio/.test(n))return ['music','magic'];
 if(/espada|sword|arma/.test(n))return ['sword','diamond'];
 if(/pocion|potion|magia/.test(n))return ['potion','magic'];
 if(/galax|estrella|star|firework|fuego|cosmos/.test(n))return ['star','gold'];
 return ['chest','gold'];
}
const labels={
 follow:['NUEVO JUGADOR','SE UNIÓ AL DIRECTO','player','diamond','experience'],
 gift:['OBJETO CONSEGUIDO','¡TESORO RECIBIDO!','chest','gold','pickup'],
 sub:['LOGRO DESBLOQUEADO','MIEMBRO DEL EQUIPO','crown','gold','levelup'],
 raid:['¡HORDA ENTRANTE!','SE UNEN A LA AVENTURA','sword','magic','raid'],
 share:['MISIÓN COMPARTIDA','UN MUNDO MÁS GRANDE','compass','emerald','place'],
 likes:['+ CORAZONES','VIDA PARA EL TEAM','heart','ruby','eat']
};
function render(type,data={},opts={}){
 const event=labels[type]?type:'follow',meta=labels[event],amount=Math.max(1,Math.min(99999,Number(data.amount)||1));
 const name=safe(String(data.name||'Alguien').slice(0,54)),platform=safe(String(opts.platform||'LIVE').slice(0,24));
 const gift=safe(String(data.gift||'Regalo').slice(0,54));
 const original=event==='gift'&&typeof opts.giftSource==='string'&&opts.giftSource.length<1900?opts.giftSource:'';
 const [item,itemPalette]=event==='gift'?giftType(data.gift):[meta[2],meta[3]];
 const accent=/^#[0-9a-f]{6}$/i.test(String(opts.accent||''))?opts.accent:'#79e9a8';
 const giftCanvas=original?'<canvas class="mc-source-pixel" data-mc-src="'+safe(original)+'" width="24" height="24" aria-hidden="true"></canvas>':'';
 const count=event==='gift'?'<span class="mc-quantity">x'+amount+'</span>':'';
 const extra=event==='gift'?'<div class="mc-item-name">'+gift+'</div>':event==='raid'?'<div class="mc-item-name">+'+amount+' JUGADORES</div>':event==='likes'?'<div class="mc-item-name">+'+amount+' ❤</div>':'';
 const hud=(event==='likes'?'<div class="mc-hearts" aria-hidden="true">♥ ♥ ♥ ♥ ♥</div>':event==='gift'?'<div class="mc-hud-label">+ OBJETO AL INVENTARIO</div>':event==='sub'?'<div class="mc-hud-label">✦ NUEVO LOGRO ✦</div>':'');
 const bits=Array.from({length:18},(_,i)=>'<b style="--p:'+i+';--x:'+((i*29+13)%90)+'%;--y:'+((i*37+9)%90)+'%;--dx:'+((i%2?-1:1)*(12+i*4))+'px"></b>').join('');
 return '<div class="mc-scene mc-'+event+'" data-mc-event="'+event+'" style="--mc-event-accent:'+accent+'">'
   +'<div class="mc-particles" aria-hidden="true">'+bits+'</div><div class="mc-item" aria-hidden="true"><div class="mc-pixel-shadow"></div>'
   +sprite(item,itemPalette)+giftCanvas+count+'</div>'
   +'<div class="mc-copy"><div class="mc-tiny">'+platform+' <span class="mc-pixel-dot">◆</span> PIXELCRAFT</div>'
   +'<div class="mc-title">'+meta[0]+'</div><div class="mc-person">'+name+'</div>'
   +extra+'<div class="mc-subtitle">'+meta[1]+'</div>'+hud
   +'<div class="mc-xp-bar" aria-hidden="true"><span></span></div>'
   +'</div><div class="mc-ground" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>';
}
function prepare(container){
 // The canvas is deliberately 24x24: CSS nearest-neighbor scaling produces real
 // pixels, rather than simply applying image-rendering to a full-resolution icon.
 // Drawing frames repeatedly preserves motion in platform-provided animated gifts.
 const nodes=container.querySelectorAll('.mc-source-pixel');
 nodes.forEach(canvas=>{
   const url=canvas.dataset.mcSrc||'';
   if(!/^https:\/\//i.test(url)&&!url.startsWith('/assets/'))return;
   const ctx=canvas.getContext('2d',{alpha:true});
   if(!ctx)return;
   const img=new Image();img.decoding='async';
   let alive=true,shown=false,interval;
   function draw(){
     if(!canvas.isConnected){alive=false;clearInterval(interval);return}
     if(img.naturalWidth<1||img.naturalHeight<1)return;
     try{
       ctx.clearRect(0,0,24,24);
       ctx.imageSmoothingEnabled=true;
       const scale=Math.min(24/img.naturalWidth,24/img.naturalHeight);
       const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
       ctx.drawImage(img,(24-w)/2,(24-h)/2,w,h);
       if(!shown){shown=true;canvas.classList.add('mc-pixel-ready')}
     }catch{clearInterval(interval)}
   }
   img.onload=()=>{if(!alive)return;draw();interval=setInterval(draw,100)};
   img.onerror=()=>{canvas.classList.add('mc-source-missing')};
   img.src=url;
 });
}
global.AfterglowMinecraft={render,prepare,sprite,giftType,events:Object.keys(labels),version:'pixelpack-2'};
})(window);