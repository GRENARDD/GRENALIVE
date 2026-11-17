'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=(name)=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('Premium V4 Widgets cards never force four overflowing columns',()=>{
 const css=read('grena-v4-fixes.css');
 assert.match(css,/#pg5 \.g2\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(css,/#pg5 \.wd\{min-width:0;max-width:100%;overflow:hidden/);
 assert.match(css,/#pg5 \.wd \.row:last-child \[data-copy-near\]\{min-width:130px/);
 assert.match(css,/@media\(max-width:900px\)\{#pg5 \.g2\{grid-template-columns:minmax\(0,1fr\)!important\}/);
});
test('Compact widget editor stays within dialog and supplies Minecraft Twitch preview/test',()=>{
 const js=read('grena-v4-live.js'),compact=read('widget-compact.html'),minecraft=read('personajes-minecraft.html');
 assert.match(js,/sizes=\{minecraft:330,counter:400,multichat:450,social:370,superfans:315\}/);
 assert.match(compact,/Probar personaje de Twitch/);
 assert.match(compact,/if\(type==='minecraft'\)demoMinecraft\(\)/);
 assert.match(compact,/platform:'twitch',user:'grena_preview_'/);
 assert.match(compact,/window\.postMessage|contentWindow\?\.postMessage/);
 assert.match(minecraft,/addEventListener\('message',e=>feed\(e\.data\)\)/);
 assert.match(compact,/max-width:100%;overflow:hidden/);
});
test('Twitch network survives restored OAuth session and its preview is refreshed',()=>{
 const server=read('server.mjs'),original=read('social-overlay-grena-original.html'),overlay=read('social-overlay.html'),compact=read('widget-compact.html');
 assert.match(server,/savedAuth\.twitch\?\.login\|\|savedAuth\.twitch\?\.displayName\|\|twitchCfg\?\.login/);
 assert.match(original,/linked\.includes\(platform\)\|\|value/);
 assert.match(original,/enabled\.includes\(platform\)/);
 assert.match(overlay,/grenaOriginal\.addEventListener\('load'/);
 assert.match(compact,/socialNameOverrides:\{\.\.\.labels/);
 assert.match(compact,/const names=\{tiktok:'TikTok · prueba',twitch:'Twitch · prueba'/);
});
test('new preview scripts compile',()=>{
 const vm=require('node:vm');
 new vm.Script(read('grena-v4-live.js'));
 for(const p of ['widget-compact.html','social-overlay.html','social-overlay-grena-original.html']){
  const html=read(p);
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1],{filename:p});
 }
});
