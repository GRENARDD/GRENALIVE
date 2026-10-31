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


test('Timeline Premium 2.0 uses true segmented star rail and coherent FLIP animations',()=>{
  assert.match(overlay,/tl-seg tl-sa/);
  assert.match(overlay,/tl-seg tl-sb/);
  assert.match(overlay,/tl-rail-dot/);
  assert.match(overlay,/--tl-cap-width,300px/);
  assert.match(overlay,/--tl-star-y/);
  assert.match(overlay,/timelineCaptureBeforeInsert\(\)/);
  assert.match(overlay,/timelineAnimateInserted\(el\)/);
  assert.match(overlay,/a\.id='timeline-shift'/);
  assert.match(overlay,/requestAnimationFrame\(/);
  assert.match(overlay,/for\(const line of main\?\.querySelectorAll\('\.tl-seg'\)\|\|\[\]\)/);
  assert.match(chat,/static-cdn\.jtvnw\.net\/emoticons\/v2/);
});

test('Timeline native Twitch emotes render as images without executing raw HTML',()=>{
  const start=overlay.indexOf('function renderTimeline(');
  const end=overlay.indexOf('/* Timeline FLIP:',start);
  assert.ok(start>=0&&end>start);
  function node(tag){
    const el={tag,children:[],attrs:{},style:{setProperty(k,v){this[k]=v}},
      classList:{classes:[],add(v){this.classes.push(v)}},
      setAttribute(k,v){this.attrs[k]=v},append(...args){this.children.push(...args)}};
    Object.defineProperty(el,'childNodes',{get(){return this.children}});
    return el;
  }
  const document={createElement:node,createElementNS:(_ns,tag)=>node(tag),
    createTextNode:value=>({tag:'#text',value})};
  const render=vm.runInNewContext(overlay.slice(start,end)+';renderTimeline',{
    document,cfg:{showPlatform:true,gap:8},CHAT_HTTP:'http://127.0.0.1:8788',OBS_SUFFIX:''
  });
  const root=node('div');
  render(root,{platform:'twitch',text:'Hi Kappa <script>x</script>',emotes:[
    {start:3,end:7,url:'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0'}
  ]},'STREAM FAN');
  const main=root.children[0],rail=main.children[0],body=main.children[3];
  assert.equal(rail.children.length,3,'expected upper, lower and dot segments');
  assert.ok(body.children.some(x=>x.tag==='img'&&decodeURIComponent(x.src).includes('emoticons/v2/25')));
  assert.ok(body.children.some(x=>x.tag==='#text'&&x.value.includes('<script>')),'untrusted text remains a text node');
});
