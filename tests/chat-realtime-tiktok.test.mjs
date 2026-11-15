import test from 'node:test';
import assert from 'node:assert/strict';
import {createRealtimeTikTokChatRouter,createRealtimeSocketWatchdog} from '../chat-realtime-guard.mjs';

test('TikTok named comments reach chat immediately, including identical repeated text',()=>{
  const delivered=[];
  let clock=100;
  const router=createRealtimeTikTokChatRouter({
    deliver:(m,source)=>delivered.push({message:m.text,source}),
    getId:m=>m.id,
    signature:m=>m.user+'|'+m.text,
    now:()=>clock,
    defer:fn=>fn()
  });
  router.onNamed({id:'one',user:'viewer',text:'hola'});
  router.onNamed({id:'two',user:'viewer',text:'hola'});
  assert.deepEqual(delivered.map(x=>x.message),['hola','hola']);
  assert.deepEqual(delivered.map(x=>x.source),['named','named']);
});

test('decode fallback recovers comments when a named event is missing, never double emits',()=>{
  const delivered=[],scheduled=[];
  let clock=100;
  const router=createRealtimeTikTokChatRouter({
    deliver:(m,source)=>delivered.push({id:m.id||'',source}),
    getId:m=>m.id,
    signature:m=>m.user+'|'+m.text,
    now:()=>clock,
    defer:fn=>scheduled.push(fn)
  });
  const normal={id:'normal',user:'a',text:'test'};
  router.onDecoded('WebcastChatMessage',{data:normal});
  router.onNamed(normal);
  scheduled.shift()();
  assert.deepEqual(delivered.map(x=>x.id),['normal']);

  const onlyDecoded={id:'recovered',user:'b',text:'¿me leen?'};
  router.onDecoded('WebcastChatMessage',{data:onlyDecoded});
  scheduled.shift()();
  assert.deepEqual(delivered.map(x=>x.id),['normal','recovered']);
  assert.equal(router.stats.fallbackDelivered,1);

  const noId={user:'c',text:'hola'};
  router.onDecoded('WebcastChatMessage',{data:noId});
  router.onNamed(noId);
  scheduled.shift()();
  assert.equal(delivered.length,3);

  // Comments missing a server ID must not be deduplicated by their text
  // when emitted through the normal named route.
  router.onNamed(noId);
  assert.equal(delivered.length,4);
});

test('a quiet but healthy socket is not disconnected; only a dead transport is restarted',()=>{
  let time=0;
  const stale=[];
  const socket={readyState:1,open:true,pings:0,ping(){this.pings++}};
  const health=createRealtimeSocketWatchdog({
    socket,active:()=>true,stale:reason=>stale.push(reason),
    now:()=>time,timeoutMs:45000
  });
  health.tick();
  time+=30000;
  health.markHealthy(); // pong or inbound frame during a quiet LIVE
  health.tick();
  time+=30000;
  health.markHealthy();
  health.tick();
  assert.deepEqual(stale,[]);
  assert.equal(socket.pings,3);
  time+=46000;
  health.tick();
  assert.deepEqual(stale,['pong-timeout']);
  health.tick();
  assert.deepEqual(stale,['pong-timeout'],'a dead socket is restarted only once');
});

test('watchdog detects closed sockets without waiting for a chat message',()=>{
  const stale=[];
  const health=createRealtimeSocketWatchdog({
    socket:{readyState:3,open:false},active:()=>true,stale:reason=>stale.push(reason)
  });
  health.tick();
  assert.deepEqual(stale,['socket-closed']);
});

test('a failed named decode does not block a richer decoded copy with the same message ID',()=>{
  const delivered=[],scheduled=[];
  const router=createRealtimeTikTokChatRouter({
    deliver:(m,source)=>{if(!m.text)return false;delivered.push({text:m.text,source});return true},
    getId:m=>m.id,
    signature:m=>m.user+'|'+(m.text||''),
    now:()=>100,
    defer:fn=>scheduled.push(fn)
  });
  router.onNamed({id:'partial-1',user:'viewer'});
  router.onDecoded('WebcastChatMessage',{data:{id:'partial-1',user:'viewer',text:'ahora sí'}});
  scheduled.shift()();
  assert.deepEqual(delivered,[{text:'ahora sí',source:'decoded'}]);
});

test('Kick does not suppress legitimate rapid repeat comments from its same live source',async()=>{
  const {readFileSync}=await import('node:fs');
  const source=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
  assert.match(source,/sameText\.origin!==origin/);
  assert.match(source,/deliverKickChat\(msg,'webhook'\)/);
  assert.match(source,/consumeKickRealtimeFrame\(frame\.payload,'browser'\)/);
});
