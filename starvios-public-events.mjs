// GREÑA LIVE · Read-only public Starvios event source.
// Starvios exposes public live chat records and follower totals to anonymous viewers.
// The publishable (not secret) key is distributed in Starvios' public web client.
export const STARVIOS_PUBLIC_DB_URL='https://naiijcvngtkkocligwvk.supabase.co/rest/v1';
export const STARVIOS_PUBLIC_KEY='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
const safeInt=(raw,max=100000000)=>{const v=Number(raw);return Number.isSafeInteger(v)&&v>=0&&v<=max?v:null};
// Solo atribuimos eventos a un nombre que la plataforma haya publicado.
const person=(raw)=>typeof raw==='string'?raw.trim().slice(0,80):'';
export function starviosPublicActor(row){
 if(!row||typeof row!=='object')return '';
 const meta=row.meta&&typeof row.meta==='object'&&!Array.isArray(row.meta)?row.meta:{};
 const profile=Array.isArray(row.profiles)?row.profiles[0]:row.profiles;
 const candidates=[
  profile?.username,profile?.display_name,row.username,row.sender_name,
  meta.username,meta.user_name,meta.sender_name,meta.from_user_name,
  meta.user?.username,meta.user?.display_name,meta.sender?.username,
  meta.sender?.name,meta.actor?.username,meta.actor?.name,
  meta.from?.username,meta.gifter?.username
 ];
 return candidates.map(person).find(name=>name&&!/^(?:usuario(?: starvios)?|nuevo seguidor|unknown|anonymous|undefined|null)$/i.test(name))||'';
}
export function parseStarviosChatEvent(row){
 if(!row||typeof row!=='object'||!row.id)return null;
 const kind=String(row.kind||'').toLowerCase().trim();
 const meta=row.meta&&typeof row.meta==='object'&&!Array.isArray(row.meta)?row.meta:{};
 const coins=safeInt(row.coins)||0;
 const publicName=starviosPublicActor(row);
 const user=publicName||'Usuario Starvios';
 const base={platform:'starvios',user,anonymous:!publicName,id:String(row.id).slice(0,128),count:1,amount:0};
 const metaCount=safeInt(meta.count??meta.qty??meta.quantity??meta.gift_count??meta.subscriptions,10000);
 if(['chat','message'].includes(kind)){
  // A Starvies tip is a normal chat row with a non-zero coins column.
  return coins>0?{...base,kind:'gift',amount:coins}:null;
 }
 if(kind==='sub')return {...base,kind:meta.is_renewal===true||meta.renewal===true||meta.renewed===true?'subrenew':'sub'};
 if(kind==='gift')return {...base,kind:'giftsub',count:Math.max(1,metaCount||1)};
 if(kind==='starfall')return {...base,kind:'shower',level:safeInt(meta.level??meta.tier,10000)||0};
 if(kind==='raid')return {...base,kind:'raid',viewers:safeInt(meta.viewers??meta.viewer_count,10000000)||0};
 if(kind==='follow')return {...base,kind:'follow'};
 return null; // reward, regular messages, moderation and unknown system rows
}
export function parseStarviosFollowerCount(data,channelId){
 if(!Array.isArray(data)||!channelId)return null;
 const entry=data.find(x=>x&&String(x.channel_id||'')===String(channelId));
 if(!entry)return 0; // the public aggregate omits channels that have no followers
 return safeInt(entry.followers,10000000);
}
export function buildStarviosChatEventUrl(streamId,sinceIso,limit=100,includeProfiles=true,includeUserId=true){
 if(!/^[0-9a-f-]{20,80}$/i.test(String(streamId||'')))throw Error('Starvios stream id invalid');
 const u=new URL(STARVIOS_PUBLIC_DB_URL+'/live_chat_messages');
 // El join público puede cambiar en Starvios. En ese caso leemos los
 // eventos públicos sin join, conservando nombres explícitos de meta.
 const columns='id,kind,coins,meta,created_at'+(includeUserId?',user_id':'');
 u.searchParams.set('select',includeProfiles
  ?columns+',profiles:profiles!live_chat_messages_user_id_fkey(username,display_name)'
  :columns);
 u.searchParams.set('stream_id','eq.'+streamId);
 u.searchParams.set('created_at','gte.'+sinceIso);
 u.searchParams.set('order','created_at.asc');
 u.searchParams.set('limit',String(Math.min(250,Math.max(1,Number(limit)||100))));
 return u.href;
}
// Resolve ONLY public usernames for user IDs already present in this LIVE's event rows.
// No cookies, login credentials or user-provided overlay tokens are needed.
export function buildStarviosProfileLookupUrl(userIds){
 const ids=[...new Set((Array.isArray(userIds)?userIds:[]).map(x=>String(x||'').trim())
  .filter(x=>/^[0-9a-f-]{20,80}$/i.test(x)))].slice(0,100);
 if(!ids.length)throw Error('Sin usuarios Starvios verificables');
 const u=new URL(STARVIOS_PUBLIC_DB_URL+'/profiles');
 u.searchParams.set('select','id,username');
 u.searchParams.set('id','in.('+ids.join(',')+')');
 u.searchParams.set('limit',String(ids.length));
 return u.href;
}
export function buildStarviosFollowerCountRequest(channelId){
 if(!/^[0-9a-f-]{20,80}$/i.test(String(channelId||'')))throw Error('Starvios channel id invalid');
 return JSON.stringify({_channels:[channelId]});
}
