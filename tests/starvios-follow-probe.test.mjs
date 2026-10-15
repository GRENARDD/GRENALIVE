import test from 'node:test';
test('Starvios anonymous public follower identity visibility',async()=>{
 const key='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
 const root='https://naiijcvngtkkocligwvk.supabase.co/rest/v1/';
 const r=await fetch('https://starvios.com/api/public/live-now',{signal:AbortSignal.timeout(11000)});
 const feed=await r.json(),ids=[...new Set((feed.rows||[]).filter(x=>x.channel_id).map(x=>x.channel_id))].slice(0,40);
 const c=await fetch(root+'rpc/discovery_follower_counts',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({_channels:ids}),signal:AbortSignal.timeout(10000)});
 const counts=await c.json();
 const checked=Array.isArray(counts)?counts.filter(x=>Number(x.followers)>0).slice(0,5):[];
 console.log('[SV PUBLIC FOLLOWS] RPC HTTP',c.status,'positive-count-channels',checked.length);
 for(const ch of checked){
   const url=root+'follows?select=channel_id,follower_id,created_at&channel_id=eq.'+encodeURIComponent(ch.channel_id)+'&order=created_at.desc&limit=4';
   const ans=await fetch(url,{headers:{apikey:key},signal:AbortSignal.timeout(10000)}),val=await ans.json();
   console.log('[SV PUBLIC FOLLOWS] channel followerCount='+ch.followers,'HTTP '+ans.status,'publicRows '+(Array.isArray(val)?val.length:-1),'responseType '+(Array.isArray(val)?'rows':'error'));
 }
});