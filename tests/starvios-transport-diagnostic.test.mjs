import test from 'node:test';
test('inspect current public Starvios event transport',async()=>{
 const base='https://starvios.com';
 const pages=['/live/mostza12','/popout/chat/mostza12'];
 let names=[];
 for(const path of pages)try{
  const r=await fetch(base+path,{signal:AbortSignal.timeout(8000)}),html=await r.text();
  const a=[...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(x=>x[1]);
  names.push(...a.filter(x=>/live\.|chat|LiveChat|index-|client-|LiveCard/i.test(x)));
  console.log('[SV EVENTS] page',path,r.status,'bytes',html.length,'matched',a.filter(x=>/live\.|chat|LiveChat|LiveCard/i.test(x)).slice(0,12).join(','));
 }catch(e){console.log('[SV EVENTS] page fail',path,String(e))}
 for(const url of [...new Set(names)].slice(0,9))try{
  const r=await fetch(base+url,{signal:AbortSignal.timeout(8000)}),js=await r.text();
  const regex=/(postgres_changes|broadcast|realtime|\.channel\(|\.on\(|live_chat_|live_events|live_streams|live_messages|stream_events|chat_message|gifted_subscription|star_shower|shower|follow|subscription|raid)/ig;
  const snippets=[];let m;
  while((m=regex.exec(js))&&snippets.length<70){
   let snip=js.slice(Math.max(0,m.index-95),Math.min(js.length,m.index+170));
   snip=snip.replace(/eyJ[A-Za-z0-9_-]{50,}/g,'<JWT>');
   snippets.push(snip);
  }
  console.log('[SV EVENTS] asset',url,r.status,js.length,JSON.stringify(snippets).slice(0,16000));
 }catch(e){console.log('[SV EVENTS] asset fail',url,String(e))}
});
