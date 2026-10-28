import test from 'node:test';
import assert from 'node:assert/strict';
import {kickRealtimeFrames,kickRealtimeSubscriptionRequest} from '../kick-realtime.mjs';

test('Kick Pusher v2 chat events remain compatible',()=>{
  const raw=JSON.stringify({event:'App\\\\Events\\\\ChatMessageEvent',channel:'chatrooms.72.v2',data:JSON.stringify({id:5,content:'hola',sender:{username:'grena_rd'}})});
  const rows=kickRealtimeFrames(raw);
  assert.equal(rows.length,1);
  assert.equal(rows[0].channel,'chatrooms.72.v2');
  assert.equal(JSON.parse(rows[0].data).content,'hola');
});

test('Kick Centrifugo publishes chat events as Pusher-compatible envelopes',()=>{
  const raw=JSON.stringify({push:{channel:'chatrooms.72.v2',pub:{data:{event:'App\\\\Events\\\\ChatMessageEvent',data:JSON.stringify({id:12,content:'PRUEBA GREÑA 123',sender:{username:'grena_rd'}})}}}});
  const rows=kickRealtimeFrames(raw);
  assert.equal(rows[0].transport,'centrifugo');
  assert.equal(rows[0].channel,'chatrooms.72.v2');
  assert.match(rows[0].event,/ChatMessageEvent$/);
  assert.equal(rows[0].data.content,'PRUEBA GREÑA 123');
  assert.equal(rows[1].centrifugoControl,true);
});

test('Kick Centrifugo batches newline-separated frames',()=>{
  const first=JSON.stringify({id:7,subscribe:{recoverable:false}});
  const second=JSON.stringify({push:{channel:'chatrooms.11.v2',pub:{data:{event:'chat.message.sent',data:{content:'2',sender:{username:'test'}}}}}});
  const rows=kickRealtimeFrames(first+'\n'+second);
  assert.equal(rows[0].id,7);
  assert.equal(rows[1].event,'chat.message.sent');
});

test('Kick Centrifugo recognizes untagged chat only in chatroom channels',()=>{
  const msg={sender:{username:'other'},content:'hello'};
  const chat=kickRealtimeFrames(JSON.stringify({push:{channel:'chatrooms.20.v2',pub:{data:msg}}}));
  assert.equal(chat[0].event,'chat.message.sent');
  const unrelated=kickRealtimeFrames(JSON.stringify({push:{channel:'private.user.20',pub:{data:msg}}}));
  assert.ok(!unrelated.some(x=>x.event==='chat.message.sent'));
});

test('Kick Centrifugo sent subscription ID maps to a chatroom without leaking token',()=>{
  const req=JSON.stringify({id:23,subscribe:{channel:'chatrooms.345.v2',token:'private'}})+'\n'+JSON.stringify({id:24,subscribe:{channel:'account.secrets',token:'private'}});
  assert.deepEqual(kickRealtimeSubscriptionRequest(req),[{id:23,roomId:345,channel:'chatrooms.345.v2'}]);
});

test('Kick realtime rejects huge and malformed frames and remains bounded',()=>{
  assert.deepEqual(kickRealtimeFrames('a'.repeat(300000)),[]);
  assert.deepEqual(kickRealtimeFrames('{not json}'),[]);
  assert.equal(kickRealtimeFrames('{"id":1}\n'.repeat(1000)).length,32);
});
