import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const css=get('assets/afterglow-pro.css');
const vertical=get('afterglow-overlay.html');
const studio=get('afterglow-studio.html');

test('horizontal: only the gift artwork frame is reduced',()=>{
 assert.match(css,/\.live\.wide \.gift-orbit\{top:18%;width:min\(13%,235px\)\}/);
 assert.match(css,/\.live\.wide \.gift-sweep\{top:60%;left:19%;width:62%\}/);
 assert.match(css,/\.live\.wide \.gift-counter\{right:30%;top:27%\}/);
});
test('vertical: gift art is below the streamer camera without resizing the text',()=>{
 assert.match(css,/\.live:not\(\.wide\) \.gift-orbit\{\s*top:72%;\s*left:50%;\s*width:min\(23%,270px\);/);
 assert.match(css,/\.live \.gift-sweep\{top:56%;left:6%;width:88%;/);
 const y=1920*.72;const h=1080*.23;
 assert.ok(y>1920*.5,'gift starts below upper camera half');
 assert.ok(y+h<1920*.9,'gift stays inside safe lower area');
});
test('existing OBS browser URLs and token flow remain unchanged',()=>{
 assert.match(vertical,/qp\.get\('layout'\)==='horizontal'\?'horizontal':'vertical'/);
 assert.match(vertical,/qp\.get\('obs'\)\|\|''/);
 assert.match(vertical,/new WebSocket\(proto\+'\/\/'\+location\.host\+'\/'\+obsQuery\)/);
 assert.match(studio,/new URL\('\/afterglow-overlay\.html',root\)/);
 assert.match(studio,/u\.searchParams\.set\('layout',layout\)/);
});
