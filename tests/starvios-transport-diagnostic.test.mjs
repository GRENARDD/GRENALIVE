import test from 'node:test';
test('diagnose Starvios public LIVE event transport',async()=>{
 const assets=[
  'LiveChat-DpZtqjyE.js','live._username-QgbEr5eS.js',
  'LiveCard-CJRkDzT8.js','social-BEWsFIQk.js',
  'public-data-BlwdItU3.js'
 ];
 for(const name of assets)try{
  const js=await(await fetch('https://starvios.com/assets/'+name,{signal:AbortSignal.timeout(9000)})).text();
  const regex=/(postgres_changes|broadcast|realtime|from\(\x60(?:live_|chat_|channel_|notification|follow|subscr)|\.channel\(|\.on\(|\bkind===|kind:\x60|event_kind|gifted_subscription|star_shower|live_events|live_chat_messages|live_chat_events|stream_event|followed|subscription|shower)/ig;
  const matches=[];
  let m;
  while((m=regex.exec(js))&&matches.length<75){
   const s=js.slice(Math.max(0,m.index-95),Math.min(js.length,m.index+220));
   // No passwords or private account data are contained in these public scripts.
   matches.push(s);
  }
  console.log('[SV EVENT TRANSPORT]',name,js.length,JSON.stringify(matches).slice(0,13000));
 }catch(e){console.log('[SV EVENT TRANSPORT] failed',name,String(e.message||e))}
});
