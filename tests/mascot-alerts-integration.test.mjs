import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('two mascot styles are available without replacing existing themes',()=>{
  const server=read('server.mjs');
  const picker=read('assets/alerts-theme-picker.js');
  const overlay=read('afterglow-overlay.html');
  const hub=read('alerts.html');
  for(const id of ['grena_mascots','grena_grenito']){
    for(const src of [server,picker,overlay,hub])assert.ok(src.includes(id),'missing '+id);
  }
  for(const id of ['grena_catalog','grena_fullscreen','minecraft','domino'])assert.ok(server.includes(id));
});

test('five pixel characters are selectable and profile-persistent',()=>{
  const mascot=read('assets/grena-mascot-alerts.html');
  const picker=read('assets/alerts-theme-picker.js');
  const server=read('server.mjs');
  for(const [key,name] of Object.entries({zp:'Zorro Pixel',pg:'Cerdito Cúbico',bm:'Verdecito Explosivo',sk:'Esqueleto Pixel',dg:'Perro Pixel'})){
    assert.ok(mascot.includes(name),'missing character '+name);
    assert.ok(read("alerts.html").includes('<option value="'+key+'">'),"selection missing "+key);
    assert.ok(server.includes("'"+key+"'"));
  }
  assert.match(picker,/mascotCharacterSelect/);
  assert.match(picker,/mascotCharacter:chosen/);
  assert.match(server,/mascotCharacter:\['zp','pg','bm','sk','dg'\]/);
});

test('OBS mascot player renders transparent and accepts event triggers',()=>{
  for(const file of ['assets/grena-mascot-alerts.html','assets/grenito-original-alerts.html']){
    const source=read(file);
    assert.match(source,/body\.obs,body\.obs #stw\{background:none/);
    assert.match(source,/window\.GRENITO=\{trigger\}/);
    assert.match(source,/if\(OBS\)/);
    assert.match(source,/volume/);
  }
  const overlay=read('afterglow-overlay.html');
  assert.match(overlay,/grena-mascot-alerts\.html/);
  assert.match(overlay,/grenito-original-alerts\.html/);
  assert.match(overlay,/mascotUrl\.searchParams\.set\('char',cfg\.mascotCharacter\)/);
  assert.match(overlay,/postMessage\(\{type:mascotType,user:data\.name/);
});
