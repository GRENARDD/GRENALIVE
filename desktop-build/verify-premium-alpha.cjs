// Browser-level OBS alpha smoke test. Uses Google Chrome or Edge shipped with GitHub's Windows runner.
// This validates actual computed styles and canvas pixels, not just textual CSS assertions.
const {chromium}=require('playwright-core');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const files={
 '/assets/grena-fullscreen-gift-obs.html':path.join(root,'assets','grena-fullscreen-gift-obs.html'),
 '/assets/grena-premium-catalog-obs.html':path.join(root,'assets','grena-premium-catalog-obs.html')
};
const executable=[
 process.env.CHROME_PATH,
 process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),
 process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
 process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe')
].find(p=>p&&fs.existsSync(p));
if(!executable){
 console.error('No Chrome/Edge executable found. Transparency cannot be verified; refusing to approve installer.');
 process.exit(1);
}
const server=http.createServer((req,res)=>{
 const file=files[new URL(req.url,'http://localhost').pathname];
 if(!file){res.writeHead(404);res.end('Not found');return}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--disable-gpu-sandbox']});
 try{
  for(const layout of ['horizontal','vertical']){
   const viewport=layout==='vertical'?{width:405,height:720}:{width:1280,height:720};
   for(const theme of ['full','catalog']){
    const page=await browser.newPage({viewport});
    const failures=[];
    page.on('pageerror',e=>failures.push(e.message));
    const url=base+'/assets/grena-'+(theme==='full'?'fullscreen-gift':'premium-catalog')+'-obs.html?obs=1&layout='+layout;
    await page.goto(url,{waitUntil:'load'});
    await page.waitForFunction(()=>!!window.GrenaAlert&&!!window.GrenaAlert.show,{timeout:12000});
    // Simulates the real OBS parent message using the same-origin bridge.
    await page.evaluate(({theme,gif})=>{
      window.postMessage({type:'GRENA_OBS_ALERT',theme:theme==='full'?'full':'premium',payload:{
        event:'gift',platform:'TikTok',name:'TestFan',amount:5,
        giftName:'Test Rose',giftImage:gif,duration:6
      }},location.origin);
    },{theme,gif});
    await page.waitForTimeout(1250);
    const state=await page.evaluate(({theme})=>{
      const ids=['html','body','stage'];
      const backgrounds=ids.map(id=>{
       const el=id==='html'?document.documentElement:id==='body'?document.body:document.getElementById(id);
       const cs=getComputedStyle(el);
       return {id,color:cs.backgroundColor,image:cs.backgroundImage};
      });
      const alert=document.getElementById('alert');
      const stage=document.getElementById('stage');
      const img=document.getElementById('gimg');
      const s=stage.getBoundingClientRect(),g=img.getBoundingClientRect();
      const card=document.querySelector('.card'),dim=document.querySelector('.dim');
      const cv=document.getElementById('fx');
      let quadrants=[0,0,0,0];
      if(theme==='full'&&cv.width>0){
       const ctx=cv.getContext('2d'),data=ctx.getImageData(0,0,cv.width,cv.height).data;
       for(let y=0;y<cv.height;y+=5)for(let x=0;x<cv.width;x+=5){
        const i=(y*cv.width+x)*4;if(data[i+3]>12)quadrants[(x>=cv.width/2?1:0)+(y>=cv.height/2?2:0)]++;
       }
      }
      return {
       backgrounds,
       card:card?{color:getComputedStyle(card).backgroundColor,image:getComputedStyle(card).backgroundImage}:null,
       dim:dim?getComputedStyle(dim).display:null,
       stage:{w:s.width,h:s.height},
       icon:{x:g.x+g.width/2,y:g.y+g.height/2},
       alertVisible:alert.classList.contains('in'),
       label:document.getElementById('uname')?.textContent,
       quadrants
      };
    },{theme});
    assert.equal(failures.length,0,theme+' page errors: '+failures.join(' | '));
    assert.equal(state.alertVisible,true,theme+' did not show alert');
    assert.equal(state.label,'TestFan',theme+' did not use streamed sender');
    for(const b of state.backgrounds){
      assert.ok(['rgba(0, 0, 0, 0)','transparent'].includes(b.color),
        theme+' '+layout+' '+b.id+' must be fully transparent, saw '+b.color);
      assert.equal(b.image,'none',theme+' '+layout+' '+b.id+' has a painted background');
    }
    if(theme==='catalog'){
      assert.equal(state.card.image,'none','Catalog paints a full dark card');
      assert.ok(['rgba(0, 0, 0, 0)','transparent'].includes(state.card.color));
    }else{
      assert.equal(state.dim,'none','Full Impact still dims the whole screen');
      assert.ok(Math.abs(state.icon.x-state.stage.w/2)<state.stage.w*.12,
        'Gift should be horizontally centered: '+JSON.stringify(state));
      assert.ok(state.quadrants.every(n=>n>0),
        'Rising particles must cover every screen quadrant: '+JSON.stringify(state.quadrants));
    }
    console.log('PASS transparent OBS '+theme+' '+layout+' '+JSON.stringify(state.quadrants));
    await page.close();
   }
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
