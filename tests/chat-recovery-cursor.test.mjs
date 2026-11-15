import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const server=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
const proxy=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const start=html.indexOf('let chatHttpBootstrapped=false;');
const end=html.indexOf('setInterval(pollLiveChat,1500);',start);
assert.ok(start>0&&end>start,'HTTP polling must be present');
const code=html.slice(start,end);

test('chat retains a larger bounded history and forwards cursors through main server',()=>{
  assert.match(server,/CHAT_HISTORY_LIMIT = 3000/);
  assert.match(server,/_historyCursor:.*chatHistorySequence/);
  assert.match(server,/const found=after\?recentChatHistory\.findIndex/);
  assert.match(server,/more:start\+messages\.length<recentChatHistory\.length/);
  assert.match(proxy,/\/api\/live-messages'\+url\.search/);
});

test('HTTP recovery pages through 750 missing messages in order without duplicates',async()=>{
  const history=[];
  const seen=new Set(),shown=[],spoken=[],calls=[];
  const make=(n)=>({_historyId:'h-'+n,_historyCursor:'s.'+n,type:'chat',platform:n%2?'tiktok':'kick',text:'text'+n});
  history.push(make(1),make(2));
  const ctx={
    location:{port:'8787'},
    encodeURIComponent,
    status:()=>{},
    fetch:async path=>{
      calls.push(path);
      const query=new URL(path,'http://localhost').searchParams;
      const after=query.get('after')||'';
      const limit=Number(query.get('limit')||300);
      const index=after?history.findIndex(item=>item._historyCursor===after):-1;
      const begin=after?(index<0?0:index+1):Math.max(0,history.length-limit);
      const messages=history.slice(begin,begin+limit);
      return {ok:true,json:async()=>({
        messages,cursor:messages.at(-1)?._historyCursor||after,
        more:begin+messages.length<history.length,
        gap:!!after&&index<0
      })};
    },
    addMessage:item=>{
      if(seen.has(item._historyId))return false;
      seen.add(item._historyId);shown.push(item._historyId);return true;
    },
    queueVoice:item=>spoken.push(item._historyId)
  };
  runInNewContext(code+'\nthis.poll=pollLiveChat',ctx);
  await ctx.poll();
  assert.deepEqual(shown,['h-1','h-2']);
  assert.deepEqual(spoken,[],'Old messages are never read aloud on initial load');
  for(let i=3;i<=752;i++)history.push(make(i));
  await ctx.poll();
  assert.equal(shown.length,752);
  assert.equal(spoken.length,750);
  assert.deepEqual(shown.slice(-3),['h-750','h-751','h-752']);
  assert.ok(calls.length>=4,'Recovery must page when 300 is not enough');
  await ctx.poll();
  assert.equal(shown.length,752,'Repeated polling never duplicates messages');
  assert.equal(spoken.length,750,'Repeated polling never duplicates speech');
});

test('HTTP polling does not overlap while a request is in flight',async()=>{
  let release;
  const pending=new Promise(resolve=>{release=resolve});
  let requests=0;
  const ctx={
    location:{port:'8787'},encodeURIComponent,
    status:()=>{},
    fetch:async()=>{requests++;await pending;return {ok:true,json:async()=>({messages:[],cursor:'',more:false})}},
    addMessage:()=>true,queueVoice:()=>{}
  };
  runInNewContext(code+'\nthis.poll=pollLiveChat',ctx);
  const first=ctx.poll();
  await ctx.poll();
  assert.equal(requests,1);
  release();
  await first;
  await ctx.poll();
  assert.equal(requests,2);
});
