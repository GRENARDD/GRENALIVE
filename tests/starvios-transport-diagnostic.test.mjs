import test from 'node:test';
test('inspect current Starvios chat kind and realtime subscriptions',async()=>{
 const html=await(await fetch('https://starvios.com/live/mostza12',{signal:AbortSignal.timeout(9000)})).text();
 const urls=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(x=>x[1]);
 const paths=urls.filter(x=>/LiveChat|live\._username|popout|LiveCard/.test(x));
 for(const url of paths)try{
  const js=await(await fetch('https://starvios.com'+url,{signal:AbortSignal.timeout(8000)})).text();
  const patterns=[
   /kind(?:\s*===|===|==|:\s*|:\x60|\s*=\s*)\x60[a-z_]+\x60/gi,
   /(?:kind|meta)\?\./gi,/live_chat_messages/g,
   /postgres_changes/g,/(?:channel|subscribe)\(/g,
   /(\.from\(\x60live_chat_messages\x60)/g,
   /(?:(?:\.on|\.rpc)\(\x60[a-zA-Z_]+\x60)/g
  ];
  const parts=[];
  for(const p of patterns){
   let count=0,m;
   while((m=p.exec(js))&&count<22){
    const before=js.slice(Math.max(0,m.index-170),m.index);
    const after=js.slice(m.index,Math.min(js.length,m.index+380));
    parts.push(before+after);
    count++;
   }
  }
  console.log('[SV KINDS]',url,'len',js.length,JSON.stringify(parts).slice(0,26000));
 }catch(e){console.log('[SV KINDS] err',url,String(e))}
});
