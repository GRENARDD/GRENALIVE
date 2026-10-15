import test from 'node:test';
test('inspect Starvios chat message subscription shape',async()=>{
 const html=await(await fetch('https://starvios.com/live/hyperactivo',{signal:AbortSignal.timeout(9000)})).text();
 const names=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(x=>x[1]);
 for(const u of names.filter(x=>/LiveChat|live\._username|social-/.test(x)).slice(0,5))try{
  const js=await(await fetch('https://starvios.com'+u,{signal:AbortSignal.timeout(8000)})).text();
  const pats=['l(h(e)', 'op===', 'n?.op', 'n?.msg', 'kind===','live-chat:', 'chat_events','follows','message:','starfall'];
  console.log('[SV STRUCTURE] asset',u,'len',js.length);
  for(const pat of pats){
   const at=js.indexOf(pat);
   if(at>=0)console.log('[SV STRUCTURE]',pat,js.slice(Math.max(0,at-280),Math.min(js.length,at+640)));
  }
 }catch(e){console.log('[SV STRUCTURE] err',String(e))}
});
