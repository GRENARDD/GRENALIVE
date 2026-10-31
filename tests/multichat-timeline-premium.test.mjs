import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const overlay=read('multichat-overlay.html');
const widgets=read('widgets.html');
const chat=read('chat-server.mjs');

test('Timeline Premium is selectable and persisted without changing default theme',()=>{
  assert.match(widgets,/<option value="timeline">✦ Timeline Premium/);
  assert.match(widgets,/\['clean','blossom','comicpop','timeline'\]\.includes\(v\.theme\)/);
  assert.match(chat,/\['clean','blossom','comicpop','timeline'\]\.includes\(v\)\?v:'clean'/);
  assert.match(overlay,/\['clean','blossom','comicpop','timeline'\]\.includes\(v\)\?v:'clean'/);
  assert.match(overlay,/showPlatform:true,theme:'clean'/);
  assert.match(overlay,/renderTimeline\(el,d,nickname\)/);
  assert.match(overlay,/previousTheme==='timeline'\|\|nextTheme==='timeline'/);
  assert.match(overlay,/const CHAT_WS=/);
  assert.match(overlay,/background:transparent!important/);
});

test('inline multichat script remains valid JavaScript',()=>{
  const script=overlay.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new vm.Script(script));
});

test('Timeline renderer respects role, escapes text and displays emotes and badges',()=>{
  const start=overlay.indexOf('function renderTimeline(');
  const end=overlay.indexOf('function add(d){',start);
  assert.ok(start>=0&&end>start);
  function node(tag){
    const el={tag,children:[],attrs:{},style:{setProperty(k,v){this[k]=v}},
      classList:{classes:[],add(v){this.classes.push(v)}},
      setAttribute(k,v){this.attrs[k]=v},
      append(...args){this.children.push(...args)}};
    Object.defineProperty(el,'childNodes',{get(){return this.children}});
    return el;
  }
  const document={
    createElement:node,createElementNS:(_ns,tag)=>node(tag),
    createTextNode:value=>({tag:'#text',value})
  };
  const render=vm.runInNewContext(overlay.slice(start,end)+';renderTimeline',{
    document,cfg:{showPlatform:true},CHAT_HTTP:'http://127.0.0.1:8788',OBS_SUFFIX:''
  });
  const root=node('div');
  render(root,{
    platform:'twitch',isModerator:true,
    text:'Hola :wave: <script>alert(1)</script>',
    emotes:[{code:':wave:',url:'https://cdn.example.com/wave.png'}],
    badges:[{emoji:'🔥'}]
  },'MODERADOR');
  const main=root.children[0];
  assert.match(main.className,/tl-mod/);
  const header=main.children[2],body=main.children[3];
  assert.equal(header.children[0].children[1].textContent,'MODERADOR');
  assert.equal(header.children[1].children[0].textContent,'🔥');
  assert.ok(body.children.some(el=>el.tag==='img'&&el.src.includes('wave.png')));
  assert.ok(body.children.some(el=>el.tag==='#text'&&el.value.includes('<script>')),'render user text as text nodes');
  assert.equal(main.style['--tl-platform'],'#9146ff');
  const owner=node('div');
  render(owner,{platform:'kick',isBroadcaster:true,text:'streamer'},'OWNER');
  assert.match(owner.children[0].className,/tl-owner/);
  assert.equal(owner.children[0].children[2].children[1].children[0].textContent,'👑');
});
