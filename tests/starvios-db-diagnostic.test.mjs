import test from 'node:test';
test('verify public Starvios follower counts RPC (counts only)',async()=>{
 const key='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
 const data=await(await fetch('https://starvios.com/api/public/live-now',{signal:AbortSignal.timeout(9000)})).json();
 const channels=[...new Set((data.rows||[]).filter(x=>x.status==='live').map(x=>x.channel_id).filter(Boolean))].slice(0,3);
 const r=await fetch('https://naiijcvngtkkocligwvk.supabase.co/rest/v1/rpc/discovery_follower_counts',{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({_channels:channels}),signal:AbortSignal.timeout(9000)
 });
 const json=await r.json();
 console.log('[SV FOLLOW RPC]',r.status,JSON.stringify(json).slice(0,1800));
});
