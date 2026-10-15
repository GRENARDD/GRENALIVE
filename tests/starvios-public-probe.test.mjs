import test from 'node:test';
test('Starvios public viewer markup diagnostic (no assertions)',async()=>{
 for (const url of ['https://starvios.com/live?lang=&tag=latam','https://starvios.com/live/mostza12']){
   try {
     const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'user-agent':'Mozilla/5.0'}});
     const html=await r.text();
     const clean=html.replace(/[\r\n]+/g,' ').replace(/\s+/g,' ');
     const patterns=['viewer_count','viewerCount','viewers','liveViewer','watching','livestream','Live Stream','/_next/','streams'];
     console.log('[STARVIOS PROBE]',url,'status',r.status,'bytes',html.length,'title',/<title[^>]*>([^<]*)/.exec(html)?.[1]);
     for(const pat of patterns){
       const at=clean.toLowerCase().indexOf(pat.toLowerCase());
       if(at>=0)console.log('[STARVIOS PROBE]',pat,'index',at,JSON.stringify(clean.slice(Math.max(0,at-100),at+240)));
     }
     const script=clean.match(/<script id="__NEXT_DATA__"[^>]*>(.{1,250})/);
     if(script)console.log('[STARVIOS PROBE] NEXT',script[1].slice(0,180));
   }catch(e){console.log('[STARVIOS PROBE] error',String(e.message||e))}
 }
});
