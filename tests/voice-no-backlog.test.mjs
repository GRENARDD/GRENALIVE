import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const start=html.indexOf('function voicePriority(message = {}){');
const stop=html.indexOf('function updateVoiceLanguageChoices()',start);
assert.ok(start>=0&&stop>start,'Priority voice queue functions missing');

const userKey=m=>(String(m.platform||'tiktok').toLowerCase()+':'+
  (m.userId?'id:'+String(m.userId).toLowerCase():'user:'+String(m.user||m.nickname||'anonimo').toLowerCase()));
function createReader(){
  const dropped=[];
  const ctx={
    voiceQueue:[],voiceDroppedOverload:0,
    VOICE_QUEUE_HARD_LIMIT:16,VOICE_STALE_MS:15000,
    voiceUserRateKey:userKey,
    cleanupFishPreparedMessage:(msg,abort)=>dropped.push({name:msg.text,abort}),
    Date
  };
  runInNewContext(html.slice(start,stop)+
    '\nthis.add=insertVoiceByPriority;this.priority=voicePriority;this.retry=requeueFreshFishMessage;',ctx);
  return {ctx,dropped};
}

test('400 simultaneous chat messages keep a bounded queue, preserving early turns',()=>{
  const {ctx}=createReader();
  for(let i=0;i<400;i++){
    ctx.add({text:'msg'+i,user:'viewer'+i});
    assert.ok(ctx.voiceQueue.length<=16);
  }
  assert.equal(ctx.voiceQueue.length,16);
  assert.deepEqual(Array.from(ctx.voiceQueue,m=>m.text),Array.from({length:16},(_,i)=>'msg'+i));
  assert.equal(ctx.voiceDroppedOverload,384);
});

test('FIFO within each rank, owner > moderator > subscriber/follower > regular',()=>{
  const {ctx}=createReader();
  for(const m of [
    {user:'normal1',text:'normal1'},
    {user:'normal2',text:'normal2'},
    {user:'subscriber1',text:'subscriber1',isSubscriber:true},
    {user:'follower1',text:'follower1',isFollower:true},
    {user:'mod1',text:'mod1',isModerator:true},
    {user:'owner1',text:'owner1',isBroadcaster:true},
    {user:'mod2',text:'mod2',isModerator:true}
  ])assert.equal(ctx.add(m),true);
  assert.deepEqual(Array.from(ctx.voiceQueue,m=>m.text),
    ['owner1','mod1','mod2','subscriber1','follower1','normal1','normal2']);
});

test('A viewer cannot occupy multiple waiting slots; accounts on different platforms remain separate',()=>{
  const {ctx}=createReader();
  assert.equal(ctx.add({platform:'tiktok',user:'carlos',text:'hola'}),true);
  assert.equal(ctx.add({platform:'tiktok',user:'carlos',text:'segundo'}),false);
  assert.equal(ctx.add({platform:'twitch',user:'carlos',text:'hola desde Twitch'}),true);
  assert.equal(ctx.voiceQueue.length,2);
});

test('At capacity, a high rank replaces the oldest lowest rank, not a moderator',()=>{
  const {ctx,dropped}=createReader();
  ctx.add({text:'mod',user:'mod',isModerator:true});
  for(let i=0;i<15;i++)ctx.add({text:'viewer'+i,user:'viewer'+i});
  assert.equal(ctx.voiceQueue.length,16);
  assert.equal(ctx.add({text:'late viewer',user:'late'}),false);
  assert.equal(ctx.add({text:'owner',user:'owner',isBroadcaster:true}),true);
  assert.equal(ctx.voiceQueue.length,16);
  assert.equal(ctx.voiceQueue[0].text,'owner');
  assert.equal(ctx.voiceQueue[1].text,'mod');
  assert.ok(!ctx.voiceQueue.some(m=>m.text==='viewer0'));
  assert.ok(dropped.some(m=>m.name==='viewer0'&&m.abort));
});

