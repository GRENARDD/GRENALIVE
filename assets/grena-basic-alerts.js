/* GREÑA BASIC ALERTS — transparent OBS animations, no external downloads. */
(()=>{
'use strict';
const themes={
celestial:{name:'Celestial Strike',icon:'✦',accent:'#7ce8ff',accent2:'#546cff',sound:620},
sakura:{name:'Sakura Spirit',icon:'❀',accent:'#ffa5d8',accent2:'#ff4fac',sound:880},
comic:{name:'Comic Impact',icon:'POW!',accent:'#ffe436',accent2:'#ff6535',sound:270},
hologram:{name:'Hologram X',icon:'⌬',accent:'#5cf6fb',accent2:'#118dc9',sound:540},
inferno:{name:'Inferno Boss',icon:'♨',accent:'#ffb53d',accent2:'#f04419',sound:230},
arcade:{name:'Retro Arcade',icon:'★',accent:'#bd65ff',accent2:'#21f4df',sound:700},
royal:{name:'Royal Relic',icon:'♛',accent:'#ffe39b',accent2:'#ca8a22',sound:480},
void:{name:'Void Portal',icon:'◉',accent:'#d18dff',accent2:'#5c2edf',sound:390}
};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const evt={follow:'NUEVO SEGUIDOR',gift:'REGALO RECIBIDO',sub:'NUEVA SUSCRIPCIÓN',raid:'RAID ENTRANTE',share:'DIRECTO COMPARTIDO',likes:'LLUVIA DE LIKES'};
function render(key,event,data,{platform='EN VIVO'}={}){
const t=themes[key]||themes.celestial;const label=evt[event]||'NUEVO EVENTO';
const details=event==='gift'?escape(data.gift||'Regalo')+' ×'+escape(data.amount||1):event==='raid'?escape(data.amount||1)+' espectadores':event==='likes'?'+'+escape(data.amount||1)+' likes':event==='follow'?'¡Bienvenido a la comunidad!':event==='sub'?'Gracias por apoyar el directo':event==='share'?'Gracias por compartir el LIVE':'';
return '<section class="basic-alert basic-'+key+'" style="--basic-a:'+t.accent+';--basic-b:'+t.accent2+'"><div class="basic-sparks" aria-hidden="true"></div><div class="basic-crest" aria-hidden="true">'+t.icon+'</div><div class="basic-copy"><span class="basic-kicker">'+escape(platform)+' · '+label+'</span><strong class="basic-person">'+escape(data.name||'Usuario')+'</strong><span class="basic-detail">'+details+'</span></div><div class="basic-trail" aria-hidden="true"></div></section>';
}
let ctx;
function play(key,event,{volume=54,enabled=true}={}){
if(!enabled)return;
try{
 const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;
 ctx=ctx||new AudioCtx();if(ctx.state==='suspended')ctx.resume().catch(()=>{});
 const now=ctx.currentTime,base=(themes[key]||themes.celestial).sound;
 const notes=event==='gift'?[1,1.25,1.5,2]:event==='follow'?[1,1.25,1.5]:event==='sub'?[1,1.5,2]:event==='raid'?[.5,1,1.5]:[1,1.2];
 notes.forEach((m,i)=>{const o=ctx.createOscillator(),gain=ctx.createGain(),at=now+i*.105;o.type=key==='arcade'?'square':key==='comic'?'sawtooth':'sine';o.frequency.setValueAtTime(base*m,at);o.frequency.exponentialRampToValueAtTime(base*m*.88,at+.16);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.001,(volume/100)*.09),at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+.22);o.connect(gain);gain.connect(ctx.destination);o.start(at);o.stop(at+.23)});
}catch(e){console.warn('GREÑA basic audio:',e)}
}
window.GrenaBasicAlerts={themes,render,play};
})();