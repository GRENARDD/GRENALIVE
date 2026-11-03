/* ASCENSION PREMIUM: dynamic multi-platform alerts, no creator-specific text. */
(function(){
"use strict";
var EVENTS={
 gift:{title:"REGALO RECIBIDO",intro:"EVENTO LEGENDARIO DESBLOQUEADO",glyph:"✦",klass:"gift"},
 follow:{title:"NUEVO SEGUIDOR",intro:"NUEVA CONEXIÓN ESTABLECIDA",glyph:"◇",klass:"follow"},
 sub:{title:"NUEVA SUSCRIPCIÓN",intro:"ASCENSO DE RANGO",glyph:"♛",klass:"sub"},
 raid:{title:"RAID ENTRANTE",intro:"NUEVA ENERGÍA EN EL DIRECTO",glyph:"⚡",klass:"raid"},
 share:{title:"DIRECTO COMPARTIDO",intro:"LA COMUNIDAD SIGUE CRECIENDO",glyph:"↗",klass:"follow"},
 likes:{title:"LIKES RECIBIDOS",intro:"ENERGÍA DESBLOQUEADA",glyph:"♥",klass:"raid"}
};
var LOGOS={tiktok:"♪",twitch:"♜",kick:"K",starvios:"✦",youtube:"▶"};
var audioContext=null;
function clean(v,max){return String(v==null?"":v).trim().slice(0,max||64)}
function escape(v){return clean(v,1600).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function clamp(v,def){var n=Number(v);return Number.isFinite(n)?Math.max(1,Math.min(99999,Math.floor(n))):def}
function particles(){var arr=[];for(var i=0;i<46;i++){var angle=i*2.399963229728653,r=105+((i*43)%160),x=Math.cos(angle)*r,y=Math.sin(angle)*r*.66,s=2+i%5,d=.31+(i%9)*.038,dur=.9+(i%6)*.15;arr.push('<i class="particle" style="--dx:'+x.toFixed(1)+'px;--dy:'+y.toFixed(1)+'px;--size:'+s+'px;--rad:'+(i%3?"50%":"1px")+';--delay:'+d+'s;--dur:'+dur+'s"></i>')}return arr.join("")}
function create(event,data,opts){
 data=data||{};opts=opts||{};
 var e=EVENTS[event]||EVENTS.follow;
 var platform=clean(opts.platform||"En vivo",24),platformId=platform.toLowerCase();
 var owner=clean(opts.ownerName,64),sender=clean(data.name||"Alguien",64),amount=clamp(data.amount,1);
 var ownerText=owner||"EN DIRECTO";
 var details=event==="gift"?"Envió <b>"+escape(data.gift||"Regalo")+" ×"+amount.toLocaleString("es-DO")+"</b>":
   event==="raid"?"Llegó con <b>"+amount.toLocaleString("es-DO")+" espectadores</b>":
   event==="likes"?"Envió <b>"+amount.toLocaleString("es-DO")+" likes</b>":
   event==="follow"?"<b>¡Gracias por seguir el canal!</b>":
   event==="sub"?"<b>¡Nueva suscripción activada!</b> Gracias por apoyar.":
   event==="share"?"<b>¡Gracias por compartir el directo!</b>":"";
 var host=document.createElement("div");
 host.className="ascension-host";
 host.setAttribute("data-layout",opts.layout==="vertical"?"vertical":"horizontal");
 var shadow=host.attachShadow({mode:"open"});
 var link=document.createElement("link");
 link.rel="stylesheet";link.href="/assets/ascension-alerts.css?v=1";shadow.appendChild(link);
 var container=document.createElement("div");container.className="scene"+(opts.layout==="vertical"?" vertical":"");
 var markup='<div class="alert is-'+e.klass+' playing"><div class="video-flash"></div><div class="halo"></div><div class="rays"></div><div class="energy"></div>'+
 '<div class="orbit"></div><div class="orbit o2"></div><div class="orbit o3"></div><div class="shockwave"></div><div class="shockwave s2"></div>'+
 '<div class="particle-cloud">'+particles()+'</div>'+
 '<div class="top-brand">'+escape(ownerText)+' <span style="color:var(--a)">✦</span> ASCENSIÓN</div>'+
 '<div class="sigil"><div class="disc"></div><div class="symbol">'+escape(e.glyph)+'</div></div>'+
 '<div class="caption-module"><div class="serial">'+escape(e.intro)+'</div>'+
 '<div class="nameplate"><div class="corners"><i></i><i></i><i></i><i></i></div>'+
 '<div class="topline"><span class="platform-mark">'+escape(LOGOS[platformId]||"✦")+'</span><span>'+escape(e.title)+'</span><span>✦</span></div>'+
 '<h2>'+escape(sender)+'</h2><div class="description">'+details+'</div></div>'+
 '<div class="bottom-badge">'+escape(platform.toUpperCase())+' · '+escape(ownerText)+'</div></div></div>';
 container.innerHTML=markup;shadow.appendChild(container);
 return host;
}
function blip(freq,t,seconds,loud,wave,slide){
 var c=audioContext,o=c.createOscillator(),g=c.createGain();
 o.type=wave||"sine";o.frequency.setValueAtTime(freq,t);
 o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*(slide||1)),t+seconds);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0005,loud),t+.012);
 g.gain.exponentialRampToValueAtTime(.0001,t+seconds);o.connect(g);g.connect(c.destination);
 o.start(t);o.stop(t+seconds+.025);
}
function play(event,options){
 options=options||{};if(options.enabled===false||!(Number(options.volume)>0))return;
 try{
  var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
  audioContext=audioContext||new AC();if(audioContext.state==="suspended")audioContext.resume().catch(function(){});
  var t=audioContext.currentTime+.035,v=Math.min(1,Number(options.volume)/100)*.075;
  blip(event==="raid"?66:85,t,.42,v*.9,"sine",.62);
  blip(155,t+.1,.5,v*.7,"triangle",1.58);
  var notes={gift:[392,523,659,1046],follow:[440,554,659],sub:[330,440,659,880],raid:[196,262,392,523],share:[523,659,880],likes:[392,587,783]};
  (notes[event]||notes.follow).forEach(function(f,i){blip(f,t+.33+i*.095,.42,v*.8,event==="raid"?"sawtooth":"sine",1.03)});
  if(event==="gift")blip(1568,t+.81,.6,v*.45,"sine",1.21);
 }catch(e){console.warn("Ascension audio unavailable",e)}
}
window.GrenaAscension={create:create,play:play,events:Object.keys(EVENTS)};
})();