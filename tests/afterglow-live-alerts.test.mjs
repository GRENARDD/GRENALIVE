import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const studio=read('afterglow-studio.html'),overlay=read('afterglow-overlay.html'),backend=read('server.mjs'),audio=read('assets/afterglow-sound.js'),panel=read('alerts.html');
test('studio and overlays expose two independent OBS sources with retained account authorization',()=>{
 for(const name of ['vertical','horizontal'])assert.match(studio,new RegExp('layout,?\\s*'+name+'|layout of \\[.vertical.,.horizontal.\\]|link'+name[0].toUpperCase()+name.slice(1)));
 assert.match(studio,/\/api\/obs-token/);assert.match(studio,/linkVertical/);assert.match(studio,/linkHorizontal/);
 assert.match(backend,/OBS_PUBLIC_PAGES=new Set\(\['\/afterglow-overlay.html'/);
 assert.match(backend,/OBS_PUBLIC_API=new Set\(\['\/api\/afterglow-settings'/);
 assert.match(overlay,/obsQuery/);assert.match(overlay,/new WebSocket/);
 assert.match(panel,/overlayUrlHorizontal2/);
});
test('all five platforms map to proper visual palettes and live events',()=>{
 for(const platform of ['tiktok','twitch','kick','starvios','youtube']){assert.match(overlay,new RegExp(platform+':\\['));assert.match(studio,new RegExp('data-platform="'+platform+'"'))}
 const start=overlay.indexOf('function mapAlert('),end=overlay.indexOf('function normalizedSettings(',start);
 assert.ok(start>0&&end>start);
 const local=vm.runInNewContext("let platform='tiktok';const cfg={intensity:65};const events=['follow','gift','sub','raid','share','likes'];"+overlay.slice(start,end)+";({mapAlert,platform:()=>platform})");
 const cases=[
   [{platform:'TikTok',event:'follow',name:'señor'},'follow','tiktok'],
   [{platform:'TikTok',event:'like',name:'fan',count:120},'likes','tiktok'],
   [{platform:'Twitch',event:'giftsub',name:'mod',count:3},'gift','twitch'],
   [{platform:'Twitch',event:'raid',viewers:75},'raid','twitch'],
   [{platform:'Kick',event:'cheer',bits:50},'gift','kick'],
   [{platform:'Starvios',event:'gift',eventKind:'shower'},'gift','starvios'],
   [{platform:'Starvios',event:'subrenew'},'sub','starvios'],
   [{platform:'YouTube',event:'gift',giftKind:'superchat'},'gift','youtube']
 ];
 for(const[input,event,p]of cases){const result=local.mapAlert(input);assert.equal(result.event,event);assert.equal(local.platform(),p)}
});
test('six sonically distinct cues and independent switches',()=>{
 for(const kind of ['follow','gift','sub','raid','share','likes']){assert.match(audio,new RegExp("case '"+kind+"'"));assert.match(studio,new RegExp('data-sound-for="'+kind+'"'))}
 assert.match(audio,/createOscillator/);assert.match(audio,/createBiquadFilter/);assert.match(overlay,/AfterglowAudio\?\.play/);
 assert.match(overlay,/cfg\.sounds\[event\]/);
});
test('both layouts share persistent settings, but keep links and dimensions separate',()=>{
 assert.match(overlay,/layout===.horizontal/);assert.match(overlay,/live\.classList\.add\('wide'\)/);
 assert.match(backend,/afterglow-settings\.json/);assert.match(backend,/broadcast\(\{type:'afterglow-settings'/);
 assert.match(studio,/GUARDAR DISEÑO Y SONIDOS/);
 assert.match(studio,/1080 × 1920/);assert.match(studio,/1920 × 1080/);
});
