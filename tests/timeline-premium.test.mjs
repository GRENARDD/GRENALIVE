import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import vm from 'node:vm';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const overlay=file('timeline-premium.html'),widgets=file('widgets.html'),server=file('server.mjs'),chat=file('chat-server.mjs');
test('OBS: overlay transparente y sintaxis JS de la plantilla',()=>{
 assert.match(overlay,/background:transparent!important/);
 assert.match(overlay,/el\.className="item enter"/);
 assert.match(overlay,/grena-timeline-settings/);
 assert.match(overlay,/\/chat-ws/);
 assert.match(overlay,/\/multichat-history/);
 assert.match(overlay,/new URLSearchParams\(location.search\)/);
 for(const [i,s] of [...overlay.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())new vm.Script(s[1],{filename:'timeline-inline-'+i+'.js'});
});
test('Panel: plantilla aislada y controles con URL privada',()=>{
 assert.match(widgets,/data-widget-module="multichat"/);
 assert.match(widgets,/data-widget-module="timeline-premium"/);
 assert.match(widgets,/id="timelineUrl"/);
 assert.match(widgets,/timeline=protect\('\/chat\/timeline-premium.html'\)/);
 assert.match(widgets,/timelineUrl:timeline/);
 assert.match(widgets,/timeline-premium-settings/);
 assert.match(widgets,/id="tlTiktokColor"/);
 assert.match(widgets,/id="tlNormalColor"/);
 assert.match(widgets,/id="tlScale"/);
 const inline=[...widgets.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.ok(inline.length>=2);
 new vm.Script(inline.at(-1)[1],{filename:'widgets-timeline-controls.js'});
});
test('Auth: la ruta privada OBS permite GET con token sin convertir POST en público',()=>{
 assert.match(server,/chatOverlay=pathname==='\/chat\/multichat-overlay.html'\|\|pathname==='\/chat\/timeline-premium.html'/);
 assert.match(server,/chatApi=pathname==='\/chat\/api\/multichat-settings'\|\|pathname==='\/chat\/api\/multichat-history'\|\|pathname==='\/chat\/api\/timeline-premium-settings'/);
 assert.match(server,/obsAuthorized\(req\)&&req.method==='GET'&&\(chatOverlay\|\|chatApi\|\|chatAvatar\)/);
 assert.match(server,/\/timeline-premium.html'/);
});
test('Chat: ajustes por GREÑA ID, validación y sesiones existentes intactas',()=>{
 assert.match(chat,/TIMELINE_PREMIUM_FILE=activeProfileId\?join\(PROFILES_DIR,activeProfileId,'timeline-premium-settings.json'\)/);
 assert.match(chat,/sanitizeTimelinePremiumSettings\(incoming\)/);
 assert.match(chat,/safeWriteJson\(TIMELINE_PREMIUM_FILE,timelinePremiumSettings\)/);
 assert.match(chat,/broadcast\(\{type:'timeline-premium-settings',settings:timelinePremiumSettings\}\)/);
 assert.match(chat,/url.pathname==='\/timeline-premium.html'/);
 assert.match(chat,/multichatSettings=sanitizeMultichatSettings/);
 assert.match(chat,/Object.entries\(tags\?\.emotes\|\|\{\}\)/);
});
test('Configuración: rechaza campos desconocidos y valores fuera de rango',()=>{
 const d=chat.match(/const timelinePremiumDefaults=([^\n]+);/),r=chat.match(/const timelinePremiumRanges=([^\n]+);/),f=chat.match(/function sanitizeTimelinePremiumSettings\(input\)\{[\s\S]*?\n\}/);
 assert.ok(d&&r&&f);
 const cfg=vm.runInNewContext('const timelinePremiumDefaults='+d[1]+';const timelinePremiumRanges='+r[1]+';'+f[0]+';sanitizeTimelinePremiumSettings({scale:999,maxMessages:-5,normalColor:"red",twitchColor:"#aabbcc",rogue:"hack"})');
 assert.equal(cfg.scale,200);assert.equal(cfg.maxMessages,1);assert.equal(cfg.normalColor,'#6b3971');assert.equal(cfg.twitchColor,'#aabbcc');assert.ok(!('rogue'in cfg));
});
