import test from 'node:test';
test('Starvios public viewer markup diagnostic',async()=>{
 const urls=['https://starvios.com/live?lang=&tag=latam','https://starvios.com/live/mostza12'];
 for(const url of urls)try{
  const r=await fetch(url,{signal:AbortSignal.timeout(10000)});
  const html=await r.text();
  const assets=[...html.matchAll(/(?:href|src)="([^"]+\.js)"/g)].map(x=>x[1]).filter(x=>x.startsWith('/assets/'));
  console.log('[STARVIOS PROBE]',url,'HTTP',r.status,'bytes',html.length,'assets:',assets.join('|'));
  console.log('[STARVIOS PROBE] stripped',html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(-700));
  if(url.endsWith('mostza12')){
    for(const name of assets.filter(x=>/live|stream|index|app|show/i.test(x)).slice(0,14)){
      try{
        const script=(await (await fetch('https://starvios.com'+name,{signal:AbortSignal.timeout(8000)})).text());
        const pat=/viewerCount|viewer_count|viewers|espectadores|viewCount|current_viewers|watching|api\/streams|api\/live/ig;
        let found=[],m;
        while((m=pat.exec(script))&&found.length<12){
          found.push(script.slice(Math.max(0,m.index-100),m.index+190));
        }
        console.log('[STARVIOS PROBE] js',name,script.length,JSON.stringify(found).slice(0,4000));
      }catch(e){console.log('[STARVIOS PROBE] asset err',name,String(e.message||e))}
    }
  }
 }catch(e){console.log('[STARVIOS PROBE] err',String(e.message||e))}
});
