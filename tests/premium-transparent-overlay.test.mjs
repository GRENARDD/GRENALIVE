import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const fullscreen = read('assets/grena-fullscreen-gift-obs.html');
const catalog = read('assets/grena-premium-catalog-obs.html');
const overlay = read('afterglow-overlay.html');

test('Premium pages retain transparent OBS CSS and checkerboard is editor-only', () => {
  for(const html of [fullscreen,catalog]){
    assert.match(html, /html\.grena-obs-mode \.stage/);
    assert.match(html, /html:not\(\.grena-obs-mode\) \.stage/);
    assert.match(html, /background:transparent!important;background-image:none!important/);
    assert.match(html, /\.stage\{background:transparent!important;isolation:isolate\}/);
    assert.match(html, /if\(new URLSearchParams\(location\.search\)\.has\('obs'\)\)/);
  }
});

test('full-screen impact is centered, without full-frame dark vignette or bars', () => {
  assert.match(fullscreen, /data-o="h" data-p="c"/);
  assert.match(fullscreen, /position:'c',duration:/);
  assert.match(fullscreen, /\.dim\{display:none!important\}/);
  assert.match(fullscreen, /\.bar\{display:none!important\}/);
  assert.match(fullscreen, /--gx:50%/);
  assert.match(fullscreen, /\.fx\{[^}]*z-index:2/);
  assert.match(fullscreen, /stage\.dataset\.p='c'/);
});

test('colorful rising bubbles cover the scene and use limited frame-based emissions', () => {
  assert.match(fullscreen, /const bubbleColors=\[/);
  assert.match(fullscreen, /parts\.push\(spawnBubble\(w,h,true\)\)/);
  assert.match(fullscreen, /y:anywhere\?Math\.random\(\)\*h:h\+radius/);
  assert.match(fullscreen, /emitCredit\+=dt\*\.05/);
  assert.match(fullscreen, /parts=next\.slice\(-430\)/);
  assert.match(fullscreen, /cx\.clearRect\(0,0,w,h\)/);
  assert.doesNotMatch(fullscreen, /Math\.round\(w\*h\/200000\)\+2/);
});

test('Catalog removes its dark rectangle while keeping the gift and labels visible', () => {
  assert.match(catalog, /\.card\{background:transparent!important;backdrop-filter:none!important/);
  assert.match(catalog, /\.card::before,\.card::after\{display:none!important\}/);
  assert.match(catalog, /\.gbox\{/);
  assert.match(catalog, /gift\.animatedImage\|\|gift\.image/);
  assert.match(overlay, /\/assets\/grena-premium-catalog-obs\.html\?obs=1&layout=/);
  assert.match(overlay, /\/assets\/grena-fullscreen-gift-obs\.html\?obs=1&layout=/);
});
