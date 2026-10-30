'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const {createTracker}=require('../assets/minecraft-activity-ranking.js');

test('Minecraft muestra como máximo diez y los ordena por comentarios y tiempo activo',()=>{
 const a=createTracker(),now=Date.now();
 for(let i=0;i<15;i++)a.observe({type:'chat',platform:'tiktok',user:'viewer'+i,text:'hola '+i},now+i);
 for(let i=0;i<5;i++)a.observe({type:'chat',platform:'tiktok',user:'viewer12',text:'comentario '+i},now+10000+i*8500);
 const top=a.top(now+45000);
 assert.equal(top.length,10);
 assert.equal(top[0].key,'tiktok:viewer12');
 assert.ok(top.every(x=>x.comments>=1));
});
test('Tiempo estimado no aumenta indefinidamente sin nueva señal de presencia',()=>{
 const a=createTracker(),now=Date.now();
 a.observe({type:'join',platform:'tiktok',user:'viewer'},now);
 a.tick(now+50000);
 const first=a.top(now+50000)[0];assert.ok(first.timeMs>=49000);
 a.tick(now+300000);
 const u=a.top(now+300000)[0];
 assert.equal(u.timeMs,90000);
 assert.equal(Math.floor(u.activeMinutes),1);
});
test('Los regalos suben niveles; no compran el ranking de comentarios',()=>{
 const a=createTracker(),now=Date.now();
 a.observe({type:'chat',platform:'tiktok',user:'commenter',text:'hola'},now);
 a.observe({type:'gift',platform:'tiktok',user:'donor',coins:6000,count:1},now+1);
 const top=a.top(now+2000);
 assert.equal(top[0].key,'tiktok:commenter');
 assert.ok(top.find(x=>x.key==='tiktok:donor').xpTotal>0);
 assert.ok(top.find(x=>x.key==='tiktok:donor').level>0);
});
test('No sube XP con duplicados por ID o spam repetido inmediato',()=>{
 const a=createTracker(),now=Date.now();
 const e={type:'chat',platform:'tiktok',user:'same',text:'XD',messageId:'id100'};
 a.observe(e,now);a.observe(e,now+300);a.observe({...e,messageId:'id101'},now+700);
 assert.equal(a.top(now+700)[0].comments,1);
 a.observe({...e,messageId:'id102'},now+9000);assert.equal(a.top(now+9000)[0].comments,2);
});
test('Salida, reinicio de sala y restauración del LIVE',()=>{
 const a=createTracker(),now=Date.now();
 a.setRoom('room1');a.observe({type:'chat',platform:'tiktok',user:'viewer',text:'hi'},now);
 const state=a.exportState();
 const b=createTracker();assert.equal(b.restore(state,now+1000),true);
 assert.equal(b.top(now+1000).length,1);
 b.observe({type:'leave',platform:'tiktok',user:'viewer'},now+2000);
 assert.equal(b.top(now+2001).length,0);
 a.setRoom('room2');assert.equal(a.top(now+5000).length,0);
});
test('TikTok recupera comentarios con texto anidado sin inventar mensajes',()=>{
 const raw=src('chat-server.mjs');
 const start=raw.indexOf('function tiktokDeepCommentText(data)'),end=raw.indexOf('// OBTENER USUARIO TIKTOK DESDE URL',start);
 assert.ok(start>0&&end>start);
 const block=raw.slice(start,end);
 const firstString=(...values)=>{for(const v of values){if(typeof v==='string'&&v.trim())return v.trim();if(typeof v==='number'&&Number.isFinite(v))return String(v)}return ''};
 const payload={data:{user:{uniqueId:'espectador_1',nickname:'Invitado'},comment:{content:{text:'mensaje anidado'}}}};
 const result=vm.runInNewContext(block+'; extractTikTokChat(payload)',{payload,firstString,findUrl:()=>'',getTikTokFollowerStatus:()=>false,getTikTokSubscriberStatus:()=>false});
 assert.equal(result.user,'espectador_1');assert.equal(result.text,'mensaje anidado');
 assert.match(raw,/WebcastEvent\.MEMBER/);
 assert.match(raw,/tiktokChatStats\.sessionEmpty/);
});
test('Widget Minecraft recibe chat y regalos de fuentes separadas',()=>{
 const html=src('personajes-minecraft.html');
 assert.match(html,/GrenaMinecraftActivity\.createTracker/);
 assert.match(html,/Math\.min\(10,Number\(Q\.get\('max'\)\)\|\|10\)/);
 assert.match(html,/source==='chat'/);
 assert.match(html,/source==='main'&&d\.type==='alert'/);
 assert.match(html,/activity\.top\(\)/);
});
