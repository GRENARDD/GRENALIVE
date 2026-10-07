const root=document.getElementById('overlayRoot');
let socket,reconnectTimer,playing=false,activeAlertStyle='classic';const queue=[];
const MAX_QUEUE=40;
const ALERT_PRIORITY={mega:100,raid:90,giftsub:85,gift:80,cheer:80,subrenew:75,sub:70,milestone:65,record:65,follow:40,share:25,like:15};
const smartSvg=(kind)=>{const icons={follow:'%E2%99%A5',sub:'%E2%99%9B',subrenew:'%E2%86%BB',giftsub:'%F0%9F%8E%81',share:'%E2%86%97',raid:'%E2%9A%A1',like:'%E2%99%A5',milestone:'%E2%98%85',record:'%E2%86%91',mega:'%E2%9C%A6',cheer:'%E2%97%86'};const t=icons[kind]||'%E2%9C%A6';return `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 96 96%22%3E%3Ccircle cx=%2248%22 cy=%2248%22 r=%2242%22 fill=%22%23101622%22 stroke=%22%23fff%22 stroke-width=%224%22/%3E%3Ctext x=%2248%22 y=%2262%22 text-anchor=%22middle%22 font-size=%2244%22 fill=%22%23fff%22%3E${t}%3C/text%3E%3C/svg%3E`};
function priorityOf(a={}){if(a.mega||a.priority==='mega')return ALERT_PRIORITY.mega;return ALERT_PRIORITY[String(a.event||'').toLowerCase()]||50}

