'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const reference=source('design/reference/GRENA_LIVE_6_Premium_Interactivo_V4(3).html');
const live=source('index.html');
const adapter=source('grena-v4-live.js');
const style=html=>(html.match(/<style>([\s\S]*?)<\/style>/)||[])[1];
const nav=html=>(html.match(/<nav class="rail" id="nav"[\s\S]*?<\/nav>/)||[])[0];

test('EXACT source: original V4(3) CSS is byte-for-byte identical',()=>{
 assert.ok(style(reference),'V4 source must include original CSS');
 const normalize=css=>css.replace(/\r\n?/g,'\n').replace(/\/\* GREÑA Live siempre oscuro: el tema de Windows no altera esta paleta\. \*\/\n/,'').replace(/@media\(prefers-color-scheme:light\)\{[^\n]*\}\n/,'');
 assert.equal(normalize(style(live)),normalize(style(reference)),'Only the approved dark-theme override may differ');
 assert.doesNotMatch(style(live),/prefers-color-scheme:light/);
 // The user explicitly removed ONLY the En vivo sidebar button.
 const buttons=html=>[...nav(html).matchAll(/<button class="nb(?: on)?" data-l="[^"]+"[\s\S]*?<\/button>/g)].map(m=>m[0]);
 assert.deepEqual(buttons(live),buttons(reference).filter(x=>!x.includes('data-l="En vivo"')),'Other icons and their markup must stay identical');
});

test('V4 keeps the eight approved tabs (without En vivo) and dashboard DOM, not legacy UI elements',()=>{
 const names=['Inicio','Flotante','Móvil','Alertas','Widgets','Juegos','Cámaras','Regalos'];
 const actual=[...nav(live).matchAll(/<button class="nb(?: on)?" data-l="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(actual,names);
 assert.doesNotMatch(live,/pg\(3,/);
 assert.doesNotMatch(live,/data-l="En vivo"/);
 for(const id of ['ttl','licenseBadge','profileTrigger','userAvatar','tot','cl','ca','split','leg','feed','vsw','plats','ev','prow',
   'pg1','pg2','pg4','pg5','pg6','pg7','pg8'])assert.match(live,id.startsWith('pg')?new RegExp('pg\\('+id.slice(2)+','):new RegExp('id="'+id+'"'),id);
 for(const cls of ['shell','rail','wrap','hero','chat','side','voice','pads'])assert.match(live,new RegExp('class="[^"]*\\b'+cls+'\\b'),cls);
 assert.doesNotMatch(live,/class="workspace"|class="primary-nav"|id="premiumVoiceCard"|id="chatFrame"/);
 assert.doesNotMatch(live,/grena-premium-v6\.css|grena-premium-v6\.js/);
});

test('V4 replaces demo timers, example chats, fake QR and pretend connections with real adapters',()=>{
 assert.doesNotMatch(live,/const MS=\[/);
 assert.doesNotMatch(live,/fakeQR/);
 assert.doesNotMatch(live,/setInterval\(\(\)=>\{add\(MS/);
 assert.doesNotMatch(live,/INTERACCIONES DE PRUEBA 6\.0 \(sin backend\)/);
 assert.match(live,/src="\/grena-v4-live\.js\?v=6005"/);
 for(const route of ['/api/account/me','/api/license/status','/api/status','/api/activity?limit=60',
 '/api/viewers','/api/chat/live-messages','/api/soundboard','/api/mobile/pair/create',
 '/api/obs-token','/api/gift-catalog','/api/cam-room/create','/api/dynamics/minecraft']){
  assert.ok(adapter.includes(route),'Real backend route missing: '+route);
 }
 assert.match(adapter,/createElement\('iframe'\)/);
 assert.match(adapter,/voiceEnabled/);
 assert.match(adapter,/setInterval\(\(\)=>refreshChat\(\),1250\)/);
 assert.doesNotMatch(adapter,/const MS=\[/);
 assert.doesNotMatch(adapter,/const fakeQR=/);
});

test('V4 inline scaffold and real adapter parse without errors, Fish cooldown remains 4s',()=>{
 const match=[...live.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/g)].filter(m=>!/\bsrc\s*=/.test(m[1]));
 assert.ok(match.length>=1);
 for(const m of match)new vm.Script(m[2],{filename:'v4-exact-inline.js'});
 new vm.Script(adapter,{filename:'grena-v4-live.js'});
 const chat=source('chat.html');
 assert.match(chat,/const VOICE_USER_COOLDOWN_MS = 4000;/);
 assert.match(chat,/now-last\s*<\s*VOICE_USER_COOLDOWN_MS/);
});

test('V4 follows owner/beta/remaining-days real licensed state, not pretend credentials',()=>{
 const db=source('grena-licensing.mjs');
 assert.match(db,/pathname==='\/api\/license\/status'/);
 assert.match(adapter,/license\.permanentAccess===true/);
 assert.match(adapter,/licenceRecord\.kind==='beta'&&licenceRecord\.active===true/);
 assert.match(adapter,/licenceRecord\.expiresAt/);
 assert.match(adapter,/localStorage\.getItem\(key\)/);
});
