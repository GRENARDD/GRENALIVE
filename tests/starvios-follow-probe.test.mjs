import test from 'node:test';
test('read-only audit of Starvios public follow identity availability',async()=>{
 const host='https://starvios.com';
 const page=await fetch(host+'/live/mostza12',{signal:AbortSignal.timeout(10000)});
 const html=await page.text();
 const resources=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(x=>x[1]);
 const wanted=[...new Set(resources.filter(x=>/LiveChat|live\._username|popout|LiveCard/.test(x)))];
 console.log('[SV FOLLOW DIAG] assets',wanted.length);
 for(const path of wanted.slice(0,6)){
  try{
   const r=await fetch(host+path,{signal:AbortSignal.timeout(12000)}),js=await r.text();
   const tokens=['follows','follow','live-chat:','live_alert','notifications','live_chat_messages','rpc(\x60','on(\x60broadcast','on(\x60postgres_changes','follower_id','followers_count'];
   const found={};
   for(const token of tokens){
    let at=0,count=0,ex=[];
    while((at=js.indexOf(token,at))>=0&&count<8){
     const sub=js.slice(Math.max(0,at-105),Math.min(js.length,at+175))
       .replace(/sb_publishable_[A-Za-z0-9_-]+/g,'<public-api-key>');
     ex.push(sub);count++;at+=token.length;
    }
    if(count)found[token]=ex;
   }
   console.log('[SV FOLLOW DIAG]',path,r.status,js.length,JSON.stringify(found).slice(0,18000));
  }catch(err){console.log('[SV FOLLOW DIAG] failed asset',path,String(err).slice(0,100))}
 }
 const url='https://naiijcvngtkkocligwvk.supabase.co/rest/v1/';
 const key=process.env.SV_KEY_FOR_DEBUG||'';
 // No credential used: we only inspect the site's declared public JS and API shapes.
});
