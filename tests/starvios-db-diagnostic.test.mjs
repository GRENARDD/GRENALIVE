import test from 'node:test';
test('inspect public event kinds from currently live streams without exposing messages',async()=>{
 const base='https://naiijcvngtkkocligwvk.supabase.co/rest/v1';
 const key='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
 const feed=await(await fetch('https://starvios.com/api/public/live-now',{signal:AbortSignal.timeout(9000)})).json();
 const rows=feed.rows?.filter(x=>x.status==='live').slice(0,18)||[];
 let aggregate={},samples=[];
 for(const stream of rows){
  try{
   const url=base+'/live_chat_messages?select='+encodeURIComponent('id,kind,coins,meta,created_at,profiles:profiles!live_chat_messages_user_id_fkey(username)')+'&stream_id=eq.'+stream.id+'&order=created_at.desc&limit=100';
   const r=await fetch(url,{headers:{apikey:key},signal:AbortSignal.timeout(6500)}),data=await r.json();
   if(!Array.isArray(data))continue;
   for(const x of data){
    aggregate[x.kind??'null']=(aggregate[x.kind??'null']||0)+1;
    if(x.kind!=='chat'&&samples.length<25)
     samples.push({kind:x.kind,coins:x.coins,keys:x.meta&&typeof x.meta==='object'?Object.keys(x.meta):[],hasUser:!!x.profiles?.username});
   }
  }catch(e){}
 }
 console.log('[SV PUBLIC KINDS]',JSON.stringify(aggregate),'examplesWithoutUserContent',JSON.stringify(samples));
});
