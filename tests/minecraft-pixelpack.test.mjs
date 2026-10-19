import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const get=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const mc=get('assets/afterglow-minecraft.js');
const css=get('assets/afterglow-minecraft.css');
const sound=get('assets/afterglow-minecraft-sound.js');
const live=get('afterglow-overlay.html');
const studio=get('afterglow-studio.html');
const originals=get('assets/afterglow-sound.js');
function parseInline(source){
 for(const tag of source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(tag[1].trim())new vm.Script(tag[1]);
 }
}
function engine(){
 const window={};
 vm.runInNewContext(mc,{window});
 return window.AfterglowMinecraft;
}
test('pixel characters, gifts and all six events are truly procedural sprites',()=>{
 const e=engine();
 assert.deepEqual(Array.from(e.events),['follow','gift','sub','raid','share','likes']);
 assert.match(e.sprite('player','diamond'),/shape-rendering="crispEdges"/);
 assert.match(e.sprite('rose','ruby'),/<rect /);
 assert.match(e.sprite('diamond','diamond'),/<rect /);
 assert.match(e.sprite('helmet','diamond'),/<rect /);
 for(const kind of e.events){
  const html=e.render(kind,{name:'GREÑA_RD',gift:'Sombrero',amount:12},
   {platform:'TikTok',accent:'#32ff91'});
  assert.match(html,new RegExp('mc-'+kind));
  assert.match(html,/GREÑA_RD/);
  assert.match(html,/mc-ground/);
  assert.match(html,/mc-xp-bar/);
  assert.match(html,/mc-particles/);
 }
});
test('real gift icons are pixelized at 24 by 24, safe for HTML and support animation',()=>{
 const e=engine();
 const html=e.render('gift',{name:'Greña',gift:'Rosa',amount:3},{giftSource:'https://images.example.com/rose.gif'});
 assert.match(html,/width="24" height="24"/);
 assert.match(html,/data-mc-src="https:\/\/images\.example\.com\/rose\.gif"/);
 assert.match(mc,/interval=setInterval\(draw,100\)/);
 assert.match(mc,/if\(!canvas\.isConnected\)/);
 assert.match(mc,/imageSmoothingEnabled=true/);
 assert.doesNotMatch(e.render('follow',{name:'<img src=x onerror=alert(1)>'}),/<img src=x/);
 assert.deepEqual(Array.from(e.giftType('Quiéreme')),['heart','ruby']);
 assert.deepEqual(Array.from(e.giftType('Sombrero')),['helmet','diamond']);
 assert.deepEqual(Array.from(e.giftType('Diamante')),['diamond','diamond']);
 assert.deepEqual(Array.from(e.giftType('Rosa')),['rose','ruby']);
});
test('a fully pixel font, block particles and both layout safe-zones',()=>{
 assert.match(css,/Pixelify\+Sans/);
 assert.match(css,/Press\+Start\+2P/);
 assert.match(css,/image-rendering:pixelated/);
 assert.match(css,/\.mc-scene\.outro/);
 assert.match(css,/\.live:not\(\.wide\)\[data-theme="minecraft"\] \.mc-scene/);
 assert.match(css,/\.live\.wide\[data-theme="minecraft"\] \.mc-item/);
 assert.match(css,/\.mc-gift \.mc-title/);
 assert.match(css,/\.mc-likes \.mc-item/);
});
test('six retro sound signatures have original eating, block, XP and pickup sounds',()=>{
 new vm.Script(sound);
 const source=String(sound);
 for(const ev of ['follow','gift','sub','raid','share','likes'])
  assert.match(source,new RegExp(ev+'\\(b,t\\)'));
 assert.match(source,/function crunch\(/);
 assert.match(source,/function block\(/);
 assert.match(source,/function plop\(/);
 assert.match(source,/function xp\(/);
 assert.match(source,/createOscillator/);
 assert.match(source,/createDynamicsCompressor/);
});
test('premium Original sounds stay isolated, private OBS links are exactly preserved',()=>{
 new vm.Script(mc);
 parseInline(live);
 parseInline(studio);
 assert.match(originals,/global\.AfterglowAudio=/);
 assert.match(live,/qp\.get\('obs'\)\|\|''/);
 assert.match(live,/qp\.get\('layout'\)==='horizontal'\?'horizontal':'vertical'/);
 assert.match(live,/d\.type==='alert'/);
 assert.match(live,/if\(cfg\.theme==='minecraft'\)window\.AfterglowMinecraftSound\?\.play/);
 assert.match(live,/else window\.AfterglowAudio\?\.play/);
 assert.match(studio,/AfterglowMinecraftSound:window\.AfterglowAudio/);
 assert.match(live,/giftSource:safeGiftSrc\(data\.giftImage\)/);
 assert.match(live,/AfterglowMinecraft\?\.prepare\(root\)/);
});
