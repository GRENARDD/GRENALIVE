import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import {chromium} from 'playwright-core';

const ASSETS=['grena-mascot-alerts.html','grenito-original-alerts.html'];
const BIN=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(p=>p&&existsSync(p));
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);

// Decode lossless screenshot pixels (including alpha) without adding dependencies.
function decodePng(buf){
 assert.ok(buf.subarray(0,8).equals(PNG_SIGNATURE),'Expected PNG');
 let width=0,height=0,depth=0,type=0,position=8;
 const idat=[];
 while(position+12<=buf.length){
  const len=buf.readUInt32BE(position);
  const chunk=buf.toString('ascii',position+4,position+8);
  const data=buf.subarray(position+8,position+8+len);
  position+=12+len;
  if(chunk==='IHDR'){
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);
   depth=data[8];type=data[9];
  }else if(chunk==='IDAT')idat.push(data);
  if(chunk==='IEND')break;
 }
 assert.equal(depth,8,'PNG must use 8-bit pixels');
 assert.equal(type,6,'Transparent screenshot must be RGBA PNG');
 const raw=inflateSync(Buffer.concat(idat));
 const stride=width*4,out=Buffer.alloc(height*stride),bpp=4;
 let off=0;
 for(let y=0;y<height;y++){
  const filter=raw[off++];
  for(let x=0;x<stride;x++){
   const encoded=raw[off++],left=x>=bpp?out[y*stride+x-bpp]:0,up=y?out[(y-1)*stride+x]:0,ul=y&&x>=bpp?out[(y-1)*stride+x-bpp]:0;
   let prediction=0;
   if(filter===1)prediction=left;
   else if(filter===2)prediction=up;
   else if(filter===3)prediction=Math.floor((left+up)/2);
   else if(filter===4){
    const p=left+up-ul,pa=Math.abs(p-left),pb=Math.abs(p-up),pc=Math.abs(p-ul);
    prediction=pa<=pb&&pa<=pc?left:pb<=pc?up:ul;
   }else assert.equal(filter,0,'Unsupported PNG filter');
   out[y*stride+x]=(encoded+prediction)&255;
  }
 }
 return {width,height,alpha:(x,y)=>out[(y*width+x)*4+3]};
}

test('actual nested mascot scenes retain transparent alpha around visible characters',{timeout:45000},async t=>{
 assert.ok(BIN,'Chrome/Chromium is required for the pixel compositing test');
 const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/harness'){
   const asset=ASSETS.includes(url.searchParams.get('asset'))?url.searchParams.get('asset'):ASSETS[0];
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
   res.end('<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent"><iframe id="scene" allowtransparency="true" style="position:absolute;inset:0;border:0;width:100%;height:100%;background:transparent" src="/assets/'+asset+'?obs=1"></iframe></body></html>');
   return;
  }
  if(url.pathname.startsWith('/assets/')){
   const asset=url.pathname.slice('/assets/'.length);
   if(ASSETS.includes(asset)){
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(readFileSync(new URL('../assets/'+asset,import.meta.url)));
    return;
   }
  }
  res.writeHead(404);res.end('Not found');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const browser=await chromium.launch({executablePath:BIN,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:800,height:700},deviceScaleFactor:1});
 for(const asset of ASSETS){
  await page.goto('http://127.0.0.1:'+server.address().port+'/harness?asset='+asset,{waitUntil:'load'});
  const frame=page.frameLocator('#scene');
  await frame.locator('#cv').waitFor();
  const surfaces=await frame.locator('html').evaluate(html=>{
   const doc=html.ownerDocument;
   return ['html','body','#app','#stw','#st','#sv','#cv'].map(selector=>{
    const computed=getComputedStyle(doc.querySelector(selector));
    return {selector,background:computed.backgroundColor,backgroundImage:computed.backgroundImage};
   });
  });
  for(const {selector,background,backgroundImage} of surfaces){
   assert.equal(background,'rgba(0, 0, 0, 0)',asset+' '+selector+' painted opaque backdrop');
   assert.equal(backgroundImage,'none',asset+' '+selector+' painted a background image');
  }
  const empty=decodePng(await page.screenshot({omitBackground:true}));
  for(const [x,y] of [[5,5],[794,5],[5,694],[794,694]])
   assert.equal(empty.alpha(x,y),0,asset+' background is opaque at '+x+','+y);
  await frame.locator('body').evaluate(()=>window.GRENITO.trigger({type:'follow',user:'spectator_demo',platform:'twitch',amount:1}));
  await page.waitForTimeout(900);
  const active=decodePng(await page.screenshot({omitBackground:true}));
  let visible=0;
  for(let y=185;y<540;y+=12)for(let x=205;x<600;x+=12)if(active.alpha(x,y)>220)visible++;
  assert.ok(visible>20,asset+' lost the original animated character during alpha hardening');
 }
});
