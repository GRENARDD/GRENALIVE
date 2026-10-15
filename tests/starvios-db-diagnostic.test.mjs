import test from 'node:test';
test('check Starvios public chat metadata visibility, no user content logged',async()=>{
 const base='https://naiijcvngtkkocligwvk.supabase.co/rest/v1';
 const key='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
 const headers={apikey:key};
 const feed=await(await fetch('https://starvios.com/api/public/live-now',{signal:AbortSignal.timeout(9000)})).json();
 const stream=feed.rows?.find(x=>x.status==='live'&&x.id);
 if(!stream){console.log('[SV DB] no live stream');return}
 const id=stream.id;
 for(const select of ['id,kind,coins,meta,created_at,user_id,profiles:profiles!live_chat_messages_user_id_fkey(username,display_name)','id,kind,created_at']){
  const url=base+'/live_chat_messages?select='+encodeURIComponent(select)+'&stream_id=eq.'+id+'&order=created_at.desc&limit=50';
  try{
   const r=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});
   const d=await r.json();
   console.log('[SV DB]',r.status,'size',Array.isArray(d)?d.length:JSON.stringify(d).slice(0,200));
   if(Array.isArray(d)){
    const kinds=[...new Set(d.map(x=>x.kind))];
    const metakeys=[...new Set(d.flatMap(x=>x.meta&&typeof x.meta==='object'?Object.keys(x.meta):[]))];
    console.log('[SV DB] kinds',JSON.stringify(kinds),'metaKeys',JSON.stringify(metakeys),'hasAuthor',d.some(x=>x.profiles?.username));
   }
  }catch(e){console.log('[SV DB] err',String(e))}
 }
});
