import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const start=html.indexOf('function voicePriority(message = {}){');
const stop=html.indexOf('function updateVoiceLanguageChoices()',start);
assert.ok(start>=0&&stop>start,'Live no-backlog voice functions missing');
function createReader(){
 const dropped=[],ctx={
   voiceQueue:[],voiceDroppedOverload:0,
   cleanupFishPreparedMessage:(msg,abort)=>dropped.push({name:msg.text,abort}),
   Date
 };
 runInNewContext(html.slice(start,stop)+'\nthis.add=insertVoiceByPriority;this.priority=voicePriority',ctx);
 return {ctx,dropped};
}
test('A flood of 400 chat messages never accumulates a backlog',()=>{
 const {ctx,dropped}=createReader();
 for(let i=0;i<400;i++){
   assert.equal(ctx.add({text:'msg'+i,user:'viewer'+i}),true);
   assert.ok(ctx.voiceQueue.length<=1);
 }
 assert.equal(ctx.voiceQueue[0].text,'msg399');
 assert.equal(ctx.voiceDroppedOverload,399);
 assert.equal(dropped.length,399);
 assert.ok(dropped.every(x=>x.abort));
});
test('A moderator, subscriber, or streamer replaces a low-priority pending message',()=>{
 const {ctx}=createReader();
 ctx.add({text:'viewer'});
 ctx.add({text:'subscriber',isSubscriber:true});
 assert.equal(ctx.voiceQueue[0].text,'subscriber');
 ctx.add({text:'moderator',isModerator:true});
 assert.equal(ctx.voiceQueue[0].text,'moderator');
 ctx.add({text:'streamer',isBroadcaster:true});
 assert.equal(ctx.voiceQueue[0].text,'streamer');
});
test('Normal messages cannot interrupt an owner or moderator pending message',()=>{
 const {ctx}=createReader();
 assert.equal(ctx.add({text:'mod',isModerator:true}),true);
 assert.equal(ctx.add({text:'viewer'}),false);
 assert.equal(ctx.voiceQueue.length,1);
 assert.equal(ctx.voiceQueue[0].text,'mod');
});
test('The next message of the same priority replaces an older pending comment',()=>{
 const {ctx}=createReader();
 ctx.add({text:'mod1',isModerator:true});
 ctx.add({text:'mod2',isModerator:true});
 assert.equal(ctx.voiceQueue[0].text,'mod2');
});
test('Voice test can take precedence without creating a queue',()=>{
 const {ctx}=createReader();
 ctx.add({text:'owner',isBroadcaster:true});
 ctx.add({text:'test',__voiceTest:true});
 assert.equal(ctx.voiceQueue.length,1);
 assert.equal(ctx.voiceQueue[0].text,'test');
});
test('No-backlog mode never changes Fish natural playback or the five assigned voices',()=>{
 assert.match(html,/const VOICE_QUEUE_HARD_LIMIT = 1/);
 assert.match(html,/const VOICE_STALE_MS = 2500/);
 assert.match(html,/audio\.playbackRate = 1/);
 assert.match(html,/const FISH_VOICE_COUNT = 5/);
});
