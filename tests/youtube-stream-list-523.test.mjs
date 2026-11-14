import test from 'node:test';
import assert from 'node:assert/strict';
import {YouTubeLiveReader,normalizeYouTubeMessage} from '../youtube-live.mjs';
import {normalizeGrpcLiveChatItem} from '../youtube-live-stream.mjs';
import {readFileSync} from 'node:fs';

const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function example(id,type,details={}){
 return {id,authorDetails:{displayName:'Fan',channelId:'UC123'},
  snippet:{type,publishedAt:'2026-11-14T10:00:00Z',...details}};
}
test('streamList gRPC response is mapped to the existing YouTube alert schema',()=>{
 const mapped=normalizeGrpcLiveChatItem(example('x1','SUPER_CHAT_EVENT',{
  superChatDetails:{amountMicros:'2500000',amountDisplayString:'$2.50',currency:'USD',userComment:'saludos'}
 }));
 assert.equal(mapped.snippet.type,'superChatEvent');
 const normalized=normalizeYouTubeMessage(mapped);
 assert.equal(normalized.kind,'superchat');
 assert.equal(normalized.amount,2.5);
 assert.equal(normalized.message,'saludos');
 const gift=normalizeGrpcLiveChatItem(example('j1','GIFT_EVENT',{giftDetails:{comboCount:4,giftName:'Jewels'}}));
 assert.equal(normalizeYouTubeMessage(gift).count,4);
});
test('continuous streams preserve independent message IDs, suppress historic payments and resume from cursor',async()=>{
 const seen=[],opened=[];
 const reader=new YouTubeLiveReader({
  apiKey:'',requestProxy:async(resource)=>({
   items:[{id:'abcdefghijk',liveStreamingDetails:{activeLiveChatId:'CHAT_A'}}]
  }),
  getStreamToken:async()=> 'TEST_TOKEN',
  streamFactory:({pageToken,onBatch,onError,onEnd})=>{
   const obj={pageToken,onBatch,onError,onEnd,cancel(){}};
   opened.push(obj);
   return obj;
  },
  onMessage:m=>seen.push(m)
 });
 await reader.start('abcdefghijk');
 // Let the asynchronous token/stream setup finish.
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(opened.length,1);
 assert.equal(opened[0].pageToken,'');
 opened[0].onBatch({items:[normalizeGrpcLiveChatItem(example('old','SUPER_CHAT_EVENT',{superChatDetails:{amountMicros:'1000000'}}))],nextPageToken:'cursor1'});
 assert.equal(seen.length,0,'old monetization is not played when joining');
 opened[0].onBatch({items:[
  normalizeGrpcLiveChatItem(example('chat','TEXT_MESSAGE_EVENT',{textMessageDetails:{messageText:'hola'}})),
  normalizeGrpcLiveChatItem(example('new','SUPER_CHAT_EVENT',{superChatDetails:{amountMicros:'3000000'}}))
 ],nextPageToken:'cursor2'});
 assert.deepEqual(seen.map(x=>x.kind),['chat','superchat']);
 opened[0].onBatch({items:[normalizeGrpcLiveChatItem(example('new','SUPER_CHAT_EVENT'))],nextPageToken:'cursor3'});
 assert.equal(seen.length,2,'same paid message is not replayed');
 assert.equal(reader.nextPageToken,'cursor3');
 await reader.stop();
});
test('REST fallback observes quota and never polls faster than 30 seconds',()=>{
 const src=file('youtube-live.mjs');
 assert.match(src,/Math\.max\(30000,Number\(data\.pollingIntervalMillis\)\|\|45000\)/);
 assert.match(src,/isQuota\?300000/);
 assert.match(src,/scheduleStream\(10000\)/);
});
test('disconnecting YouTube removes the OAuth session and tells chat-server to stop',()=>{
 const s=file('server.mjs');
 assert.match(s,/\['tiktok','twitch','kick','youtube','starvios'\]\.includes\(p\)/);
 assert.match(s,/if\(p==='youtube'\)setViewers\('youtube',0/);
 assert.match(s,/resource==='session'/);
});
