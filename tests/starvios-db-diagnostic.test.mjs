import test from 'node:test';
test('Starvios public follows reader permissions diagnostic',async()=>{
 const base='https://naiijcvngtkkocligwvk.supabase.co/rest/v1';
 const key='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
 const feed=await(await fetch('https://starvios.com/api/public/live-now',{signal:AbortSignal.timeout(9000)})).json();
 const stream=feed.rows?.find(x=>x.status==='live'&&x.channel_id);
 if(!stream){console.log('[SV FOLLOW RLS] no live stream');return}
 const tests=[
  ['follows','channel_id,follower_id,created_at','channel_id=eq.'+stream.channel_id],
  ['follows','created_at,follower:profiles!follows_follower_id_fkey(username,display_name)','channel_id=eq.'+stream.channel_id],
  ['live_chat_messages','id,kind,coins,meta,profiles:profiles!live_chat_messages_user_id_fkey(username)','stream_id=eq.'+stream.id]
 ];
 for(const [table,select,filter] of tests){
  try{
   const url=base+'/'+table+'?select='+encodeURIComponent(select)+'&'+filter+'&order=created_at.desc&limit=20';
   const r=await fetch(url,{headers:{apikey:key},signal:AbortSignal.timeout(9000)});
   const json=await r.json();
   console.log('[SV FOLLOW RLS]',table,'HTTP',r.status,Array.isArray(json)?'count '+json.length+' keys '+JSON.stringify(Object.keys(json[0]||{})):JSON.stringify(json).slice(0,200));
   if(Array.isArray(json)&&table==='live_chat_messages')console.log('[SV FOLLOW RLS] message kinds',JSON.stringify([...new Set(json.map(x=>({kind:x.kind,coins:x.coins>0,metaKeys:Object.keys(x.meta||{})})))]).slice(0,700));
  }catch(e){console.log('[SV FOLLOW RLS] err',table,String(e))}
 }
});
