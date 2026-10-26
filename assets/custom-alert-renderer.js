/* GREÑA LIVE · Reproductor compartido para alertas personalizadas.
   No interpreta HTML de espectadores ni de la configuración. OBS siempre transparente. */
(function(global){
'use strict';
const palette={tiktok:'#4be9ff',twitch:'#a778ff',kick:'#b8fc58',starvios:'#ff84bd',youtube:'#ff526a'};
function node(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);
  return el;
}
function safeMedia(value){
  const s=String(value||'');
  if(/^https:\/\/[^\s<>"']+$/i.test(s))return s;
  if(/^\/api\/custom-alerts\/media\/[A-Za-z0-9_-]{10,80}\.(png|jpg|gif|webp|mp3|wav|ogg|mp4|webm)$/i.test(s))return s;
  if(/^\/assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:png|jpg|jpeg|webp|gif|svg)$/i.test(s))return s;
  return '';
}
function template(value,a,opts){
  const v={user:a.name||'Usuario',platform:a.platform||'TikTok',gift:a.giftName||'regalo',count:a.count||1,
    value:a.totalDiamonds||a.bits||a.amount||a.value||0,owner:opts.owner||''};
  return String(value||'').replace(/\{(user|platform|gift|count|value|owner)\}/gi,(full,k)=>String(v[k.toLowerCase()]??'')).slice(0,500);
}
function mediaUrl(src,opts){
  if(src.startsWith('/api/custom-alerts/media/')&&opts.obsToken){
    return src+'?obs='+encodeURIComponent(opts.obsToken);
  }
  return src;
}
function create(root,alert,options={}){
  const a=alert?.customAction||alert?.actionDefinition;
  if(!a||!root)return null;
  const orient=a.orientation||'both',layout=options.layout||'vertical';
  if(orient!=='both'&&orient!==layout)return null;
  const platform=String(alert.platform||'tiktok').toLowerCase();
  const main=a.color||palette[platform]||'#a855f7';
  const stage=node('div','gca-stage');
  stage.style.setProperty('--gca-accent',main);
  stage.style.setProperty('--gca-text',a.textColor||'#ffffff');
  stage.classList.add('gca-'+(a.style||'neon'),'gca-enter-'+(a.animation||'pop'));
  if(layout==='horizontal')stage.classList.add('gca-horizontal');
  const glow=node('div','gca-glow');stage.appendChild(glow);
  const card=node('div','gca-card');
  const badge=node('div','gca-platform',String(alert.platform||'TikTok').toUpperCase());
  card.appendChild(badge);
  const center=node('div','gca-content');
  const asset=safeMedia(a.video)||safeMedia(a.image);
  if(asset){
    const isVideo=!!safeMedia(a.video);
    const el=document.createElement(isVideo?'video':'img');
    el.className='gca-media';
    el.src=mediaUrl(asset,options);
    if(isVideo){el.autoplay=true;el.muted=true;el.loop=false;el.playsInline=true;}
    else el.alt='';
    center.appendChild(el);
  }else if(a.showGift!==false&&alert.giftImage&&safeMedia(alert.giftImage)){
    const art=node('img','gca-media');
    art.src=mediaUrl(safeMedia(alert.giftImage),options);
    art.alt='';
    center.appendChild(art);
  }else if(a.showAvatar!==false&&alert.avatar&&safeMedia(alert.avatar)){
    const avatar=node('img','gca-avatar');
    avatar.src=safeMedia(alert.avatar);
    avatar.alt='';
    center.appendChild(avatar);
  }else{
    center.appendChild(node('div','gca-symbol','✦'));
  }
  center.appendChild(node('div','gca-title',template(a.title,alert,options)));
  center.appendChild(node('div','gca-message',template(a.message,alert,options)));
  card.appendChild(center);
  stage.appendChild(card);
  for(let i=0;i<12;i++){
    const star=node('i','gca-spark');
    star.style.setProperty('--i',String(i));
    star.style.setProperty('--turn',String(i*30)+'deg');
    stage.appendChild(star);
  }
  root.replaceChildren(stage);
  let audio=null,utterance=null;
  if(!options.preview){
    const src=safeMedia(a.audio);
    if(src&&a.playAudio!==false&&options.soundEnabled!==false){
      audio=new Audio(mediaUrl(src,options));
      audio.volume=Math.max(0,Math.min(1,Number(a.volume??70)/100))*Math.max(0,Math.min(1,Number(options.volume??100)/100));
      audio.play().catch(()=>{});
    }
    if(a.tts===true&&typeof speechSynthesis!=='undefined'&&options.soundEnabled!==false){
      try{
        const phrase=template(a.message,alert,options).slice(0,220);
        if(phrase){utterance=new SpeechSynthesisUtterance(phrase);utterance.lang='es-ES';utterance.rate=1;utterance.volume=Math.max(0,Math.min(1,Number(a.volume??70)/100));speechSynthesis.speak(utterance)}
      }catch{}
    }
  }
  return {
    durationMs:Math.max(2000,Math.min(30000,Number(a.duration||7)*1000)),
    leave(){stage.classList.add('gca-outro')},
    destroy(){if(audio){audio.pause();audio.src='';}if(utterance&&typeof speechSynthesis!=='undefined')try{speechSynthesis.cancel()}catch{};if(root.contains(stage))stage.remove()}
  };
}
global.GrenaCustomAlerts={create,template};
})(window);
