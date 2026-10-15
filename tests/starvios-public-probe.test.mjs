import test from 'node:test';
test('Starvios public API discovery diagnostic',async()=>{
 const names=['public-data-BlwdItU3.js','live._username-QgbEr5eS.js','LiveCard-CJRkDzT8.js','client-DPf_qMSn.js','index-JttxfjF5.js','root-DLTE-HSj.js'];
 for(const name of names){
  try {
   const url='https://starvios.com/assets/'+name;
   const js=await(await fetch(url,{signal:AbortSignal.timeout(10000)})).text();
   const snippets=[];
   const pattern=/supabase\.co|supabaseKey|createClient|publishable|live_viewer_counts|live_streams|from.{0,12}profiles|from.{0,12}streams|from.{0,12}livestreams|PUBLIC_SUPABASE|VITE_SUPABASE|viewer_count|channel_id/ig;
   let m;
   while((m=pattern.exec(js))&&snippets.length<28){
    let s=js.slice(Math.max(0,m.index-135),m.index+300);
    s=s.replace(/eyJ[A-Za-z0-9_-]{50,}/g,'<PUBLIC_JWT_REDACTED>');
    snippets.push(s);
   }
   console.log('[STARVIOS DISCOVER]',name,'size',js.length,'matches',JSON.stringify(snippets).slice(0,9800));
  }catch(e){console.log('[STARVIOS DISCOVER]',name,'err',String(e.message||e))}
 }
});
