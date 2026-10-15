import test from 'node:test';
test('Starvios public viewer endpoint probe',async()=>{
 const base='https://naiijcvngtkkocligwvk.supabase.co/rest/v1';
 const key='sb_publishable_4lF1QyQhWOUE1Pw3rWBwEw_bVmkAxm6';
 const headers={'apikey':key,'Content-Type':'application/json'};
 async function call(path,opts={}){
  const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(10000),...opts});
  const raw=await r.text();
  let data;try{data=JSON.parse(raw)}catch{data=raw.slice(0,250)}
  console.log('[SV RPC]',path.split('?')[0],r.status,JSON.stringify(data)?.slice(0,1500));
  return {ok:r.ok,data};
 }
 const feed=await fetch('https://starvios.com/api/public/live-now',{signal:AbortSignal.timeout(10000)});
 const body=await feed.text();let parsed;try{parsed=JSON.parse(body)}catch{}
 console.log('[SV RPC] public-feed status',feed.status,'length',body.length,'keys',Object.keys(parsed||{}),'rowCount',parsed?.rows?.length,'firstRow',JSON.stringify(parsed?.rows?.[0]||{}).slice(0,550));
 const p=await call('/profiles?select=id,username&username=eq.mostza12&limit=1');
 if(p.data?.[0]?.id){
  const id=p.data[0].id;
  const s=await call('/live_streams?select=id,channel_id,status&channel_id=eq.'+id+'&status=eq.live&limit=1');
  if(s.data?.[0]?.id)await call('/rpc/live_viewer_counts',{method:'POST',body:JSON.stringify({_stream_ids:[s.data[0].id]})});
 }
});
