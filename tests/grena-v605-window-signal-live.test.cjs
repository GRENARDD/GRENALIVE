'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Remove ONLY the En vivo sidebar tab; preserve live indicators, routes and navigation',()=>{
 const index=read('index.html'),adapter=read('grena-v4-live.js');
 assert.doesNotMatch(index,/data-l="En vivo"/);
 assert.doesNotMatch(index,/pg\(3,"En vivo"/);
 assert.match(index,/EN VIVO AHORA/);
 assert.match(index,/data-l="Inicio"/);
 assert.match(index,/data-l="Widgets"/);
 assert.match(index,/data-l="Alertas"/);
 assert.match(index,/const page=\[0,1,2,4,5,6,7,8\]\[i\]/);
 assert.match(adapter,/Number\(btn\.dataset\.page\)/);
 assert.match(index,/id='lv'/);
});

test('MultiChat Signal is the user-supplied original visual design with GREÑA engine integration',()=>{
 const signal=read('multichat-signal.html');
 assert.match(signal,/<title>MultiChat Signal<\/title>/);
 assert.match(signal,/\/\* ===== SÚPER FAN/);
 assert.match(signal,/@keyframes sweep/);
 assert.match(signal,/function addMessage\(m\)/);
 assert.match(signal,/GREÑA Live integration/);
 assert.match(signal,/\/chat-ws/);
 assert.match(signal,/\/chat\/api\/multichat-settings/);
 assert.match(signal,/\/chat\/api\/multichat-history/);
 assert.doesNotMatch(signal,/if\(CFG\.twitch\) connectTwitch/);
 assert.doesNotMatch(signal,/if\(CFG\.ytKey && CFG\.ytVideo\) connectYouTube/);
 assert.match(read('chat-server.mjs'),/\'clean\',\'blossom\',\'comicpop\',\'timeline\',\'signal\'/);
 assert.match(read('multichat-overlay.html'),/theme===\'signal\'/);
 assert.match(read('multichat-overlay.html'),/id="signalFrame"/);
 assert.match(read('widget-compact.html'),/MultiChat Signal · original/);
 assert.match(read('widgets.html'),/value="signal"/);
 assert.match(read('desktop-build/fix_startup.py'),/multichat-signal\.html/);
 assert.match(read('server.mjs'),/\'\/multichat-signal\.html\'/);
});

test('Native gold Windows titlebar preserves native controls, login and drag-and-drop',()=>{
 const build=read('desktop-build/enable_frameless.py');
 const index=read('index.html');
 const login=read('login.html');
 const flow=read('.github/workflows/grena-desktop-from-kit.yml');
 assert.match(build,/mainWindow\\s\*=\\s\*new/);
 assert.match(build,/titleBarStyle:'hidden'/);
 assert.match(build,/titleBarOverlay:/);
 assert.match(build,/symbolColor:'#e4bb70'/);
 assert.match(build,/process\.platform==='win32'/);
 assert.doesNotMatch(build,/frame:false/);
 assert.match(flow,/python desktop-build\/enable_frameless\.py/);
 assert.match(index,/app-region:drag/);
 assert.match(index,/app-region:no-drag/);
 assert.match(login,/grena-window-drag/);
});

test('Zero viewers and offline/unlinked networks never get rendered in OBS widgets',()=>{
 const server=read('server.mjs');
 const viewer=read('viewers.html'),original=read('viewers-grena-original.html');
 assert.match(server,/function activeWidgetPlatforms\(\)/);
 assert.match(server,/Number\.isFinite\(n\)\|\|n<=0/);
 assert.match(server,/st\.authenticated===true\|\|st\.runtimeConnected===true/);
 assert.match(server,/activePlatforms:activeWidgetPlatforms\(\)/);
 assert.match(server,/liveNetworks:activeWidgetPlatforms\(\)/);
 assert.match(viewer,/activePlatforms\.includes\(k\)/);
 assert.match(original,/activePlatforms\.includes\(p\)/);
 assert.match(read('social-overlay.html'),/cfg\.liveNetworks\.includes\(p\)/);
 assert.match(read('social-overlay-grena-original.html'),/settings\.liveNetworks\.includes\(platform\)/);
 assert.match(read('social-overlay-classic.html'),/cfg\.liveNetworks\.includes\(x\[0\]\)/);
 assert.match(read('super-fans-overlay.html'),/activePlatforms\.includes\(p\)/);
 assert.match(read('widget-compact.html'),/preview:true/);
});

test('All new HTML inline scripts parse',()=>{
 for(const p of ['multichat-signal.html','multichat-overlay.html','widget-compact.html','viewers.html','viewers-grena-original.html','social-overlay.html','social-overlay-classic.html','social-overlay-grena-original.html','super-fans-overlay.html','index.html','login.html']){
  const source=read(p);
  for(const [i,m] of [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].entries())
    new vm.Script(m[1],{filename:p+'#script'+i});
 }
});
