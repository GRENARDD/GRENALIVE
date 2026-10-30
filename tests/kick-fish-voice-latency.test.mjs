import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
const portion=(begin,end)=>{
 const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
 assert.ok(a>=0&&b>a,'Cannot locate '+begin);
 return source.slice(a,b);
};
const kickSource=portion('async function deliverKickChat(msg){','function consumeKickRealtimeFrame(payload){');

test('Kick chat is forwarded to Multichat before the optional avatar lookup finishes',async()=>{
 let resolveAvatar;
 const published=[];
 const env={
   kickSeenMessages:new Map(),kickUsers:new Map(),kickMetaCache:new Map(),
   kickLastChatAt:0,currentKickChannel:'grena-rd',activeProfileId:'owner',
   kickChatUserMeta:()=>new Promise(resolve=>{resolveAvatar=resolve}),
   findUrl:(...values)=>values.find(v=>typeof v==='string'&&/^https:\/\//.test(v))||'',
   broadcastPlatform:(p,m)=>published.push({p,m})
 };
 runInNewContext(kickSource+'\nthis.deliverKickChat=deliverKickChat',env);
 const delivered=await env.deliverKickChat({user:'viewer',text:'hola',userId:'123'});
 assert.equal(delivered,true);
 assert.equal(published.length,1);
 assert.equal(published[0].m.text,'hola');
 assert.equal(published[0].m.avatar,'');
 assert.equal(typeof resolveAvatar,'function');
 resolveAvatar({avatar:'https://kick.com/photo.jpg'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(env.kickUsers.get('viewer').avatar,'https://kick.com/photo.jpg');
});
test('Kick must not attach late avatars to another active GREÑA ID',async()=>{
 let resolveAvatar;
 const env={
   kickSeenMessages:new Map(),kickUsers:new Map(),kickMetaCache:new Map(),
   kickLastChatAt:0,currentKickChannel:'grena-rd',activeProfileId:'owner',
   kickChatUserMeta:()=>new Promise(resolve=>{resolveAvatar=resolve}),
   findUrl:(...values)=>values.find(v=>typeof v==='string'&&/^https:\/\//.test(v))||'',
   broadcastPlatform:()=>{}
 };
 runInNewContext(kickSource+'\nthis.deliverKickChat=deliverKickChat',env);
 await env.deliverKickChat({user:'viewer',text:'hola',userId:'123'});
 env.activeProfileId='friend';
 resolveAvatar({avatar:'https://kick.com/private.jpg'});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(env.kickUsers.get('viewer').avatar,'');
});
const credentialSource=portion('const FISH_CREDENTIAL_CACHE_MS=15000;','let fishRoundRobin = 0;');
const context=(api='x'.repeat(32))=>{
 let calls=0;
 const env={
   activeProfileId:'owner',fishProfileAccount:null,MAIN_ORIGIN:'http://127.0.0.1:8787',
   BRIDGE_TOKEN:'test-bridge',AbortSignal,
   fetch:async()=>{
     calls++;
     return {ok:true,json:async()=>({ok:true,apiKey:api})};
   },
   reconcileOwnerFishAccounts:()=>[]
 };
 runInNewContext(credentialSource+'\nthis.pool=fishPoolForProfile;this.clearCache=clearFishCredentialCache',env);
 return {env,calls:()=>calls};
};
test('Fish Audio asks Cloudflare only once for sequential comments within 15s',async()=>{
 const {env,calls}=context();
 const first=await env.pool('owner');
 const second=await env.pool('owner');
 assert.equal(calls(),1);
 assert.equal(first.accounts.length,1);
 assert.equal(first.accounts[0],second.accounts[0]);
 assert.equal(first.accounts[0].key,'x'.repeat(32));
});
test('Fish Audio never shares cached credentials with another GREÑA ID',async()=>{
 const {env,calls}=context();
 await env.pool('owner');
 env.activeProfileId='different';
 assert.equal((await env.pool('owner')).accounts.length,0);
 env.clearCache();
 assert.equal((await env.pool('different')).accounts.length,1);
 assert.equal(calls(),2);
});
test('Fish Audio preserves original provider format and does not pitch-shift voices',()=>{
 assert.match(source,/body:JSON\.stringify\(\{text:naturalSpeech\.text,reference_id:referenceId,format:'mp3'\}\)/);
 const chat=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
 assert.match(chat,/audio\.playbackRate = 1/);
});

test('Fish audio cache is bounded, expires, and separates profile and credential fingerprints',()=>{
 const server=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
 const cacheSource=portion('const FISH_AUDIO_CACHE_TTL_MS=90000;','const FISH_CREDENTIAL_CACHE_MS=15000;');
 const ctx={Buffer,Map,Date};
 runInNewContext(cacheSource+'\\nthis.get=fishAudioCacheGet;this.put=fishAudioCachePut;this.cache=fishAudioCache',ctx);
 ctx.put('profile-a-key1-model-text',Buffer.from('audio-a'));
 assert.equal(ctx.get('profile-a-key1-model-text').toString(),'audio-a');
 assert.equal(ctx.get('profile-b-key1-model-text'),null);
 assert.equal(ctx.get('profile-a-key2-model-text'),null);
 assert.match(server,/activeProfileId,\\s*fishContext\\.accounts\\.map\\(a=>a\\.key\\)\\.sort\\(\\)/);
 assert.match(server,/fishAudioCacheGet\\(fishCacheKey\\)/);
 assert.match(server,/fishAudioCachePut\\(fishCacheKey,audio\\)/);
 for(let i=0;i<60;i++)ctx.put('unique-'+i,Buffer.from('a'));
 assert.ok(ctx.cache.size<=48);
});
