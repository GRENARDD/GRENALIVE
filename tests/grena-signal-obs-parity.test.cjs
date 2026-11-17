'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('MultiChat Signal preview uses the identical 1920x1080 layout as the real OBS source',()=>{
 const c=read('widget-compact.html');
 assert.match(c,/const fitObsPreview=\(\)=>\{/);
 assert.match(c,/holder\.clientWidth\/1920,holder\.clientHeight\/1080/);
 assert.match(c,/preview\.style\.transform='scale\('/);
 assert.match(c,/preview\.classList\.add\('obs-sized'\)/);
 assert.match(c,/Vista OBS real: 1920 × 1080/);
 assert.match(c,/new ResizeObserver\(fitObsPreview\)\.observe\(preview\.parentElement\)/);
 assert.match(c,/type:'grena-multichat-settings',settings:read\(\)/);
 assert.doesNotMatch(c,/\.preview iframe\.obs-sized\{[^}]*width:100%/);
});
test('Signal OBS text size is independent from other themes and survives settings persistence',()=>{
 const editor=read('widget-compact.html'),legacy=read('widgets.html'),server=read('chat-server.mjs'),overlay=read('multichat-overlay.html'),signal=read('multichat-signal.html');
 assert.match(editor,/signalFontSize:clamp\('signalFontSize',18,120,42\)/);
 assert.match(editor,/id="signalSizeField"/);
 assert.match(editor,/\$\('theme'\)\?\.value!=='signal'/);
 assert.match(editor,/number\('signalFontSize',42,18,120\)/);
 assert.match(legacy,/id="mcSignalFontSize"/);
 assert.match(legacy,/signalFontSize:Math\.max\(18,Math\.min\(120/);
 assert.match(server,/signalFontSize:\[18,120\]/);
 assert.match(server,/signalFontSize:42/);
 assert.match(overlay,/signalFontSize:\[18,120\]/);
 assert.match(overlay,/signalFontSize:42/);
 assert.match(signal,/Number\(cfg\.signalFontSize \?\? 42\)/);
 assert.match(signal,/Math\.max\(18,Math\.min\(120/);
 assert.match(signal,/document\.documentElement\.style\.setProperty\('--size',CFG\.size\+'px'\)/);
 assert.match(overlay,/new URL\('\/multichat-signal\.html',location\.origin\)/);
 assert.match(overlay,/if\(OBS_ACCESS\)u\.searchParams\.set\('obs',OBS_ACCESS\)/);
});
test('Overlay and Signal native animations, live websocket and transparent OBS remain',()=>{
 const signal=read('multichat-signal.html'),overlay=read('multichat-overlay.html');
 assert.match(signal,/background:transparent!important/);
 assert.match(signal,/function addMessage\(m\)/);
 assert.match(signal,/function decode\(el\)/);
 assert.match(signal,/function signalConnect\(\)/);
 assert.match(signal,/signalMessage\(d\)/);
 assert.match(overlay,/if\(cfg\.theme==='signal'\)return/);
 assert.match(overlay,/signalFrame\.style\.display=signal\?'block':'none'/);
});
test('Widget editor inline JavaScript and Signal script compile',()=>{
 const vm=require('node:vm');
 for(const name of ['widget-compact.html','multichat-signal.html','multichat-overlay.html','widgets.html']){
  const html=read(name);
  let n=0;
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
   new vm.Script(match[1],{filename:name});
   n++;
  }
  assert.ok(n>0,name+' must have an inline script');
 }
});
