import test from 'node:test';
import assert from 'node:assert/strict';
import {StarviosReader} from '../starvios-reader.mjs';
import {parseStarviosPublicChat,buildStarviosChatEventUrl} from '../starvios-public-events.mjs';

const stream='00000000-0000-4000-8000-000000000001';
test('Starvios acepta texto público pero descarta avisos y filas sin contenido',()=>{
 const row={id:stream,kind:'chat',content:'Hola GREÑA',profiles:{username:'fan'},coins:3};
 assert.deepEqual(parseStarviosPublicChat(row),{
   id:stream,user:'fan',text:'Hola GREÑA',starvies:3
 });
 assert.equal(parseStarviosPublicChat({...row,kind:'follow'}),null);
 assert.equal(parseStarviosPublicChat({...row,content:''}),null);
 const url=new URL(buildStarviosChatEventUrl(stream,'2026-10-22T00:00:00.000Z',200,true,true,true));
 assert.match(url.searchParams.get('select'),/^\*,profiles:/);
 assert.equal(url.searchParams.get('stream_id'),'eq.'+stream);
});

test('la consulta pública envía mensajes nuevos al multichat una sola vez',async()=>{
 const original=globalThis.fetch, messages=[];
 const reader=new StarviosReader({onChat:m=>messages.push(m)});
 const now=Date.now();
 reader.running=true;reader.generation=1;reader.channel='canal';
 reader.sessionStartedAt=now-8000;reader.eventCursorAt=now-8000;reader.streamId=stream;
 globalThis.fetch=async()=>({ok:true,status:200,json:async()=>[
   {id:'00000000-0000-4000-8000-000000000002',kind:'chat',created_at:new Date(now-1000).toISOString(),content:'Llegó el chat',coins:0,profiles:{username:'fan'}},
   {id:'00000000-0000-4000-8000-000000000003',kind:'chat',created_at:new Date(now-15000).toISOString(),content:'histórico',coins:0,profiles:{username:'fan'}},
 ]});
 try{
   await reader.scanEvents();await reader.scanEvents();
   assert.equal(messages.length,1);
   assert.equal(messages[0].text,'Llegó el chat');
   assert.equal(messages[0].channel,'canal');
   reader.deliverChat({id:'otro-id',user:'fan',text:'Llegó el chat'});
   assert.equal(messages.length,1,'No duplicar entre DB y popout');
 }finally{globalThis.fetch=original;reader.running=false}
});

test('sin Chrome sigue consultando espectadores y mantiene reconexión visual',async()=>{
 let scans=0,reconnections=0;
 const reader=new StarviosReader();
 reader.scanLive=async()=>{scans++};
 reader.openChatPage=async()=>{throw Error('Chrome no disponible')};
 reader.scheduleRecovery=()=>{reconnections++};
 try{
   await reader.connect('canal');
   assert.equal(reader.running,true);
   assert.ok(scans>=1,'viewer polling independent of browser launch');
   assert.equal(reconnections,1);
   assert.ok(reader.liveTimer&&reader.eventTimer);
 }finally{await reader.disconnect()}
});

test('Starvios diagnostica canales guardados sin fingir conexión activa',()=>{
 const reader=new StarviosReader();
 const before=reader.getDiagnostics();
 assert.equal(before.running,false);
 assert.equal(before.viewerCount,null);
 reader.channel='canal';reader.running=true;reader.streamId=stream;
 reader.lastDirectoryError='HTTP 503';reader.lastChatDbError='HTTP 401';
 const diagnostics=reader.getDiagnostics();
 assert.equal(diagnostics.streamIdResolved,true);
 assert.equal(diagnostics.lastChatDbError,'HTTP 401');
 assert.equal(diagnostics.lastDirectoryError,'HTTP 503');
});

test('el puente principal no borra espectadores cuando el navegador de Starvios falla',async()=>{
 const {readFile}=await import('node:fs/promises');
 const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
 assert.match(server,/if\(p!=='starvios'\)setViewers\(p,0,'desconectado por bridge'\)/);
 assert.match(server,/previousAvailability!==meta\.available\)pushViewers\(\)/);
});
