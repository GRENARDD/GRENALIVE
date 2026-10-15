// GREÑA LIVE · Read-only public Starvios event source.
// Starvios exposes public live chat records and follower totals to anonymous viewers.
// The publishable (not secret) key is distributed in Starvios' public web client.
export const STARVIOS_PUBLIC_DB_URL='https://naiijcvngtkkocligwvk.supabase.co/rest/v1';
export const STARVIOS_PUBLIC_KEY='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
const safeInt=(raw,max=100000000)=>{const v=Number(raw);return Number.isSafeInteger(v)&&v>=0&&v<=max?v:null};
const person=(raw)=>String(raw||'').trim().slice(0,80);
export function parseStarviosChatEvent(row){
 if(!row||typeof row!=='object'||!row.id)return null;
 const kind=String(row.kind||'').toLowerCase().trim();
 const meta=row.meta&&typeof row.meta==='object'&&!Array.isArray(row.meta)?row.meta:{};
 const coins=safeInt(row.coins)||0;
 const user=person(row.profiles?.username||row.profiles?.display_name||meta.username||meta.user_name||meta.sender_name)||'Usuario Starvios';
 const base={platform:'starvios',user,id:String(row.id).slice(0,128),count:1,amount:0};
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
export function buildStarviosChatEventUrl(streamId,sinceIso,limit=100){
 if(!/^[0-9a-f-]{20,80}$/i.test(String(streamId||'')))throw Error('Starvios stream id invalid');
 const u=new URL(STARVIOS_PUBLIC_DB_URL+'/live_chat_messages');
 u.searchParams.set('select','id,kind,coins,meta,created_at,profiles:profiles!live_chat_messages_user_id_fkey(username,display_name)');
 u.searchParams.set('stream_id','eq.'+streamId);
 u.searchParams.set('created_at','gte.'+sinceIso);
 u.searchParams.set('order','created_at.asc');
 u.searchParams.set('limit',String(Math.min(250,Math.max(1,Number(limit)||100))));
 return u.href;
}
export function buildStarviosFollowerCountRequest(channelId){
 if(!/^[0-9a-f-]{20,80}$/i.test(String(channelId||'')))throw Error('Starvios channel id invalid');
 return JSON.stringify({_channels:[channelId]});
}
