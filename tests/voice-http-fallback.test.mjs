import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const start=source.indexOf('let chatHttpBootstrapped=false;');
const end=source.indexOf('setInterval(pollLiveChat,1500);',start);
assert.ok(start>0 && end>start,'Missing HTTP fallback');
const pollCode=source.slice(start,end);

test('HTTP fallback speaks new messages once but never replays the old history',async()=>{
 const seen=new Set(),spoken=[],shown=[];
 let messages=[{type:'chat',_historyId:'old-1',text:'old'}];
 const ctx={
  location:{port:'8787'},
  fetch:async()=>({ok:true,json:async()=>({messages})}),
  addMessage:item=>{if(seen.has(item._historyId))return false;seen.add(item._historyId);shown.push(item.text);return true;},
  queueVoice:item=>spoken.push(item.text)
 };
 runInNewContext(pollCode+'\nthis.poll=pollLiveChat',ctx);
 await ctx.poll();
 assert.deepEqual(spoken,[],'Never synthesize history on initial poll');
 assert.deepEqual(shown,['old']);
 messages=[...messages,{type:'chat',_historyId:'new-2',text:'new'}];
 await ctx.poll();
 assert.deepEqual(spoken,['new']);
 await ctx.poll();
 assert.deepEqual(spoken,['new'],'Polling the same history cannot charge Fish twice');
 // Simulate WS arriving first; the HTTP fallback must not speak it again.
 seen.add('ws-3');
 messages.push({type:'chat',_historyId:'ws-3',text:'from websocket'});
 await ctx.poll();
 assert.deepEqual(spoken,['new']);
});

test('WS and HTTP share dedupe before speaking into Fish Audio',()=>{
 assert.match(source,/const isNewLiveChat = addMessage\(m\);/);
 assert.match(source,/if\(isNewLiveChat\) queueVoice\(m\);/);
 assert.match(source,/if\(id\)\{if\(receivedChatIds\.has\(id\)\)return false;/);
 assert.match(source,/if\(bootstrapped && item\._historyId && isNewLiveChat\) queueVoice\(item\);/);
});