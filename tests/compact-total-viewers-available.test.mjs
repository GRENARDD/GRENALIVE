import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const compact=readFileSync(new URL('../widget-compact.html',import.meta.url),'utf8');
const viewers=readFileSync(new URL('../viewers.html',import.meta.url),'utf8');
const widgets=readFileSync(new URL('../widgets.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');

test('Compact V4 counter editor exposes Total Viewers as selectable style',()=>{
 assert.match(compact,/\['grena-total','Total Viewers · transparente \+ usuarios'\]/);
 assert.match(compact,/counter:'\/viewers\.html\?preview=1'/);
 assert.match(compact,/type:'grena-counter-preview'/);
 assert.match(compact,/route=type==='counter'\?'\/api\/counter-settings'/);
});

test('Preview shows a recognizable counter without writing demo counts into OBS',()=>{
 assert.match(viewers,/counterPreviewMode/);
 assert.match(viewers,/if\(counterPreviewMode\)\{/);
 assert.match(viewers,/activePlatforms=\['tiktok','kick','twitch','youtube'\]/);
 assert.match(viewers,/\}else\{\s*poll\(\);\s*ws\(\);/);
 assert.match(viewers,/background:transparent/);
});

test('Full widget editor and backend accept exactly the same Total Viewers style',()=>{
 assert.match(widgets,/<option value="grena-total">/);
 assert.match(server,/\['classic','trio','vertical','grena-viewers','grena-total','grena-social'\]/);
});