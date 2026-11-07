import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const mascots=['assets/grena-mascot-alerts.html','assets/grenito-original-alerts.html'];

test('both mascot scenes opt into alpha before their first OBS frame',()=>{
 for(const path of mascots){
  const html=read(path);
  assert.match(html,/new URLSearchParams\(location\.search\)\.has\('obs'\)/,path);
  assert.match(html,/meta\[name="color-scheme"\]/,path);
  assert.match(html,/document\.documentElement\.style\.setProperty\('background','transparent','important'\)/,path);
  assert.match(html,/cv\.getContext\('2d',\{alpha:true\}\)/,path);
  assert.match(html,/html\.grena-obs-mode #app,html\.grena-obs-mode #stw/,path);
  assert.match(html,/html\.grena-obs-mode #st,html\.grena-obs-mode #sv/,path);
  assert.match(html,/background-color:rgba\(0,0,0,0\)!important/,path);
  // The editor's original checkerboard and all SVG animations must survive.
  assert.match(html,/#stw\{flex:1 1 400px/,path);
  assert.match(html,/requestAnimationFrame\(frame\)/,path);
  assert.match(html,/window\.GRENITO=\{trigger\}/,path);
 }
});

test('the OBS overlay forces alpha only on the same-origin mascot iframe',()=>{
 const overlay=read('afterglow-overlay.html');
 assert.match(overlay,/function forceMascotTransparentSurface\(frame\)/);
 assert.match(overlay,/const doc=frame\.contentDocument/);
 for(const selector of ['html','body','#app','#stw','#st','#sv','#cv'])
  assert.ok(overlay.includes("'"+selector+"'"),selector);
 assert.match(overlay,/forceMascotTransparentSurface\(scene\);[\s\S]{0,200}scene\.contentWindow\?\.postMessage/);
 assert.match(overlay,/mascotUrl\.searchParams\.set\('grenaAlpha','2'\)/);
 assert.match(overlay,/scene\.setAttribute\('allowtransparency','true'\)/);
 assert.match(overlay,/scene\.style\.background='transparent'/);
 assert.match(overlay,/scene\.src=isCatalog\?/,'premium catalog source is unchanged');
});
