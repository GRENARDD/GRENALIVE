import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const chat=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const avatar=readFileSync(new URL('../grena-avatar.js',import.meta.url),'utf8');
const cut=(s,a,b)=>{
 const begin=s.indexOf(a),end=s.indexOf(b,begin+a.length);
 assert.ok(begin>=0&&end>begin,'Missing snippet '+a);
 return s.slice(begin,end);
};
const networkCode=cut(chat,'function fishPrefetchConcurrency(){','const VOICE_GAP_MS =');
const readNetwork=connection=>{
 const ctx={navigator:{connection}};
 runInNewContext(networkCode+'\nthis.test=fishPrefetchConcurrency',ctx);
 return ctx.test();
};
test('Adaptive Fish prefetch reserves resources for the current audio on slow networks',()=>{
 assert.equal(readNetwork({effectiveType:'2g'}),1);
 assert.equal(readNetwork({effectiveType:'3g'}),1);
 assert.equal(readNetwork({rtt:600}),1);
 assert.equal(readNetwork({downlink:1.2}),1);
 assert.equal(readNetwork({saveData:true}),1);
 assert.equal(readNetwork({rtt:300}),2);
 assert.equal(readNetwork({downlink:2.5}),2);
 assert.equal(readNetwork({effectiveType:'4g',rtt:65,downlink:20}),3);
});
test('Fish prefetch prepares at most three requests from the first four queued messages',()=>{
 const source=cut(chat,'function pumpFishPrefetch(){','function updateFishControls(){');
 const messages=Array.from({length:7},(_,id)=>({text:String(id)}));
 const started=[];
 const ctx={
  voiceQueue:messages,fishPrefetchActive:0,FISH_PREFETCH_LIMIT:4,
  fishPrefetchConcurrency:()=>3,dropStaleVoiceMessages:()=>{},
  isFishVoiceSelected:()=>true,fishBlockedError:'',fishRetryAt:0,
  getConfiguredFishModels:()=>[{modelId:'fish-model'}],
  $:()=>({checked:true}),
  startFishPrefetch:message=>{
    message.__fishPreparePromise=Promise.resolve(null);
    started.push(message.text);ctx.fishPrefetchActive++;
  }
 };
 runInNewContext(source+'\nthis.pump=pumpFishPrefetch',ctx);
 ctx.pump();
 assert.deepEqual(started,['0','1','2']);
 ctx.pump();
 assert.deepEqual(started,['0','1','2']);
});
test('The existing five stable Fish voices and natural waveform stay unchanged',()=>{
 assert.match(chat,/const FISH_VOICE_COUNT = 5/);
 assert.match(chat,/audio\.playbackRate = 1/);
 assert.match(chat,/const FISH_PREFETCH_CONCURRENCY = 3/);
});
test('GREÑA ID name displays the same local profile-scoped picture as the main avatar',()=>{
 assert.match(index,/id="profileNamePhoto"/);
 assert.match(index,/id="profileName"/);
 assert.match(avatar,/inlinePhoto\.style\.backgroundImage=d/);
 assert.match(avatar,/key='grena-avatar:'\+d\.user\.id/);
 assert.match(avatar,/if\(d&&!OK\.test\(d\)\) d=null/);
});
