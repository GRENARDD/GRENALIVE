import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const widgets=readFileSync(new URL('../widgets.html',import.meta.url),'utf8');
const overlay=readFileSync(new URL('../super-fans-overlay.html',import.meta.url),'utf8');

test('Super Fans link for OBS is protected with the current GREÑA OBS token',()=>{
 assert.match(widgets,/superfans=protect\('\/super-fans-overlay\.html'\)/);
 assert.match(widgets,/superFansUrl:superfans\+/);
 assert.match(widgets,/if\(!obsLinksReady\)/);
});

test('Super Fans preview uses the same authorized link as the OBS source',()=>{
 assert.match(widgets,/function updateSuperFansPreview\(\)/);
 assert.match(widgets,/preview\.searchParams\.set\('preview','1'\)/);
 assert.match(widgets,/obsLinksReady=true;\s*updateSuperFansPreview\(\)/);
 assert.match(widgets,/src\.searchParams\.set\('layout',e\.target\.value\);/);
});

test('Super Fans does not strand a live widget on an empty platform for five minutes',()=>{
 assert.match(overlay,/const available=platforms\.filter\(p=>\(dailyTops\[p\]\|\|\[\]\)\.length>0\)/);
 assert.match(overlay,/if\(!available\.length\)\{slot\.replaceChildren\(\);nextTimer=setTimeout\(cycle,15000\);return\}/);
 assert.match(overlay,/PERIOD_MS=demo\?14000:330000/);
});