test('Fish retries preserve original timestamp and do not displace newer same-user messages',()=>{
  const {ctx}=createReader();
  const msg={text:'original',user:'a'};
  ctx.add(msg);
  const queuedAt=msg.__voiceQueuedAt;
  ctx.voiceQueue.shift();
  ctx.add({text:'other',user:'b',isModerator:true});
  assert.equal(ctx.retry(msg),true);
  assert.equal(msg.__voiceQueuedAt,queuedAt);
  assert.equal(ctx.voiceQueue[1].text,'original');
  ctx.add({text:'newer',user:'c'});
  const old={text:'older same user',user:'c',__voiceQueuedAt:Date.now()-1000};
  assert.equal(ctx.retry(old),false);
  assert.equal(ctx.retry({...msg,user:'stale',__voiceQueuedAt:Date.now()-16000}),false);
});

test('Per-user cooldown is 7 seconds and rejected checks cannot reset it',()=>{
  const a=html.indexOf('function userVoiceRateLimited(m={}){');
  const b=html.indexOf('function dropStaleVoiceMessages()',a);
  assert.ok(a>=0&&b>a);
  let now=1000;
  const ctx={
    VOICE_USER_COOLDOWN_MS:7000,
    speaking:false,activeVoiceMessage:null,
    voiceUserLastQueuedAt:new Map(),
    voiceUserRateKey:userKey,
    Date:{now:()=>now}
  };
  runInNewContext(html.slice(a,b)+
    '\nthis.limited=userVoiceRateLimited;this.mark=markUserVoiceQueued;',ctx);
  const m={platform:'tiktok',user:'lucia'};
  const different={platform:'kick',user:'lucia'};
  assert.equal(ctx.limited(m),false);
  ctx.mark(m);
  assert.equal(ctx.limited(m),true);
  now=7999;
  assert.equal(ctx.limited(m),true);
  assert.equal(ctx.limited(m),true);
  assert.equal(ctx.limited(different),false);
  now=8000;
  assert.equal(ctx.limited(m),false);
  ctx.mark(m);
  assert.equal(ctx.limited(m),true);
  now=15000;
  assert.equal(ctx.limited(m),false);
});

test('The browser displays fresh chat before filtering for TTS, and HTTP restore deduplicates',()=>{
  assert.match(html,/const isNewLiveChat = addMessage\(m\);[\s\S]*?if\(isNewLiveChat\) queueVoice\(m\);/);
  assert.match(html,/const isNewLiveChat=addMessage\(item\);[\s\S]*?if\(bootstrapped && item\._historyId && isNewLiveChat\) queueVoice\(item\);/);
  assert.match(html,/const VOICE_QUEUE_HARD_LIMIT = 16;/);
  assert.match(html,/const VOICE_USER_COOLDOWN_MS = 7000;/);
  assert.match(html,/audio\.playbackRate = 1/);
  assert.match(html,/const FISH_VOICE_COUNT = 5/);
});

test('Fish credential warmup and per-account security stay intact',()=>{
  const server=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
  const main=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  assert.match(html,/function warmFishCredentials\(force = false\)/);
  assert.match(html,/fetch\('\/api\/fish-ready',\{cache:'no-store'\}\)/);
  assert.match(server,/url\.pathname === '\/api\/fish-ready'/);
  assert.match(server,/const FISH_LIVE_ACQUIRE_WAIT_MS = 1500;/);
  assert.match(main,/\/api\/fish-ready/);
  assert.doesNotMatch(server.slice(server.indexOf("if (url.pathname === '/api/fish-ready'"),server.indexOf("if (url.pathname === '/api/fish-tts'")) ,/apiKey|ownerKeys|accounts:\s*context\.accounts/);
});

test('Twitch chat no longer waits for a user avatar, Kick fallback dedupe is short',()=>{
  const server=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
  const twitchStart=server.indexOf("  client.on(\n    'message',");
  assert.ok(twitchStart>=0,'Twitch message handler must exist');
  const twitch=server.slice(twitchStart,twitchStart+4200);
  assert.doesNotMatch(twitch,/await twitchChatUserMeta\(userId\)/);
  assert.match(twitch,/void twitchChatUserMeta\(userId\)/);
  assert.doesNotMatch(twitch,/if \(self\) \{\s*return;/);
  assert.match(server,/sameText&&now-sameText\.at<1500/);
});
