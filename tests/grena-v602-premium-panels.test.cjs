'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=file('index.html'),adapter=file('grena-v4-live.js'),server=file('server.mjs');
const stylesheet=html=>(html.match(/<style>([\s\S]*?)<\/style>/)||[])[1];
test('6.0.2 retains byte-identical V4 master CSS while loading scoped corrections',()=>{
 const ref=file('design/reference/GRENA_LIVE_6_Premium_Interactivo_V4(3).html');
 assert.equal(stylesheet(index),stylesheet(ref),'Do not change approved original Premium V4 CSS');
 assert.match(index,/grena-v4-fixes\.css/);
 const corrections=file('grena-v4-fixes.css');
 assert.match(corrections,/#pg2 \.qr/);
 assert.match(corrections,/#pg8 \.gx/);
 assert.match(corrections,/grid-auto-rows:max-content/);
});
test('Alerts removes unneeded platform card without affecting real platform readout',()=>{
 assert.doesNotMatch(index,/<h3>Estado de plataformas<\/h3>/);
 assert.doesNotMatch(adapter,/const badges=QA\('#pg4/);
 assert.match(adapter,/QA\('#plats button/);
 assert.match(adapter,/QA\('#lv button/);
 assert.match(index,/Enlaces de OBS · Vertical y Horizontal/);
});
test('Widget Configurar selects real saved variants and embeds real live preview, no placeholder',()=>{
 const widgets=file('widgets.html');
 for(const id of ['counter','multichat','social','superfans','minecraft']){
   assert.ok(widgets.includes('data-widget-module="'+id+'"'));
   assert.ok(adapter.includes("'"+id+"'"),id);
 }
 assert.doesNotMatch(index,/"Índice de Fidelidad"/);
 assert.match(widgets,/id="counterStyle"/);
 assert.match(widgets,/id="mcTheme"/);
 assert.match(widgets,/id="sgLayout"/);
 assert.match(widgets,/id="superFansLayout"/);
 assert.match(widgets,/v4-widget-focus/);
 assert.match(adapter,/widget-compact\.html\?type=/);
 assert.match(file('widget-compact.html'),/id="preview"/);
 assert.match(file('widget-compact.html'),/Aplicar cambios/);
 assert.match(adapter,/<iframe title=/);
 assert.doesNotMatch(index,/"Tap Tap Top","Top 5 de Tap Taps reales/);
});
test('Gifts no longer render hundreds of squashed rows or pretend items',()=>{
 const css=file('grena-v4-fixes.css');
 assert.match(css,/#pg8 \.gx> \.gift|#pg8 \.gx>\.gift/);
 assert.match(css,/min-height:218px/);
 assert.match(adapter,/giftLimit=24/);
 assert.match(adapter,/allowed\.slice\(0,giftLimit\)/);
 assert.match(adapter,/media\.autoplay=true;media\.loop=true;media\.muted=true/);
 assert.match(adapter,/gift-more/);
 assert.match(adapter,/\/assets\/kick-gifts\//);
 assert.doesNotMatch(index,/\}\;gr\(\);\s*\/\* navegación completa/);
});
test('Pairing and install QR cannot overflow their smaller responsive box',()=>{
 const css=file('grena-v4-fixes.css');
 assert.match(css,/#pg2 \.qr/);
 assert.match(css,/width:176px!important;height:176px!important/);
 assert.match(adapter,/width:152,height:152/);
 assert.match(adapter,/\/api\/mobile\/pair\/create/);
 assert.match(adapter,/\/api\/mobile\/lan\/enable/);
});
test('Administration is reserved for verified admins with V4 gold theme; users see their own timed license',()=>{
 const lic=file('grena-licensing.mjs');
 assert.match(server,/pathname==='\/license-admin\.html'/);
 assert.match(server,/await licensing\.isAdministrator\(u\.id\)/);
 assert.match(adapter,/owner\|\|status\.isAdmin===true/);
 assert.match(adapter,/data-profile="admin"/);
 assert.doesNotMatch(adapter,/data-profile="switch"/);
 assert.match(adapter,/async function openMyLicense/);
 assert.match(adapter,/\/api\/license\/status/);
 assert.match(adapter,/Licencia BETA/);
 assert.match(adapter,/1 año/);
 assert.match(lic,/pathname==='\/api\/license\/status'/);
 const admin=file('license-admin.html');
 assert.match(admin,/grena-admin-v4\.css/);
 assert.match(admin,/class="grena-admin-v4"/);
 assert.match(file('grena-admin-v4.css'),/linear-gradient/);
});
test('Soundboard offers 3-second hold, volume, delete, and native scoped game shortcuts',()=>{
 assert.match(adapter,/PRESS_TO_CONFIG_MS=3000/);
 assert.match(adapter,/targetVolume/);
 assert.match(adapter,/v4PadVolume/);
 assert.match(adapter,/\/api\/soundboard\/delete\//);
 assert.match(adapter,/\/api\/soundboard\/config\//);
 assert.match(adapter,/grena:soundboard:trigger/);
 assert.match(server,/pathname\);\s*if\(deleteMatch&&req\.method==='POST'\)/);
 assert.match(server,/meta\.volume=Math\.round\(volume\)/);
 assert.match(server,/volume:Math\.round\(Math\.max\(0,Math\.min\(100/);
 assert.match(server,/i!==slot&&soundboardShortcut/);
 assert.match(file('desktop-build/fix_soundboard_hotkeys.py'),/GRENA_SOUNDBOARD_GLOBAL_V602/);
 assert.match(file('.github/workflows/grena-desktop-from-kit.yml'),/python desktop-build\/fix_soundboard_hotkeys\.py/);
});
test('All modified JavaScript is syntactically valid before Windows packaging',()=>{
 new vm.Script(adapter,{filename:'grena-v4-live.js'});
 const inline=[...index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/g)].filter(x=>!/\bsrc=/.test(x[1]));
 assert.ok(inline.length>0);
 for(const script of inline)new vm.Script(script[2],{filename:'index-v4-inline.js'});
 const widgets=file('widgets.html');
 const scripts=[...widgets.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/g)].filter(x=>!/\bsrc=/.test(x[1]));
 for(const script of scripts)new vm.Script(script[2],{filename:'widgets-v4.js'});
});
