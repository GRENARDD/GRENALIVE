import test from 'node:test';
import assert from 'node:assert/strict';
import {StarviosReader} from '../starvios-reader.mjs';

const stream='00000000-0000-4000-8000-000000000000';
const follower='00000000-0000-4000-8000-000000000010';
const msg='00000000-0000-4000-8000-000000000002';

test('Starvios broadcasts: decode system event in nested realtime msg once',()=>{
 const events=[];
 const r=new StarviosReader({onEvent:e=>events.push(e)});
 r.running=true;r.channel='mychannel';r.streamId=stream;
 const packet={event:'broadcast',payload:{event:'message',payload:{msg:{id:msg,stream_id:stream,kind:'gift',coins:0,meta:{qty:3},profiles:{username:'fan'}}}}};
 r.acceptFrame(JSON.stringify(packet));
 r.acceptFrame(JSON.stringify(packet));
 assert.equal(events.length,1);
 assert.equal(events[0].kind,'giftsub');
 assert.equal(events[0].count,3);
});
test('REST polling: no replay and no duplicates, chat not counted as event',async()=>{
 const orig=globalThis.fetch,events=[],r=new StarviosReader({onEvent:e=>events.push(e)});
 const at=Date.now();
 r.running=true;r.generation=1;r.channel='test';r.streamId=stream;
 r.sessionStartedAt=at-1000;r.eventCursorAt=r.sessionStartedAt;
 r.followerPollAt=at;
 const rows=[
 {id:msg,kind:'chat',coins:150,created_at:new Date(at).toISOString(),profiles:{username:'fan'}},
 {id:'00000000-0000-4000-8000-000000000003',kind:'chat',coins:0,created_at:new Date(at).toISOString(),profiles:{username:'fan'}},
 {id:'00000000-0000-4000-8000-000000000004',kind:'sub',coins:0,created_at:new Date(at).toISOString(),profiles:{username:'fan'}},
 {id:'00000000-0000-4000-8000-000000000005',kind:'raid',coins:0,meta:{viewers:20},created_at:new Date(at-60000).toISOString(),profiles:{username:'fan'}}
 ];
 globalThis.fetch=async()=>new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});
 try{
  await r.scanEvents();await r.scanEvents();
  assert.deepEqual(events.map(x=>x.kind),['gift','sub']);
  assert.equal(r.dbEventsReady,true);
 }finally{globalThis.fetch=orig}
});
test('follower delta: emits only verified new count; identity stays anonymous',async()=>{
 const orig=globalThis.fetch,events=[],r=new StarviosReader({onEvent:e=>events.push(e)});
 r.running=true;r.generation=1;r.channel='test';r.channelId=follower;r.followerTotal=9;
 globalThis.fetch=async()=>new Response(JSON.stringify([{channel_id:follower,followers:11}]),{status:200});
 try{
  await r.scanFollowers(1);await r.scanFollowers(1);
  assert.equal(events.length,1);
  assert.equal(events[0].kind,'follow');
  assert.equal(events[0].count,2);
  assert.equal(events[0].anonymous,true);
  assert.equal(events[0].user,'Seguidor de Starvios');
 }finally{globalThis.fetch=orig}
});
