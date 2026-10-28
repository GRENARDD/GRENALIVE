import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const file=new URL('../chat-server.mjs',import.meta.url);
const source=readFileSync(file,'utf8');

function functionSource(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing Kick code fragment: '+start);
  return source.slice(a,b);
}
const normalizeSource=functionSource('function normalizeKickChatPayload(raw){','async function deliverKickChat(msg){');
const normalize=runInNewContext(normalizeSource+'\nnormalizeKickChatPayload',
  {findUrl:(...args)=>args.find(x=>typeof x==='string'&&/^https?:/.test(x))||''});

test('Kick chat parses official webhook messages while the channel is offline',()=>{
  const msg=normalize({message_id:'evt-a',sender:{username:'grena_rd',user_id:3},content:'PRUEBA GREÑA 123'});
  assert.equal(msg.user,'grena_rd');
  assert.equal(msg.text,'PRUEBA GREÑA 123');
  assert.equal(msg.messageId,'evt-a');
});
test('Kick chat parses nested Pusher messages',()=>{
  const msg=normalize({event:'App\\\\Events\\\\ChatMessageEvent',data:JSON.stringify({
    id:'evt-b',message:'hola',sender:{username:'gamer',id:16}})});
  assert.equal(msg.user,'gamer');
  assert.equal(msg.text,'hola');
  assert.equal(msg.messageId,'evt-b');
});
test('Kick chat does not mistake account OAuth for realtime readiness',()=>{
  assert.match(source,/if\(!kickPusherReady&&!kickBrowserChatReady\)/);
  assert.match(source,/kickConnected=realtime;/);
  assert.match(source,/chatroomResolved:!!kickChatroomId/);
});
test('Kick alerts do not manufacture unique IDs that defeat follow/sub deduplication',()=>{
  assert.match(source,/String\(platform\)\.toLowerCase\(\)!=='kick'/);
  assert.match(source,/eventId:String\(d\.event_id\|\|d\.message_id/);
});
const readerSource=functionSource('async function launchKickChatReader(channel){','async function connectKick(input) {');
function readerContext(options={}){
  const c={
    kickChatroomId:0,kickBrowserChatReady:false,kickPusherReady:false,
    kickPagePollTimer:null,kickRealtimeLastError:'',kickViewerDiagnosticAt:0,
    resolveKickPageState:async()=>({chatroomId:options.roomId||0,liveKnown:false,followerCount:null,channelId:12}),
    bridgeViewers:()=>{},handleKickFollowerCount:()=>{},pollKickPageState:()=>{},
    clearInterval:()=>{},setInterval:()=>1,setTimeout:fn=>{fn();return 1},
    connectKickPusher:async()=>{if(options.pusherReady)c.kickPusherReady=true;else throw Error('Sin suscripción Pusher')},
    console:{warn:()=>{}}
  };
  c.kickBrowserChatReady=!!options.browserReady;
  runInNewContext(readerSource+'\nthis.reader=launchKickChatReader',c);
  return c;
}
test('Kick reader rejects a channel with no chatroom ID and no browser realtime',async()=>{
  const ctx=readerContext();
  await assert.rejects(ctx.reader('grena-rd'),/no entregó el chatroom ID/);
});
test('Kick reader rejects failed Pusher subscriptions rather than claiming connected',async()=>{
  const ctx=readerContext({roomId:1082});
  await assert.rejects(ctx.reader('grena-rd'),/no confirmó una suscripción al chat/);
});
test('Kick reader accepts a verified Pusher chatroom subscription',async()=>{
  const ctx=readerContext({roomId:1082,pusherReady:true});
  assert.equal(await ctx.reader('grena-rd'),true);
});
test('Kick reader accepts the Kick page realtime when its subscription was confirmed',async()=>{
  const ctx=readerContext({browserReady:true});
  assert.equal(await ctx.reader('grena-rd'),true);
});
