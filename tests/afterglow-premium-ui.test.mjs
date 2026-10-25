import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const get=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const overlay=get('afterglow-overlay.html');
const studio=get('afterglow-studio.html');
const visual=get('assets/afterglow-pro.css');
const audio=get('assets/afterglow-sound.js');
const backend=get('server.mjs');
const inline=html=>[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(x=>x.trim());

test('both visual scripts and premium audio engine parse',()=>{
  for(const source of [...inline(overlay),...inline(studio)])new vm.Script(source);
  new vm.Script(audio);
});

test('OBS private links and existing realtime subscriptions are unchanged',()=>{
  assert.match(overlay,/qp\.get\('obs'\)\|\|''/);
  assert.match(overlay,/qp\.get\('layout'\)==='horizontal'/);
  assert.match(overlay,/d\.type==='alert'/);
  assert.match(overlay,/d\.type==='afterglow-settings'/);
  assert.match(studio,/new URL\('\/afterglow-overlay\.html',root\)/);
  assert.match(studio,/u\.searchParams\.set\('layout',layout\)/);
  assert.match(backend,/OBS_PUBLIC_PAGES=new Set\(\['\/afterglow-overlay\.html'/);
});

test('gift platform icon and verified fallback are used without a rectangular backdrop',()=>{
  assert.match(overlay,/giftImage:String\(a\.giftImage\|\|''\)/);
  assert.match(overlay,/giftAnimatedImage:String\(a\.giftAnimatedImage\|\|''\)/);
  assert.match(overlay,/giftArt\(s\)/);
  assert.match(overlay,/activateGiftArt\(\);fitLongNames\(\)/);
  assert.match(overlay,/https:\\\/\\\//);
  assert.match(visual,/\.gift-art-img/);
  assert.match(visual,/background:transparent!important;border:0!important;box-shadow:none!important/);
});

test('large type is now readable on vertical and horizontal canvases',()=>{
  assert.match(visual,/\.live \.fx \.meta\{/);
  assert.match(visual,/font-size:clamp\(16px,3\.65cqw,46px\)!important/);
  assert.match(visual,/\.live\.wide \.gift-sweep/);
  assert.match(visual,/\.live\.wide \.follow-piece/);
});

test('six original sounds, sound switches and copying the OBS links',()=>{
  for(const kind of ['follow','gift','sub','raid','share','likes'])assert.match(audio,new RegExp(kind+'\\(b,t\\)'));
  assert.match(audio,/createDynamicsCompressor/);
  assert.match(audio,/delayFeedback\.gain\.value=\.16/);
  assert.match(studio,/\$\$\('\[data-copy-link\]'\)\.forEach/);
  assert.match(studio,/\$\$\('\[data-sound-for\]'\)\.forEach/);
  assert.match(overlay,/AfterglowAudio\?\.play/);
});
