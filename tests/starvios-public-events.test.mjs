import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStarviosChatEvent,parseStarviosFollowerCount,buildStarviosChatEventUrl,buildStarviosFollowerCountRequest} from '../starvios-public-events.mjs';

const sample=(kind,other={})=>({id:'00000000-0000-4000-8000-000000000001',kind,coins:0,profiles:{username:'fan'} ,...other});
test('detecta donaciones solo cuando hay monedas reales',()=>{
 assert.deepEqual(parseStarviosChatEvent(sample('chat',{coins:250})).kind,'gift');
 assert.equal(parseStarviosChatEvent(sample('chat',{coins:250})).amount,250);
 assert.equal(parseStarviosChatEvent(sample('chat',{coins:0})),null);
 assert.equal(parseStarviosChatEvent(sample('reward',{meta:{cost:10}})),null);
});
test('subs, renovaciones, subs regaladas, raid y starfall',()=>{
 assert.equal(parseStarviosChatEvent(sample('sub')).kind,'sub');
 assert.equal(parseStarviosChatEvent(sample('sub',{meta:{is_renewal:true}})).kind,'subrenew');
 const gifted=parseStarviosChatEvent(sample('gift',{meta:{qty:4}}));
 assert.deepEqual({kind:gifted.kind,count:gifted.count},{kind:'giftsub',count:4});
 assert.equal(parseStarviosChatEvent(sample('raid',{meta:{viewers:17}})).viewers,17);
 assert.equal(parseStarviosChatEvent(sample('starfall',{meta:{level:3}})).level,3);
 assert.equal(parseStarviosChatEvent(sample('follow')).kind,'follow');
});
test('no atribuye a otro canal ni inventa conteos',()=>{
 assert.equal(parseStarviosFollowerCount([{channel_id:'a',followers:12}],'a'),12);
 assert.equal(parseStarviosFollowerCount([{channel_id:'a',followers:12}],'b'),0);
 assert.equal(parseStarviosFollowerCount({},'a'),null);
 assert.equal(parseStarviosFollowerCount([{channel_id:'a',followers:-10}],'a'),null);
});
test('las consultas solo tienen límites, filtros de stream y son lectura',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const url=new URL(buildStarviosChatEventUrl(id,'2026-10-15T15:00:00.000Z'));
 assert.equal(url.searchParams.get('stream_id'),'eq.'+id);
 assert.equal(url.searchParams.get('order'),'created_at.asc');
 assert.equal(url.searchParams.get('limit'),'100');
 assert.deepEqual(JSON.parse(buildStarviosFollowerCountRequest(id)),{_channels:[id]});
});
