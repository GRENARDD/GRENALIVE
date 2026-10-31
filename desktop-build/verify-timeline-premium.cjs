// Headless Chromium smoke test for the real Timeline Premium overlay.
const {chromium}=require('playwright-core');
const {WebSocketServer}=require('ws');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'timeline-premium.html'));
const executable=[
 process.env.CHROME_PATH,
 process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),
 process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
 process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe')
].find(p=>p&&fs.existsSync(p));
if(!executable)throw Error('Chrome/Edge no disponible para probar Timeline Premium; fallo seguro.');
const defaults={direction:'left',edgeOffset:12,width:680,scale:100,fontSize:20,nameSize:17,starSize:10,lineWidth:3,gap:13,maxMessages:6,duration:14,speed:300,showBadges:true,showPlatform:true,colorMode:'role',normalColor:'#6b3971',moderatorColor:'#2483b3',ownerColor:'#b78035',subscriberColor:'#8055a7',tiktokColor:'#57a1c4',twitchColor:'#8f53cb',kickColor:'#58a64e',youtubeColor:'#c45773',starviosColor:'#dd6d9a'};
const fixture={type:'chat',platform:'twitch',nickname:'GON_PNG',user:'gon_png',text:'AJA',_historyId:'fixture-history-1'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 const send=(code,type,body)=>{res.writeHead(code,{'content-type':type});res.end(body)};
 if(u.pathname==='/chat/timeline-premium.html')return send(200,'text/html; charset=utf-8',html);
 if(u.pathname==='/chat/api/timeline-premium-settings')return send(200,'application/json',JSON.stringify({ok:true,settings:defaults}));
 if(u.pathname==='/chat/api/multichat-history')return send(200,'application/json',JSON.stringify({ok:true,messages:[fixture]}));
 return send(404,'text/plain','Not found');
});
const wss=new WebSocketServer({server,path:'/chat-ws'});
const sockets=new Set();
wss.on('connection',ws=>{sockets.add(ws);ws.on('close',()=>sockets.delete(ws))});
const broadcast=data=>{for(const ws of sockets)if(ws.readyState===1)ws.send(JSON.stringify(data))};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:executable,headless:true,args:['--disable-gpu-sandbox']});
 try{
  for(const viewport of [{width:1920,height:1080},{width:1080,height:1920}]){
   const page=await browser.newPage({viewport});
   const pageErrors=[];page.on('pageerror',err=>pageErrors.push(err.message));
   await page.goto(base+'/chat/timeline-premium.html?obs=TEST',{waitUntil:'load'});
   await page.waitForSelector('.item .name-pill',{timeout:10000});
   await page.waitForFunction(()=>document.querySelectorAll('.item').length===1);
   let connected=false;for(let i=0;i<100;i++){if(sockets.size){connected=true;break}await new Promise(r=>setTimeout(r,25))}
   assert.ok(connected,'El overlay no abrió su conexión real WebSocket.');
   let state=await page.evaluate(()=>{
     const html=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
     const name=document.querySelector('.nick'),rail=getComputedStyle(document.querySelector('.item'),'::before');
     return {htmlBg:html.backgroundColor,bodyBg:body.backgroundColor,name:name?.textContent,text:document.querySelector('.content')?.textContent,star:!!document.querySelector('.marker svg'),rail:rail.width};
   });
   assert.equal(state.name,'GON_PNG');assert.equal(state.text,'AJA');
   assert.equal(state.star,true,'No renderiza la estrella del video');
   assert.equal(state.rail,'3px');
   for(const color of [state.htmlBg,state.bodyBg])assert.ok(['rgba(0, 0, 0, 0)','transparent'].includes(color),'El fondo OBS debe ser transparente: '+color);
   broadcast({...fixture});await page.waitForTimeout(130);
   assert.equal(await page.locator('.item').count(),1,'El historial se duplica al reconectar');
   broadcast({type:'chat',platform:'tiktok',nickname:'SantyCosmico',text:'NOOO 🤣',isModerator:true,_historyId:'fixture-2'});
   await page.waitForFunction(()=>document.querySelectorAll('.item').length===2);
   assert.equal(await page.locator('.item[data-role="moderator"] .badge-pill').count(),1,'Faltan insignias de rol');
   await page.evaluate(()=>window.postMessage({type:'grena-timeline-settings',settings:{direction:'right',scale:130,colorMode:'platform',maxMessages:2}},location.origin));
   await page.waitForFunction(()=>document.body.classList.contains('right'));
   broadcast({type:'chat',platform:'youtube',nickname:'UnaPersona',text:'<img src=x onerror=alert(1)>',_historyId:'fixture-3'});
   await page.waitForFunction(()=>document.querySelectorAll('.item:not(.leaving)').length===2);
   assert.equal(await page.locator('.item img').count(),0,'Contenido del chat inyecta HTML');
   assert.match(await page.locator('.item:last-child .content').textContent(),/<img src=x onerror=alert\(1\)>/);
   assert.equal(pageErrors.length,0,'Errores del navegador: '+pageErrors.join(' | '));
   console.log('PASS Timeline Premium OBS '+viewport.width+'x'+viewport.height+' (alpha, estrellas, roles, XSS, chat y ajustes)');
   await page.close();
  }
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1}).finally(()=>{wss.close();server.close()});
