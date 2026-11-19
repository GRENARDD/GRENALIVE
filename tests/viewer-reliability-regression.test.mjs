import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const chat=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');

test('Twitch IRC disconnect does not reset viewer count',()=>{
 const start=chat.indexOf("client.on(\n    'disconnected'");
 assert.ok(start>=0,'Twitch disconnect handler exists');
 const end=chat.indexOf("bridgeStatus('twitch',false",start);
 assert.ok(end>start,'Twitch disconnect emits status');
 assert.doesNotMatch(chat.slice(start,end),/bridgeViewers\('twitch',0\)/);
});

test('Twitch counter keeps retrying after a failed initial request',()=>{
 const body=server.split('async function connectCounterTwitch(input){')[1].split('// TikTok: Login Kit')[0];
 assert.match(body,/counterTwitchTimer=setInterval/);
 assert.match(body,/const ready=await refreshCounterTwitch\(\)/);
 assert.doesNotMatch(body,/catch\(e\)\{[\s\S]*counterTwitchLogin=''/);
});

test('Missing YouTube viewer statistics are not cast to zero',()=>{
 assert.match(chat,/count:count===null\?null:/);
 assert.match(chat,/if\(!known\.length\)\{bridgeViewers\('youtube',null/);
 assert.match(server,/if\(body\.count===null&&\(body\.platform==='youtube'/);
 assert.match(server,/viewerMeta\[body\.platform\]\.available=false/);
});

test('Real zero stays distinguishable from unavailable',()=>{
 assert.match(server,/if\(platform==='youtube'\|\|platform==='twitch'\)meta\.available=true/);
 assert.match(chat,/known\.reduce\(\(total,id\)=>total\+youtubeViewers\.get\(id\),0\)/);
});
