import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeYouTubeMessage} from '../youtube-live.mjs';

const chat=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('YouTube discovery returns every active broadcast instead of only the first',()=>{
 assert.match(server,/const lives=\(payload\.items\|\|\[\]\)/);
 assert.match(server,/live:lives\.length>0,videoId:lives\[0\]\?\.videoId\|\|'',lives/);
});
test('Both YouTube livestreams receive independent chat, events and viewer collection',()=>{
 assert.match(chat,/const youtubeReaders=new Map\(\)/);
 assert.match(chat,/const youtubeViewers=new Map\(\)/);
 assert.match(chat,/for\(const id of activeIds\)/);
 assert.match(chat,/youtubeReaders\.set\(videoId,reader\)/);
 assert.match(chat,/type:'chat',videoId,user:m\.user/);
 assert.match(chat,/broadcastPlatform\('youtube',\{type:'event',\.\.\.details\}\)/);
 assert.match(chat,/bridgeEventId:stableId/);
 assert.match(chat,/bridgeViewers\('youtube',known\.reduce/);
 assert.doesNotMatch(chat,/youtube:youtubeReader\.running/);
});
test('Super Chat and memberships are forwarded with real YouTube chat identifiers',()=>{
 const message=(id,type,details)=>normalizeYouTubeMessage({
  id,snippet:{type,publishedAt:'2026-11-14T12:00:00Z',...details},
  authorDetails:{channelId:'UC01234',displayName:'Fan prueba'}
 });
 const sc=message('SC1','superChatEvent',{superChatDetails:{amountMicros:'2500000',currency:'USD',amountDisplayString:'$2.50'}});
 assert.equal(sc.event,'gift');assert.equal(sc.kind,'superchat');assert.equal(sc.amount,2.5);
 const sticker=message('SS1','superStickerEvent',{superStickerDetails:{amountMicros:'1000000',currency:'USD'}});
 assert.equal(sticker.kind,'supersticker');
 const member=message('M1','newSponsorEvent',{newSponsorDetails:{memberLevelName:'Nivel 1'}});
 assert.equal(member.event,'sub');
 assert.match(server,/\['TikTok','Twitch','Kick','YouTube'\]\.includes\(platform\)/);
});

test('YouTube Chat Reader uses the owner OAuth proxy without an independent API key',async()=>{
 const {YouTubeLiveReader}=await import('../youtube-live.mjs');
 let called=0;
 const reader=new YouTubeLiveReader({apiKey:'',requestProxy:async(resource,params)=>{
  called++;
  assert.equal(resource,'videos');
  assert.equal(params.id,'abcdefghijk');
  return {items:[{id:'abcdefghijk',liveStreamingDetails:{concurrentViewers:'42'}}]};
 }});
 const result=await reader.request('videos',{id:'abcdefghijk'});
 assert.equal(result.items[0].liveStreamingDetails.concurrentViewers,'42');
 assert.equal(called,1);
 assert.match(chat,/requestProxy:async\(resource,params\)=>/);
 assert.match(server,/pathname==='\/api\/internal\/youtube\/data'/);
 assert.match(server,/if\(!requireInternalBridge\(req,res\)\)return/);
 assert.match(server,/Authorization:'Bearer '\+token/);
});

test('YouTube membership gifts, milestones and jewels are normalized for real alerts',()=>{
 const make=(id,type,details)=>normalizeYouTubeMessage({id,snippet:{type,...details},authorDetails:{channelId:'UC987',displayName:'Fan'}});
 const gifted=make('gifted','membershipGiftingEvent',{membershipGiftingDetails:{giftMembershipsCount:10}});
 assert.equal(gifted.kind,'membershipgift');
 assert.equal(gifted.count,10);
 assert.equal(gifted.event,'gift');
 const received=make('received','giftMembershipReceivedEvent',{});
 assert.equal(received.kind,'membershipreceived');
 assert.equal(received.event,'sub');
 const milestone=make('milestone','memberMilestoneChatEvent',{memberMilestoneChatDetails:{memberMonth:12,userComment:'Un año!'}});
 assert.equal(milestone.months,12);
 assert.equal(milestone.message,'Un año!');
 const jewel=make('jewel','giftEvent',{giftDetails:{giftName:'Celebración',comboCount:7,jewelsAmount:24}});
 assert.equal(jewel.kind,'jewelgift');
 assert.equal(jewel.count,7);
 assert.match(chat,/const comboRevision=kind==='jewelgift'/);
 assert.match(chat,/bridgeEventId:stableId/);
 assert.match(chat,/action:detail/);
});

test('Event health reports live YouTube chat events and true viewer source',()=>{
 assert.match(server,/youtube:\{account:ps\.youtube\?\.authenticated/);
 assert.match(server,/diagnostics:sig\('youtube'\),viewerSource:/);
 assert.match(chat,/bridgeViewers\('youtube',known\.reduce/);
});
