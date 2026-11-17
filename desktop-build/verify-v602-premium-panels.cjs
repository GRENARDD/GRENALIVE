'use strict';
// Real Chromium layout smoke with isolated deterministic fake API responses.
// No fake data is shipped with GREÑA; these responses exist only inside CI tests.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const screenshots=path.join(root,'dist','v602-visual-evidence');
const executable=[
 process.env.CHROME_PATH,
 process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),
 process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
 process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe')
].find(p=>p&&fs.existsSync(p));
if(!executable)throw new Error('Falta Chrome/Edge para verificar visualmente GREÑA 6.0.2');
const gif='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const gifts=Array.from({length:60},(_,i)=>({
 id:'test-'+i,platform:['TikTok','Twitch','Kick','YouTube'][i%4],
 name:'Regalo '+(i+1),nameEs:'Regalo '+(i+1),
 amount:i+1,unit:i%4===1?'Bits':'Diamantes',
 giftKind:i%4===1?'bits':'gift',image:gif,animatedImage:i%3===0?gif:''
}));
const json=(res,data)=>{res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify({ok:true,...data}))};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const route=url.pathname;
 if(route==='/api/account/me')return json(res,{authenticated:true,active:true,user:{id:'visual-user',username:'visualuser',displayName:'Visual Test'}});
 if(route==='/api/license/status')return json(res,{allowed:true,permanentAccess:true,connected:true,license:{kind:'license',active:true}});
 if(route==='/api/status')return json(res,{status:{},bridgeRuntime:{},eventHealth:{}});
 if(route==='/api/activity')return json(res,{activity:[]});
 if(route==='/api/viewers')return json(res,{viewers:{tiktok:0,twitch:0,kick:0,youtube:0}});
 if(route==='/api/chat/live-messages')return json(res,{messages:[],more:false});
 if(route==='/api/soundboard')return json(res,{slots:Array.from({length:5},(_,i)=>({slot:i+1,empty:i!==0,label:'Audio '+(i+1),name:'Audio guardado',volume:35,shortcut:'Ctrl+KeyK',fade:true,url:gif}))});
 if(route==='/api/obs-token')return json(res,{token:'isolated-visual-token'});
 if(route==='/api/afterglow-settings')return json(res,{settings:{theme:'minecraft'}});
 if(route==='/api/gift-catalog')return json(res,{items:gifts,stats:{total:60,tiktok:15,twitch:15,kick:15,youtube:15,animated:20}});
 if(route==='/api/mobile/lan/enable')return json(res,{url:'http://192.0.2.8:8787'});
 if(route==='/api/mobile/pair/create')return json(res,{pairUrl:'http://192.0.2.8:8787/mobile/pair/TEST123',installationUrl:'http://192.0.2.8:8787/mobile.html',expiresAt:Date.now()+120000});
 if(route.startsWith('/api/'))return json(res,{});
 const name=route==='/'?'index.html':decodeURIComponent(route).replace(/^\/+/,'');
 const abs=path.resolve(root,name);
 if(!abs.startsWith(root+path.sep)||!fs.existsSync(abs)||!fs.statSync(abs).isFile()){res.writeHead(404);res.end('Not found');return}
 const ext=path.extname(abs).toLowerCase();
 const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.webp':'image/webp'}[ext]||'application/octet-stream';
 res.writeHead(200,{'content-type':type,'cache-control':'no-store'});
 fs.createReadStream(abs).pipe(res);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 fs.mkdirSync(screenshots,{recursive:true});
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--disable-gpu-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1920,height:1080}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('#profileName');
  await page.waitForTimeout(450);
  assert.equal(await page.locator('#nav .nb').count(),9,'Nine original V4 sections must remain');
  // Gift catalog must be legible, scrollable and animated.
  await page.locator('#nav .nb').nth(8).click();
  await page.waitForSelector('#pg8.on .gift',{timeout:8000});
  const giftsLayout=await page.locator('#gg').evaluate(feed=>{
    const cards=[...feed.querySelectorAll('.gift')];
    return {visible:cards.length,heights:cards.map(c=>c.getBoundingClientRect().height),
      images:feed.querySelectorAll('.em img,.em video').length,
      viewportHeight:feed.clientHeight,contentHeight:feed.scrollHeight,
      width:feed.getBoundingClientRect().width};
  });
  assert.equal(giftsLayout.visible,24,'The full catalog must be loaded in legible pages, not 240 tiny cards');
  assert.ok(giftsLayout.heights.every(x=>x>=175),'Gift card has collapsed: '+Math.min(...giftsLayout.heights));
  assert.ok(giftsLayout.images>=15,'Live gift images/animations not displayed');
  assert.ok(giftsLayout.contentHeight>giftsLayout.viewportHeight,'Gift catalog should scroll inside its dedicated list');
  await page.screenshot({path:path.join(screenshots,'regalos-1920.png')});
  // Mobile QR real generator must fit and not cover expiry or buttons.
  await page.locator('#nav .nb').nth(2).click();
  await page.locator('#wf').click();
  await page.locator('#gq').click();
  await page.waitForFunction(()=>document.querySelectorAll('#q1 img,#q1 canvas,#q2 img,#q2 canvas').length>=2,{timeout:6000});
  const mobile=await page.evaluate(()=>{
    const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    return {q1:rect('q1'),q2:rect('q2'),cd:rect('cd'),gq:rect('gq')};
  });
  assert.ok(mobile.q1.height>=170&&mobile.q2.height>=170,'QR must not be clipped to 112px');
  assert.ok(mobile.q2.bottom<=mobile.cd.top+2,'Pairing expiry overlaps its QR');
  assert.ok(mobile.cd.bottom<=mobile.gq.top+2,'Pairing button overlaps expiry');
  await page.screenshot({path:path.join(screenshots,'movil-qr-1920.png')});
  // Widget Configurar must show the ACTUAL saved model selectors and previews.
  await page.locator('#nav .nb').nth(5).click();
  await page.locator('#pg5 [data-v4-action="widget-config"]').nth(1).click();
  const focused=page.frameLocator('iframe[src*="type=counter"]');
  await focused.locator('#style').waitFor({timeout:12000});
  assert.ok(await focused.locator('#counterStyle option').count() >=4,'Counter models missing');
  assert.equal(await page.locator('#premiumBody > iframe:visible').count(),1,'Only selected widget editor should appear');
  await page.screenshot({path:path.join(screenshots,'widgets-1920.png')});
  // Long press on soundboard opens V4 settings and volume without playback.
  await page.locator('#premiumClose').click();
  await page.locator('#nav .nb').nth(0).click();
  await page.locator('#prow .pad').nth(0).dispatchEvent('pointerdown',{button:0});
  await page.waitForTimeout(3100);
  await page.locator('#v4PadVolume').waitFor({timeout:4000});
  assert.equal(await page.locator('#v4PadVolume').inputValue(),'35');
  assert.ok(await page.locator('#premiumBody').getByText('Eliminar audio').count()===0,'Delete action belongs in modal footer');
  await page.screenshot({path:path.join(screenshots,'audio-largo-1920.png')});
  await page.close();
  // Owner administration retains functional markup but is themed gold.
  const admin=await browser.newPage({viewport:{width:1920,height:1080}});
  await admin.goto(base+'/license-admin.html',{waitUntil:'domcontentloaded'});
  const theme=await admin.locator('body').evaluate(el=>({className:el.className,background:getComputedStyle(el).backgroundColor}));
  assert.equal(theme.className,'grena-admin-v4');
  assert.ok(theme.background!=='rgb(11, 15, 25)','Old purple administration look still active');
  await admin.screenshot({path:path.join(screenshots,'administracion-1920.png')});
  await admin.close();
  assert.equal(errors.filter(x=>/SyntaxError|ReferenceError/.test(x)).length,0,'Frontend script error: '+errors.join('; '));
  console.log('OK: GREÑA 6.0.2 gift cards, GIFs, QR layout, focused widget preview, hold-to-config and gold Admin captured at 1920x1080.');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
