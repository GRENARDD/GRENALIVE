import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');

test('Chat bridge disconnect cannot zero Twitch or YouTube viewers',()=>{
 const block=server.split("if(!body.connected){")[1]?.split("pushEventHealth();return json")[0];
 assert.ok(block,'status bridge handler exists');
 assert.match(block,/p==='twitch'\|\|p==='youtube'/);
 assert.match(block,/setStatus\(p,false,label\|\|'Chat desconectado/);
 assert.ok(block.indexOf("p==='twitch'||p==='youtube'")<block.indexOf("setViewers(p,0,'desconectado por bridge')"));
});

test('OBS uses recent official Twitch and YouTube audience readings regardless of chat status',()=>{
 const block=server.split('function activeWidgetPlatforms(){')[1]?.split('function pushViewers()')[0];
 assert.ok(block);
 assert.match(block,/p==='twitch'\|\|p==='youtube'/);
 assert.match(block,/m\?\.available!==false&&fresh/);
 assert.match(block,/Date\.now\(\)-Number\(m\.lastGoodAt\)<90000/);
 assert.match(block,/Twitch Helix/);
 assert.match(block,/YouTube LIVE/);
});

test('Unavailable YouTube API reads eventually expire rather than pinning a stale audience count',()=>{
 assert.match(bridge,/const youtubeViewerReadAt=new Map\(\)/);
 assert.match(bridge,/Date\.now\(\)-Number\(youtubeViewerReadAt\.get\(id\)\|\|0\)<90000/);
 assert.match(bridge,/youtubeViewerReadAt\.set\(videoId,Date\.now\(\)\)/);
 assert.match(bridge,/youtubeViewerReadAt\.delete\(videoId\)/);
 assert.match(bridge,/youtubeViewerReadAt\.clear\(\)/);
});