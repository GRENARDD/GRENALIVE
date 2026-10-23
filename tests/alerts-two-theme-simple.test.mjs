import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const get=n=>readFileSync(new URL('../'+n,import.meta.url),'utf8');
const dashboard=get('alerts.html'),settings=get('server.mjs'),overlay=get('afterglow-overlay.html'),
  studio=get('afterglow-studio.html'),minecraft=get('assets/afterglow-minecraft.js'),
  simpleCss=get('assets/alerts-simple.css'),minecraftCss=get('assets/afterglow-minecraft.css'),
  picker=get('assets/alerts-theme-picker.js'),catalog=get('gift-catalog.js'),halloween=get('halloween-alertas-3d.html'),christmas=get('navidad-alertas-3d.html');
test('three selectable themes — Afterglow, Minecraft, Halloween and Navidad',()=>{
 const options=[...dashboard.matchAll(/data-grena-theme="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(options.filter(x=>['original','minecraft','halloween','christmas'].includes(x)),['original','minecraft','halloween','christmas']);
 const optional=options.filter(x=>['minecraft3d','domino'].includes(x));
 assert.ok(optional.length===0||optional.length===2,'Los paquetes adicionales deben ir juntos');
 assert.match(simpleCss,/#dashboard>\.test-grid/);
 assert.match(simpleCss,/#dashboard>\.sv-alert-section/);
 assert.match(simpleCss,/\.ui-complexity-bar/);
 assert.match(simpleCss,/#quickTest/);
 assert.match(dashboard,/id="stylePreviewFrame"/);
 assert.match(dashboard,/id="overlayUrlHorizontal"/);
});
test('catalog retains event test API; one compact dashboard preview',()=>{
 assert.match(catalog,/async function testGift\(/);
 assert.match(catalog,/fetch\('\/api\/alert'/);
 assert.match(simpleCss,/#dashboard>\.test-grid/);
});
test('two private OBS links and sound path are preserved',()=>{
 assert.match(overlay,/qp\.get\('obs'\)\|\|''/);
 assert.match(overlay,/qp\.get\('layout'\)==='horizontal'\?'horizontal':'vertical'/);
 assert.match(overlay,/d\.type==='alert'/);
 assert.match(overlay,/AfterglowAudio\?\.play/);
 assert.match(overlay,/halloweenAlertFor\(event,data,next\)/);
 assert.match(studio,/new URL\('\/afterglow-overlay\.html',root\)/);
});
test('style persisted per account and propagated realtime to both OBS sources',()=>{
 assert.match(settings,/theme:\[[^\n]*'halloween'[^\n]*\]\.includes\(x\.theme\)/);
 assert.match(settings,/profileFile\('afterglow-settings\.json'\)/);
 assert.match(settings,/broadcast\(\{type:'afterglow-settings',settings:afterglowSettings\}\)/);
 assert.match(overlay,/live\.dataset\.theme=cfg\.theme/);
 assert.match(overlay,/AfterglowMinecraft\.render\(event,data/);
 assert.match(studio,/theme:\$\('#afterglowTheme'\)\.value/);
 assert.match(picker,/\.\.\.values,theme:next/);
});
test('Minecraft produces all six pixel-art alerts without opaque canvas',()=>{
 const environment={};vm.runInNewContext(minecraft, {window:environment});
 const engine=environment.AfterglowMinecraft;
 const events=['follow','gift','sub','raid','share','likes'];
 assert.deepEqual(Array.from(engine.events),events);
 for(const event of events){
   const html=engine.render(event,{name:'GREÑA_RD',amount:4,gift:'Rosa'},{
     platform:'TikTok',accent:'#ff2244',giftMarkup:'<img src="/assets/item.webp">'
   });
   assert.match(html,new RegExp('mc-'+event));
   assert.match(html,/GREÑA_RD/);assert.match(html,/--mc-event-accent:#ff2244/);
   assert.doesNotMatch(html,/<canvas/);
 }
 assert.match(minecraftCss,/\.live\[data-theme="minecraft"\] \.mc-item/);
 assert.match(minecraftCss,/\.live\[data-theme="minecraft"\] \.mc-scene/);
});
test('all inline and external scripts parse',()=>{
 for(const source of [minecraft,picker])new vm.Script(source);
 for(const html of [dashboard,overlay,studio,halloween,christmas]){
   for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
     if(script[1].trim())new vm.Script(script[1]);
   }
 }
});
