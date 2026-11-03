/**
 * Contract for all five GREÑA Live platforms.
 * Saving a public URL does not mean the platform is live or authenticated.
 * Only a verified adapter may report connected = true.
 */
export const PLATFORM_IDS = Object.freeze(['tiktok','twitch','kick','youtube','starvios']);
export const PLATFORM_INFO = Object.freeze({
  tiktok: {name:'TikTok', auth:'public-live-connector', events:['chat','follow','gift','share','likes','viewers']},
  twitch: {name:'Twitch', auth:'oauth-eventsub', events:['chat','follow','sub','gift','bits','raid','viewers']},
  kick: {name:'Kick', auth:'oauth-webhooks', events:['chat','follow','sub','gift','raid','viewers']},
  youtube: {name:'YouTube', auth:'oauth-livechat', events:['chat','sub','gift','viewers']},
  starvios: {name:'Starvios', auth:'live-channel', events:['chat','follow','sub','gift','raid','viewers']}
});
const HOSTS={
  tiktok:['tiktok.com'],twitch:['twitch.tv'],kick:['kick.com'],
  youtube:['youtube.com','youtu.be'],starvios:['starvios.com']
};
const clean=v=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
const suffixMatch=(host,allowed)=>allowed.some(x=>host===x||host.endsWith('.'+x));
export function platformId(id){
  const p=clean(id).toLowerCase();
  if(!PLATFORM_IDS.includes(p))throw new Error('Plataforma desconocida.');
  return p;
}
export function channelReference(platform,input){
  const id=platformId(platform);
  const raw=clean(input);
  if(!raw||raw.length>350)throw new Error('Canal vacío o demasiado largo.');
  if(!raw.includes('://')&&!raw.includes('/')){
    const user=raw.replace(/^@/,'');
    if(!/^[A-Za-z0-9._-]{2,64}$/.test(user))throw new Error('Usuario de canal inválido.');
    return {
      platform:id,kind:'username',username:user,
      url:({tiktok:'https://www.tiktok.com/@'+user+'/live',
            twitch:'https://www.twitch.tv/'+user,kick:'https://kick.com/'+user,
            youtube:'https://www.youtube.com/@'+user+'/live',
            starvios:'https://starvios.com/'+user})[id]
    };
  }
  let url;
  try{url=new URL(raw)}catch{throw new Error('El enlace del canal no es válido.')}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||url.username||url.password||url.port||
    !suffixMatch(host,HOSTS[id]))throw new Error('Enlace HTTPS de plataforma incorrecta.');
  if(url.pathname==='/'&&!url.search)throw new Error('Falta identificar el canal.');
  const parts=url.pathname.split('/').filter(Boolean);
  let username='';
  switch(id){
    case 'tiktok':
      if(!/^@[A-Za-z0-9._]{2,30}$/.test(parts[0]||''))throw new Error('Enlace TikTok inválido.');
      username=parts[0].slice(1);break;
    case 'twitch':
    case 'kick':
    case 'starvios':
      if(!/^[A-Za-z0-9._-]{2,64}$/.test(parts[0]||''))throw new Error('Canal inválido.');
      username=parts[0];break;
    case 'youtube':
      if(host==='youtu.be'){
        if(!/^[A-Za-z0-9_-]{6,32}$/.test(parts[0]||''))throw new Error('Video YouTube inválido.');
        break;
      }
      if(parts[0]==='watch'){
        if(!/^[A-Za-z0-9_-]{6,32}$/.test(url.searchParams.get('v')||''))throw new Error('Falta el video de YouTube.');
      }else if(!/^@[A-Za-z0-9._-]{2,64}$/.test(parts[0]||'')&&
         !(parts[0]==='channel'&&/^[A-Za-z0-9_-]{6,64}$/.test(parts[1]||''))&&
         !(parts[0]==='live'&&/^[A-Za-z0-9_-]{6,32}$/.test(parts[1]||''))) {
        throw new Error('Canal o video YouTube inválido.');
      }else if(parts[0].startsWith('@'))username=parts[0].slice(1);
      break;
  }
  // Never persist tracking queries or auth-related URL parameters.
  if(id!=='youtube'||parts[0]!=='watch')url.search='';
  else {const v=url.searchParams.get('v');url.search='?v='+encodeURIComponent(v);}
  url.hash='';
  return {platform:id,kind:username?'username':'video',username,url:url.toString()};
}
export function safeEvent(platform,input) {
  const id=platformId(platform);
  const obj=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const raw=clean(obj.kind||obj.type||obj.event).toLowerCase();
  const mapping={
    comment:'chat',message:'chat',chat:'chat',
    follower:'follow',follow:'follow',
    gift:'gift',giftsub:'gift',bits:'gift',cheer:'gift',
    superchat:'gift',supersticker:'gift',donation:'gift',starvies:'gift',
    subscription:'sub',subscribe:'sub',sub:'sub',member:'sub',
    raid:'raid',host:'raid',share:'share',shared:'share',
    like:'likes',likes:'likes',tap:'likes',
    viewer:'viewers',viewers:'viewers',
    online:'status',offline:'status',status:'status'
  };
  const kind=mapping[raw];
  if(!kind)throw new Error('Evento de plataforma desconocido.');
  const user=clean(obj.user||obj.author||obj.name||'Usuario').slice(0,64);
  const message=clean(obj.message||obj.content||obj.text||'').slice(0,300);
  const giftName=clean(obj.giftName||obj.gift||'').slice(0,72);
  const number=Number(obj.amount??obj.count??1);
  const amount=Number.isFinite(number)?Math.max(1,Math.min(99999,Math.floor(number))):1;
  return {
    kind:kind==='chat'?'chat':kind==='status'?'status':kind==='viewers'?'viewers':'alert',
    action:kind,platform:id,user,message,giftName,amount,
    connected:kind==='status'?(obj.connected===true):undefined,
    viewers:kind==='viewers'?Math.max(0,Math.min(10_000_000,Math.floor(Number(obj.viewers)||0))):undefined
  };
}
export function connectionState({linked=false,adapterReady=false,authenticated=false,handshake=false,live=false,error=''}={}){
  if(!linked)return 'not_linked';
  if(error)return 'error';
  if(!adapterReady)return 'unavailable';
  if(!authenticated)return 'authorization_required';
  if(!handshake)return 'connecting';
  return live?'live':'connected_offline';
}