function connect(){
  socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}`);
  socket.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.type==='alert')enqueue(d.alert);if(d.type==='alert-style'&&['classic','option-a'].includes(d.style))activeAlertStyle=d.style}catch{}};
  socket.onclose=()=>{clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,1500)};
}
function sameGift(a={},b={}){
  return a.event==='gift'&&b.event==='gift'
    &&String(a.platform||'').toLowerCase()===String(b.platform||'').toLowerCase()
    &&String(a.name||'').toLowerCase()===String(b.name||'').toLowerCase()
    &&String(a.giftName||'').toLowerCase()===String(b.giftName||'').toLowerCase();
}
function enqueue(a={}){
  const last=queue[queue.length-1];
  if(last&&sameGift(last,a)){
    last.count=Math.max(1,Number(last.count)||1)+Math.max(1,Number(a.count)||1);
    if(Number(a.totalDiamonds)>0)last.totalDiamonds=(Number(last.totalDiamonds)||0)+(Number(a.totalDiamonds)||0);
    if(Number(a.amount)>0)last.amount=(Number(last.amount)||0)+(Number(a.amount)||0);
    if(Number(a.bits)>0)last.bits=(Number(last.bits)||0)+(Number(a.bits)||0);
    if(a.giftImage&&!last.giftImage)last.giftImage=a.giftImage;
    return;
  }
  if(queue.length>=MAX_QUEUE){
    const low=queue.findIndex(x=>['like','share','follow'].includes(String(x.event||'')));
    if(low>=0)queue.splice(low,1);else queue.shift();
  }
  const p=priorityOf(a);let at=queue.findIndex(x=>priorityOf(x)<p);if(at<0)queue.push(a);else queue.splice(at,0,a);next()
}
function next(){if(playing||!queue.length)return;playing=true;show(queue.shift())}
function initials(n='U'){const s=String(n??'').trim();if(!s)return 'U';let g='';try{if(typeof Intl!=='undefined'&&Intl.Segmenter){const it=new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(s)[Symbol.iterator]().next();if(!it.done)g=it.value.segment}}catch{}if(!g)g=Array.from(s)[0]||'U';return g.toUpperCase().replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';')}
function eventName(a={}){if(a.event==='gift'&&a.giftName)return `REGALO · ${String(a.giftName).toUpperCase()}`;if(a.event==='cheer'&&Number(a.bits)>0)return `${Number(a.bits).toLocaleString('es-DO')} BITS RECIBIDOS`;return a.eventLabel||({follow:'NUEVO SEGUIDOR',sub:'NUEVA SUSCRIPCIÓN',subrenew:'RENOVÓ SUSCRIPCIÓN',giftsub:'SUSCRIPCIONES REGALADAS',gift:'REGALO RECIBIDO',cheer:'BITS / APOYO',share:'COMPARTIÓ EL LIVE',raid:'RAID',like:'META DE LIKES',milestone:'META ALCANZADA',record:'NUEVO RÉCORD',mega:'MEGA ALERTA'})[a.event]||'EVENTO'}
function platformShort(p=''){return /tiktok/i.test(p)?'TikTok':/twitch/i.test(p)?'Twitch':/kick/i.test(p)?'Kick':String(p||'Stream')}
function platformIconSrc(p=''){
  if(/tiktok/i.test(p))return '/assets/platforms/tiktok.webp';
  if(/twitch/i.test(p))return '/assets/platforms/twitch.webp';
  if(/kick/i.test(p))return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Cpath fill=%22%2353FC18%22 d=%22M8 8h14v18h6l10-18h18L42 31l14 25H38L28 38h-6v18H8z%22/%3E%3C/svg%3E';
  return '';
}
function defaultPalette(a={}){
  const platform=String(a.platform||'').toLowerCase();
  if(platform.includes('tiktok')) return ['#ff334f','#ff6b81'];
  if(platform.includes('twitch')) return ['#9146ff','#bf94ff'];
  if(platform.includes('kick')) return ['#39ff88','#0bbf5b'];
  return ['#a855f7','#22d3ee'];
}
function resolveAccents(a={}){
  const [d1,d2]=defaultPalette(a);
  const generic1=String(a.accent||'').toLowerCase()==='#a855f7';
  const generic2=String(a.accent2||'').toLowerCase()==='#22d3ee';
  return {
    accent: a.accent && !generic1 ? a.accent : d1,
    accent2: a.accent2 && !generic2 ? a.accent2 : d2
  };
}
function metaChips(a={}){
  const chips=[];
  if(a.event==='gift'){
    if(a.giftName)chips.push(a.giftName);
    if(Number(a.count||1)>1)chips.push(`x${Number(a.count)}`);
    if(Number(a.totalDiamonds)>0)chips.push(`${Number(a.totalDiamonds).toLocaleString('es-DO')} diamantes`);
    if(Number(a.amount)>0)chips.push(`${Number(a.amount).toLocaleString('es-DO')} KICKs`);
    if(a.tier&&!String(a.giftName||'').includes(String(a.tier)))chips.push(String(a.tier));
    if(a.recipient)chips.push(`para ${a.recipient}`);
    if(a.kickGiftTier)chips.push(String(a.kickGiftTier));
  }
  if(a.event==='cheer'&&Number(a.bits)>0)chips.push(`${Number(a.bits).toLocaleString('es-DO')} Bits`);
  if(a.event==='raid'&&Number(a.viewers)>0)chips.push(`${Number(a.viewers).toLocaleString('es-DO')} viewers`);
  if(['sub','subrenew','giftsub'].includes(a.event)){
    if(a.tier)chips.push(String(a.tier));
    if(Number(a.months)>0)chips.push(`${Number(a.months)} meses`);
    if(Number(a.count)>1)chips.push(`${Number(a.count)} suscripciones`);
  }
  if(['milestone','record','mega','like'].includes(a.event)&&Number(a.value)>0)chips.push(Number(a.value).toLocaleString('es-DO'));
  return chips;
}
function metaText(a={}){return metaChips(a).join(' · ')}
function giftVisual(a={}){
  const image=a.giftAnimatedImage||a.animatedImage||a.giftImage||a.imageUrl||a.giftIcon||a.iconUrl||'';
  if(image)return {kind:'image',value:image};
  const platform=String(a.platform||'').toLowerCase();
  if(platform.includes('kick')){
    if(a.giftKind==='subscription')return {kind:'image',value:'/assets/kick-gifts/subscription-gift.svg'};
    if(a.giftKind==='kicks'){const n=Number(a.amount||0),known=new Set([1,10,50,100,500,1000,2000,5000,10000,50000]);return {kind:'image',value:known.has(n)?`/assets/kick-gifts/kicks-${n}.svg`:'/assets/kick-gifts/kicks-generic.svg'};}
  }
  const name=String(a.giftName||'').toLowerCase();
  if(/rosa|rose/.test(name))return {kind:'emoji',value:'🌹'};
  if(/qui[eé]reme|love you|heart|coraz/.test(name))return {kind:'emoji',value:'💖'};
  if(platform.includes('twitch')&&a.giftKind==='subscription')return {kind:'emoji',value:'👑'};
  if(platform.includes('kick')&&a.giftKind==='subscription')return {kind:'emoji',value:'👑'};
  if(platform.includes('kick')&&a.giftKind==='kicks')return {kind:'emoji',value:'💚'};
  if(a.event==='gift')return {kind:'image',value:smartSvg('giftsub')};
  if(['cheer','raid','share','follow','sub','subrenew','giftsub','like','milestone','record','mega'].includes(a.event))return {kind:'image',value:smartSvg(a.event)};
  return {kind:'image',value:smartSvg('mega')};
}
function createParticles(){
  const box=document.createElement('div');
  box.className='ga-particles';
  for(let i=0;i<7;i++){
    const s=document.createElement('span');
    s.style.setProperty('--i',String(i+1));
    s.style.left=`${10+i*12}%`;
    box.append(s);
  }
  return box;
}
function showClassic(a={}){
  root.innerHTML='';
  const {accent,accent2}=resolveAccents(a);
  const card=document.createElement('div');
  card.className=`ga-alert event-${a.event||'generic'} platform-${String(a.platform||'stream').toLowerCase()}`;
  card.style.setProperty('--accent',accent);
  card.style.setProperty('--accent2',accent2);
  const [platformAccent,platformAccent2]=defaultPalette(a);
  card.style.setProperty('--platformAccent',platformAccent);
  card.style.setProperty('--platformAccent2',platformAccent2);

  const cornerBadge=document.createElement('div');
  cornerBadge.className='ga-corner-platform';
  const cornerIconSrc=platformIconSrc(a.platform);
  if(cornerIconSrc){
    const cornerImg=document.createElement('img');
    cornerImg.src=cornerIconSrc;
    cornerImg.alt=platformShort(a.platform);
    cornerImg.onerror=()=>{cornerImg.remove();cornerBadge.classList.add('icon-fallback')};
    cornerBadge.append(cornerImg);
  }
  const cornerText=document.createElement('span');
  cornerText.textContent=platformShort(a.platform);
  cornerBadge.append(cornerText);

  const shine=document.createElement('div');
  shine.className='ga-shine';
  const particles=createParticles();

  const main=document.createElement('div');
  main.className='ga-main';

  const left=document.createElement('div');
  left.className='ga-left';

  const avatarWrap=document.createElement('div');
  avatarWrap.className='ga-avatar-wrap';
  const avatar=document.createElement('div');
  avatar.className='ga-avatar';
  if(a.avatar){
    const im=document.createElement('img');
    im.src=a.avatar;
    im.alt='';
    im.onerror=()=>{avatar.innerHTML=`<b>${initials(a.name)}</b>`};
    avatar.append(im);
  }else avatar.innerHTML=`<b>${initials(a.name)}</b>`;
  const platformChip=document.createElement('div');
  platformChip.className='ga-platform-chip';
  const platformIcon=platformIconSrc(a.platform);
  if(platformIcon){
    const pimg=document.createElement('img');
    pimg.src=platformIcon;
    pimg.alt=platformShort(a.platform);
    pimg.onerror=()=>pimg.remove();
    platformChip.append(pimg);
  }
  const platformLabel=document.createElement('span');
  platformLabel.textContent=platformShort(a.platform);
  platformChip.append(platformLabel);
  avatarWrap.append(avatar,platformChip);

  const copy=document.createElement('div');
  copy.className='ga-copy';
  const kicker=document.createElement('div');
  kicker.className='ga-kicker';
  kicker.textContent=eventName(a);
  const name=document.createElement('div');
  name.className='ga-name';
  name.textContent=a.name||'Usuario';
  const action=document.createElement('div');
  action.className='ga-action';
  action.textContent=a.action||'apoyó el stream';
  const meta=metaText(a);
  const metaEl=document.createElement('div');
  metaEl.className='ga-meta';
  metaEl.textContent=meta;
  if(!meta || String(a.action||'').includes(meta))metaEl.hidden=true;
  const thanks=document.createElement('div');
  thanks.className='ga-thanks';
  thanks.textContent=a.message||'¡Gracias por el apoyo!';
  copy.append(kicker,name,action,metaEl,thanks);
  left.append(avatarWrap,copy);

  const right=document.createElement('div');
  right.className='ga-right';
  const visual=giftVisual(a);
  const reward=document.createElement('div');
  reward.className='ga-reward';
  if(visual.kind==='image'){
    const im=document.createElement('img');
    im.src=visual.value;
    im.alt=a.giftName||a.eventLabel||'icono';
    im.onerror=()=>{reward.classList.add('ga-fallback'); reward.textContent=giftVisual({...a,giftImage:''}).value;};
    reward.append(im);
  }else{
    reward.classList.add('ga-fallback');
    reward.textContent=visual.value;
  }
  right.append(reward);

  if(a.giftName || a.event==='gift'){
    const label=document.createElement('div');
    label.className='ga-gift-name';
    label.textContent=a.giftName||'Regalo';
    right.append(label);
  }
  const chips=metaChips(a);
  if(chips.length){
    const list=document.createElement('div');
    list.className='ga-chip-list';
    chips.forEach(text=>{const span=document.createElement('span');span.className='ga-chip';span.textContent=text;list.append(span)});
    right.append(list);
  }

  main.append(left,right);
  card.append(cornerBadge,shine,particles,main);
  root.append(card);

  if(a.soundEnabled&&a.sound){const au=new Audio(a.sound);au.volume=.8;au.play().catch(()=>{})}
  const duration=Math.max(2,Math.min(15,Number(a.duration)||5))*1000;
  setTimeout(()=>{
    card.classList.add('leaving');
    setTimeout(()=>{card.remove();playing=false;next()},600);
  },duration);
 }
function optionAHeadline(a={}){
  if(a.event==='gift')return '¡NUEVO REGALO!';
  if(a.event==='sub')return '¡NUEVA SUSCRIPCIÓN!';
  if(a.event==='subrenew')return '¡RENOVÓ SUSCRIPCIÓN!';
  if(a.event==='giftsub')return '¡REGALÓ SUSCRIPCIONES!';
  if(a.event==='milestone')return '¡META ALCANZADA!';
  if(a.event==='record')return '¡NUEVO RÉCORD!';
  if(a.event==='mega')return '¡MEGA ALERTA!';
  if(a.event==='cheer')return Number(a.bits)>0?`¡${Number(a.bits).toLocaleString('es-DO')} BITS!`:'¡NUEVO CHEER!';
  if(a.event==='follow')return '¡NUEVO SEGUIDOR!';
  if(a.event==='share')return '¡COMPARTIÓ EL LIVE!';
  if(a.event==='raid')return '¡NUEVA RAID!';
  if(a.event==='like')return '¡META DE LIKES!';
  return String(a.eventLabel||'¡NUEVO EVENTO!');
}
function optionASentence(a={}){
  if(a.action)return a.action;
  return ({follow:'te siguió',sub:'se suscribió',gift:'envió un regalo',cheer:'envió Bits',share:'compartió el LIVE',raid:'hizo una raid',like:'apoyó el LIVE'})[a.event]||'apoyó el stream';
}
function optionACombo(a={}){
  if(a.event==='gift'&&Number(a.count||1)>1)return `×${Number(a.count)}`;
  if(a.event==='cheer'&&Number(a.bits)>0)return Number(a.bits)>=1000?`${Math.round(Number(a.bits)/100)/10}K`:String(Number(a.bits));
  if(a.event==='gift'&&Number(a.amount)>0)return String(Number(a.amount));
  if(a.event==='sub')return '+';
  if(a.event==='follow')return '+';
  return '✦';
}
function showOptionA(a={}){
  root.innerHTML='';
  const [p1,p2]=defaultPalette(a);
  const card=document.createElement('div');
  card.className=`oa-alert event-${a.event||'generic'} platform-${String(a.platform||'stream').toLowerCase()}`;
  card.style.setProperty('--oa1',p1);card.style.setProperty('--oa2',p2);
  if(/kick/i.test(a.platform||''))card.style.setProperty('--oa3','#d8ff4b');
  else card.style.setProperty('--oa3','#ffd45a');

  const scan=document.createElement('div');scan.className='oa-scan';
  const flash=document.createElement('div');flash.className='oa-flash';
  const left=document.createElement('div');left.className='oa-left';
  const badge=document.createElement('div');badge.className='oa-platform';
  const psrc=platformIconSrc(a.platform);if(psrc){const im=document.createElement('img');im.src=psrc;im.alt='';im.onerror=()=>im.remove();badge.append(im)}
  const ptxt=document.createElement('span');ptxt.textContent=platformShort(a.platform)+(String(a.platform||'').toLowerCase().includes('tiktok')?' LIVE':'');badge.append(ptxt);
  const title=document.createElement('div');title.className='oa-headline';title.textContent=optionAHeadline(a);
  const line=document.createElement('div');line.className='oa-subline';
  const who=document.createElement('span');who.className='oa-name';who.textContent=a.name||'Usuario';
  const what=document.createElement('span');what.className='oa-action';what.textContent=' '+optionASentence(a);
  line.append(who,what);
  const meta=document.createElement('div');meta.className='oa-meta';
  const avatar=document.createElement('div');avatar.className='oa-avatar';
  if(a.avatar){const av=document.createElement('img');av.src=a.avatar;av.alt='';av.onerror=()=>{avatar.innerHTML=`<b>${initials(a.name)}</b>`};avatar.append(av)}else avatar.innerHTML=`<b>${initials(a.name)}</b>`;
  meta.append(avatar);
  const chips=metaChips(a);(chips.length?chips:[a.message||'¡Gracias por el apoyo!']).slice(0,3).forEach(t=>{const c=document.createElement('span');c.className='oa-chip';c.textContent=t;meta.append(c)});
  left.append(badge,title,line,meta);

  const visual=document.createElement('div');visual.className='oa-visual';
  const ring=document.createElement('div');ring.className='oa-ring';
  const ring2=document.createElement('div');ring2.className='oa-ring oa-ring2';
  const orb=document.createElement('div');orb.className='oa-orb';
  const v=giftVisual(a);
  if(v.kind==='image'){const im=document.createElement('img');im.src=v.value;im.alt=a.giftName||a.eventLabel||'regalo';im.onerror=()=>{orb.classList.add('oa-fallback');orb.textContent=giftVisual({...a,giftImage:'',giftAnimatedImage:'',animatedImage:'',imageUrl:'',giftIcon:'',iconUrl:''}).value};orb.append(im)}else{orb.classList.add('oa-fallback');orb.textContent=v.value}
  const combo=document.createElement('div');combo.className='oa-combo';combo.textContent=optionACombo(a);
  const burst=document.createElement('div');burst.className='oa-burst';for(let i=0;i<18;i++){const sp=document.createElement('span');sp.className='oa-particle';const ang=(Math.PI*2*i/18)+(i%3)*.13,dist=70+(i%5)*15;sp.style.setProperty('--x',`${Math.cos(ang)*dist}px`);sp.style.setProperty('--y',`${Math.sin(ang)*dist}px`);sp.style.left=`${45+(i%4)*3}%`;sp.style.top=`${45+(i%3)*4}%`;sp.style.animationDelay=`${(i%7)*.11}s`;burst.append(sp)}
  visual.append(ring,ring2,orb,combo,burst);
  card.append(scan,flash,left,visual);root.append(card);

  if(a.soundEnabled&&a.sound){const au=new Audio(a.sound);au.volume=.8;au.play().catch(()=>{})}
  const duration=Math.max(2,Math.min(15,Number(a.duration)||5))*1000;
  setTimeout(()=>{card.classList.add('leaving');setTimeout(()=>{card.remove();playing=false;next()},600)},duration);
}
function show(a={}){
  const style=['classic','option-a'].includes(a.alertStyle)?a.alertStyle:activeAlertStyle;
  if(style==='option-a')return showOptionA(a);
  return showClassic(a);
}
fetch('/api/alert-style',{cache:'no-store'}).then(r=>r.json()).then(d=>{if(['classic','option-a'].includes(d.style))activeAlertStyle=d.style}).catch(()=>{});
connect();
