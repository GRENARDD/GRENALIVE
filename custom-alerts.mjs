// GREÑA LIVE - reglas de alertas personalizadas independientes por perfil.
// Mantener puro este módulo facilita probar condiciones sin iniciar OBS ni las redes.
import { randomUUID } from 'node:crypto';

export const CUSTOM_PLATFORMS=Object.freeze(['tiktok','twitch','kick','starvios','youtube']);
export const CUSTOM_EVENTS=Object.freeze(['follow','gift','sub','subrenew','giftsub','shower','cheer','share','like','raid']);
const STYLES=['neon','glass','impact','minimal'];
const ANIMATIONS=['pop','slide','zoom','bounce','float'];
const ORIENTATIONS=['both','vertical','horizontal'];
const hex=(value,fallback)=>/^#[0-9a-fA-F]{6}$/.test(String(value))?String(value):fallback;
const txt=(value,length=140)=>String(value??'').trim().slice(0,length);
const number=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback};
const media=(value)=>{
  const s=txt(value,600);
  if(/^https:\/\/[^\s<>"]+$/i.test(s))return s;
  if(/^\/api\/custom-alerts\/media\/[A-Za-z0-9_-]{10,80}\.(png|jpg|gif|webp|mp3|wav|ogg|mp4|webm)$/i.test(s))return s;
  return '';
};
export function normalizeCustomRule(raw={}){
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const a=r.action&&typeof r.action==='object'?r.action:{};
  const c=r.conditions&&typeof r.conditions==='object'?r.conditions:{};
  const platforms=[...new Set((Array.isArray(r.platforms)?r.platforms:[]).map(x=>txt(x,30).toLowerCase()))].filter(x=>CUSTOM_PLATFORMS.includes(x));
  const events=[...new Set((Array.isArray(r.events)?r.events:[]).map(x=>txt(x,30).toLowerCase()))].filter(x=>CUSTOM_EVENTS.includes(x));
  if(!platforms.length||!events.length)throw new Error('Selecciona al menos una plataforma y un evento.');
  return {
    id:/^[A-Za-z0-9_-]{8,80}$/.test(String(r.id||''))?r.id:randomUUID(),
    name:txt(r.name,75)||'Nueva alerta',
    enabled:r.enabled!==false,
    platforms,events,
    conditions:{
      username:txt(c.username,64).replace(/^@/,''),
      giftName:txt(c.giftName,100),
      minCount:number(c.minCount,0,1000000,0),
      minValue:number(c.minValue,0,100000000,0),
    },
    action:{
      title:txt(a.title,120)||'¡NUEVO APOYO!',
      message:txt(a.message,280)||'¡Gracias {user}!',
      image:media(a.image),
      audio:media(a.audio),
      video:media(a.video),
      color:hex(a.color,'#a855f7'),
      textColor:hex(a.textColor,'#ffffff'),
      style:STYLES.includes(a.style)?a.style:'neon',
      animation:ANIMATIONS.includes(a.animation)?a.animation:'pop',
      duration:number(a.duration,2,30,7),
      volume:number(a.volume,0,100,70),
      showAvatar:a.showAvatar!==false,
      showGift:a.showGift!==false,
      playAudio:a.playAudio!==false,
      tts:a.tts===true,
      orientation:ORIENTATIONS.includes(a.orientation)?a.orientation:'both',
      priority:number(a.priority,0,100,50),
      cooldownGlobal:number(a.cooldownGlobal,0,3600,0),
      cooldownUser:number(a.cooldownUser,0,3600,0),
    }
  };
}
export function normalizeCustomRules(input){
  if(!Array.isArray(input))throw new Error('La lista de alertas no es válida.');
  if(input.length>80)throw new Error('Máximo 80 alertas personalizadas.');
  const list=input.map(normalizeCustomRule);
  const ids=new Set();
  for(const r of list){if(ids.has(r.id))throw new Error('Hay identificadores duplicados.');ids.add(r.id)}
  return list;
}
export function customEventValue(a={}){
  for(const key of ['totalDiamonds','bits','amount','value','starvies','diamonds']){
    const n=Number(a[key]);
    if(Number.isFinite(n)&&n>0)return n;
  }
  return 0;
}
export function ruleMatches(rule,a={}){
  if(!rule?.enabled)return false;
  const platform=String(a.platform||'').trim().toLowerCase().replace(/[\s-]/g,'');
  if(!rule.platforms.includes(platform))return false;
  const base=String(a.event||'').toLowerCase();
  const kind=String(a.eventKind||'').toLowerCase();
  const variants=new Set([base,kind]);
  if(kind==='giftsub'||kind==='shower')variants.add('gift');
  if(kind==='subrenew')variants.add('sub');
  if(base==='likes')variants.add('like');
  if(!rule.events.some(e=>variants.has(e)))return false;
  const c=rule.conditions||{};
  if(c.username&&String(a.name||'').toLowerCase()!==c.username.toLowerCase())return false;
  if(c.giftName&&!String(a.giftName||'').toLowerCase().includes(c.giftName.toLowerCase()))return false;
  if(c.minCount&&Number(a.count||0)<c.minCount)return false;
  if(c.minValue&&customEventValue(a)<c.minValue)return false;
  return true;
}
export function findCustomRule(rules,a,now=Date.now(),cooldowns=new Map()){
  const matching=(Array.isArray(rules)?rules:[]).filter(rule=>ruleMatches(rule,a))
    .sort((x,y)=>(y.action?.priority||0)-(x.action?.priority||0));
  for(const rule of matching){
    const globalKey=rule.id+':global',userKey=rule.id+':user:'+String(a.platform||'').toLowerCase()+':'+String(a.name||'').toLowerCase();
    const gc=(Number(rule.action?.cooldownGlobal)||0)*1000,uc=(Number(rule.action?.cooldownUser)||0)*1000;
    if(gc&&now-(cooldowns.get(globalKey)||0)<gc)continue;
    if(uc&&now-(cooldowns.get(userKey)||0)<uc)continue;
    if(gc)cooldowns.set(globalKey,now);
    if(uc)cooldowns.set(userKey,now);
    if(cooldowns.size>3000)for(const [k,v] of cooldowns)if(now-v>3600*1000)cooldowns.delete(k);
    return rule;
  }
  return null;
}
