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
 assert.match(chat,/type:'event',videoId,event,eventKind:m\.kind/);
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
