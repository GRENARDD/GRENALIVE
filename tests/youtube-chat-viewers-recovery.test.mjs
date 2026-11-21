import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {YouTubeLiveReader} from '../youtube-live.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
test('YouTube: missing/empty/null concurrentViewers are not fabricated as zero',async()=>{
  const readings=[];
  const reader=new YouTubeLiveReader({apiKey:'',requestProxy:async()=>({}),onViewers:n=>readings.push(n)});
  reader.running=true;reader.videoId='abcdefghijk';
  for(const [data,expected] of [
    [{items:[{liveStreamingDetails:{concurrentViewers:null}}]},null],
    [{items:[{liveStreamingDetails:{concurrentViewers:''}}]},null],
    [{items:[{liveStreamingDetails:{}}]},null],
    [{items:[]},null],
    [{items:[{liveStreamingDetails:{concurrentViewers:'not reported'}}]},null],
    [{items:[{liveStreamingDetails:{concurrentViewers:'0'}}]},0],
    [{items:[{liveStreamingDetails:{concurrentViewers:'19'}}]},19]
  ]){
    reader.requestProxy=async()=>data;
    await reader.refreshViewers();
    assert.equal(readings.at(-1),expected);
  }
  await reader.stop();
});
test('YouTube: active broadcast without chat repeats discovery',async()=>{
  const state=[];
  const reader=new YouTubeLiveReader({apiKey:'',requestProxy:async()=>({
    items:[{id:'abcdefghijk',liveStreamingDetails:{}}]}),
    onStatus:s=>state.push(s)
  });
  reader.running=true;reader.videoId='abcdefghijk';
  const scheduled=[];
  reader.scheduleDiscovery=ms=>scheduled.push(ms);
  await reader.discoverChat();
  assert.deepEqual(scheduled,[30000]);
  assert.equal(state.at(-1).waiting,true);
  await reader.stop();
});
test('YouTube: permission denied on gRPC switches to official REST chat',async()=>{
  let onError,delay=0;
  const reader=new YouTubeLiveReader({apiKey:'',getStreamToken:async()=> 'temporary-token',
    streamFactory:options=>{onError=options.onError;return{cancel(){}}},
    requestProxy:async()=>({})});
  reader.running=true;reader.videoId='abcdefghijk';reader.chatId='liveChatId';
  reader.schedulePoll=ms=>{delay=ms};
  await reader.beginStream();
  onError({code:7,message:'PERMISSION_DENIED'});
  assert.equal(reader.streamDisabled,true);
  assert.equal(delay,30000);
  await reader.stop();
});
test('YouTube: repeated gRPC stream errors fall back rather than retry forever',async()=>{
  const streamCallbacks=[];
  const reader=new YouTubeLiveReader({apiKey:'',getStreamToken:async()=> 'temporary-token',
    streamFactory:options=>{streamCallbacks.push(options);return{cancel(){}}},
    requestProxy:async()=>({})});
  reader.running=true;reader.videoId='abcdefghijk';reader.chatId='liveChatId';
  const streamDelays=[],pollDelays=[];
  reader.scheduleStream=ms=>streamDelays.push(ms);
  reader.schedulePoll=ms=>pollDelays.push(ms);
  await reader.beginStream();
  streamCallbacks.at(-1).onError({code:14,message:'temporary UNAVAILABLE'});
  assert.equal(reader.streamDisabled,false);
  assert.equal(streamDelays.length,1);
  await reader.beginStream();
  streamCallbacks.at(-1).onError({code:14,message:'temporary UNAVAILABLE'});
  assert.equal(reader.streamDisabled,true);
  assert.deepEqual(pollDelays,[30000]);
  await reader.stop();
});
test('YouTube: ended liveChatId triggers rediscovery, not permanent polling',async()=>{
  const reader=new YouTubeLiveReader({apiKey:'',requestProxy:async()=>{throw Error('liveChatEnded')}});
  reader.running=true;reader.videoId='abcdefghijk';reader.chatId='oldChatId';reader.nextPageToken='oldPageToken';
  const discovery=[];
  reader.scheduleDiscovery=ms=>discovery.push(ms);
  await reader.poll();
  assert.equal(reader.chatId,'');
  assert.equal(reader.nextPageToken,'');
  assert.deepEqual(discovery,[30000]);
  await reader.stop();
});
test('YouTube: stale pageToken resets before the next chat poll',async()=>{
  const reader=new YouTubeLiveReader({apiKey:'',requestProxy:async()=>{throw Error('invalidPageToken')}});
  reader.running=true;reader.videoId='abcdefghijk';reader.chatId='liveChatId';reader.nextPageToken='stale';
  const delays=[];reader.schedulePoll=ms=>delays.push(ms);
  await reader.poll();
  assert.equal(reader.nextPageToken,'');
  assert.deepEqual(delays,[30000]);
  await reader.stop();
});
test('YouTube: diagnostic endpoint reports chat and audience separately without secrets',()=>{
  const server=readFileSync(join(root,'server.mjs'),'utf8');
  const endpoint=server.split("if(pathname==='/api/youtube/diagnostic'")[1]?.split("if(pathname==='/api/obs-token'")[0];
  assert.ok(endpoint);
  assert.match(endpoint,/chatConnected:!!bridgeRuntime.youtube/);
  assert.match(endpoint,/viewerAvailable:viewerMeta.youtube/);
  assert.match(endpoint,/viewerSource:String/);
  assert.doesNotMatch(endpoint,/access_token|refresh_token|apiKey:/);
});
