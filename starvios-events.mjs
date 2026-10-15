// Eventos Starvios normalizados para GREÑA. Solo acepta eventos de tipo explícito;
// nunca deduce donaciones, follows o raids de mensajes normales del chat.
const aliases=new Map([
 ['follow','follow'],['follower','follow'],['new_follower','follow'],['user.followed','follow'],
 ['subscription','sub'],['subscribe','sub'],['sub','sub'],['subscribed','sub'],['subscription.renewed','subrenew'],['subrenew','subrenew'],
 ['gifted_subscription','giftsub'],['subscription_gift','giftsub'],['gift_subscriptions','giftsub'],['giftsub','giftsub'],
 ['raid','raid'],['raid_received','raid'],
 ['gift','gift'],['starvies','gift'],['starvie','gift'],['donation','gift'],['tip','gift'],['starvies_donated','gift'],
 ['shower','shower'],['star_shower','shower'],['starshower','shower'],['lluvia_de_estrellas','shower']
]);
export const starviosEventTypes=['follow','sub','subrenew','giftsub','raid','gift','shower'];
export function finiteStarviosInt(raw,maximum=1000000000){
 const value=Number(raw);
 return Number.isFinite(value)&&value>=0&&value<=maximum?Math.trunc(value):null;
}
export function normalizeStarviosEvent(input){
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const obj=input.data&&typeof input.data==='object'&&!Array.isArray(input.data)?{...input,...input.data}:input;
 const original=String(obj.event||obj.event_type||obj.eventType||obj.action||obj.type||'').toLowerCase().trim().replace(/[\s-]+/g,'_');
 const kind=aliases.get(original);
 if(!kind)return null;
 const rawUser=obj.username||obj.user?.username||obj.user?.name||obj.user||obj.sender?.username||obj.sender||obj.from||'';
 const user=String(typeof rawUser==='object'?'':rawUser).trim().slice(0,80)||'Usuario';
 const amount=finiteStarviosInt(obj.amount??obj.starvies??obj.value??obj.quantity??obj.count??(kind==='follow'?1:null));
 const count=finiteStarviosInt(obj.count??obj.quantity??1,100000);
 if(kind==='gift'&&(!amount||amount<1))return null;
 if(kind==='giftsub'&&(!count||count<1))return null;
 const viewers=finiteStarviosInt(obj.viewers??obj.viewer_count??obj.viewerCount,10000000);
 const id=String(obj.id||obj.event_id||obj.eventId||obj.message_id||'').slice(0,128);
 const level=finiteStarviosInt(obj.level??obj.tier??0,10000)||0;
 return {platform:'starvios',kind,user,amount:amount||0,count:count||1,viewers,id,level,
   message:String(obj.message||obj.text||'').slice(0,250)};
}
export function parseStarviosViewerLabel(raw){
 const t=String(raw||'').trim().replace(/\s+/g,' ');
 const m=t.match(/(?:^|\b)(?:viewers?|espectadores?|viendo ahora|watching)\s*:?\s*([\d.,]+)/i)
     ||t.match(/([\d.,]+)\s*(?:viewers?|espectadores?|watching)\b/i);
 if(!m)return null;
 const n=Number(m[1].replace(/[.,]/g,''));
 return Number.isSafeInteger(n)&&n>=0&&n<=10000000?n:null;
}
export const STARVIOS_SUPPORT_CATALOG=[
 {id:'starvies',kind:'gift',label:'Donación de Starvies',image:'/assets/starvios-events/starvies.svg',unit:'Starvies'},
 {id:'sub',kind:'sub',label:'Suscripción',image:'/assets/starvios-events/sub.svg',unit:'evento'},
 {id:'giftsub',kind:'giftsub',label:'Suscripción regalada',image:'/assets/starvios-events/giftsub.svg',unit:'evento'},
 {id:'follow',kind:'follow',label:'Nuevo seguidor',image:'/assets/starvios-events/follow.svg',unit:'evento'},
 {id:'raid',kind:'raid',label:'Raid',image:'/assets/starvios-events/raid.svg',unit:'evento'},
 {id:'shower',kind:'shower',label:'Lluvia de Estrellas',image:'/assets/starvios-events/shower.svg',unit:'evento'}
];
