import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../grena-v4-live.js',import.meta.url),'utf8');

test('linking a TikTok LIVE re-enables the chat reader after resetting its old session',()=>{
 const route=main.split("if(pathname==='/api/tiktok/live-link'&&req.method==='POST'){")[1]?.split("if(pathname==='/api/easy-connect'")[0];
 assert.ok(route,'TikTok LIVE linking route must exist');
 assert.match(route,/await disconnectChatPlatform\('tiktok'\)/);
 assert.match(route,/await ensureLinkedChatReader\('tiktok',target\.url,\{force:true\}\)/);
 assert.ok(route.indexOf("disconnectChatPlatform('tiktok')")<route.indexOf("ensureLinkedChatReader('tiktok'"),'reconnect must follow old transport teardown');
});

test('the Twitch and Kick counters also initialize their chat readers',()=>{
 assert.match(main,/function startKickPolling\(\).*ensureLinkedChatReader\('kick'/);
 assert.match(main,/async function startTwitch\(token\).*ensureLinkedChatReader\('twitch'/);
 assert.match(main,/if\(savedAuth\.tiktok\?\.mode==='live-link'\)void ensureLinkedChatReader\('tiktok',value\)/);
});

test('chat sync never blindly overrides a previously disabled saved reader',()=>{
 assert.match(main,/prefs\.autoConnect===false\|\|\(prefs\[p\+'Url'\]&&prefs\[p\+'Enabled'\]===false\)/);
 assert.match(main,/if\(ownerAtStart!==activeUserId\)return false/);
 assert.match(main,/if\(attempt<2\)/);
});

test('V4 warns about a dead chat engine and does not portray an unavailable Twitch or YouTube count as zero',()=>{
 assert.match(dashboard,/persistent\.chatFailures===3/);
 assert.match(dashboard,/El motor de chat no responde/);
 assert.match(dashboard,/persistent\.viewerMeta=v\.meta\|\|\{\}/);
 assert.match(dashboard,/unknown\?'—':fmt\(count\)/);
});
