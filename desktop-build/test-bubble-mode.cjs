const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {join}=require('node:path');
const root=join(__dirname,'..');
const load=name=>readFileSync(join(root,name),'utf8');

test('botón modo burbuja está en el panel de escritorio',()=>{
 const panel=load('index.html');
 assert.match(panel,/id="grenaBubbleModeControl"/);
 assert.match(panel,/href="\/__grena_bubble_mode__"/);
});

test('burbuja recibe chat y eventos sin repetir el historial viejo',()=>{
 const html=load('desktop-bubble.html');
 assert.match(html,/\/api\/viewers/);
 assert.match(html,/\/api\/activity\?limit=/);
 assert.match(html,/\/chat-ws/);
 assert.match(html,/d\?\.type==='chat'/);
 assert.match(html,/d\?\.type==='event'/);
 assert.match(html,/Ignore 'chat-history'/);
 assert.match(html,/textContent=/);
 const js=html.match(/<script>([\s\S]*?)<\/script>/i);
 assert.ok(js,'inline controller present');
 new vm.Script(js[1],{filename:'desktop-bubble.html'});
});

test('Electron bubble stays isolated and can restore original app',()=>{
 const p=load('desktop-build/fix_bubble.py');
 assert.match(p,/nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true/);
 assert.match(p,/mainWindow\.hide\(\)/);
 assert.match(p,/mainWindow\.show\(\)/);
 assert.match(p,/__grena_bubble_restore__/);
 assert.match(p,/grenaBubbleQuitting/);
});

test('Starvios supports instantaneous messages and removes optimistic exclusion',()=>{
 const p=load('starvios-reader.mjs');
 assert.match(p,/new MutationObserver/);
 assert.match(p,/state\.queued\.splice\(0\)/);
 assert.match(p,/this\.deliverChat\(\{\.\.\.directChat,source:'Starvios WebSocket'\}\)/);
 assert.doesNotMatch(p,/if\(id\.startsWith\('tmp-'\)\) continue/);
});

test('Kick uses officially recommended OAuth redirect workaround',()=>{
 const p=load('server.mjs');
 assert.match(p,/params\.set\('redirect','127\.0\.0\.1'\)/);
 assert.match(p,/params\.set\('redirect_uri',redirect\)/);
});
