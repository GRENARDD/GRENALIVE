import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {normalizeCustomRule,normalizeCustomRules,ruleMatches,findCustomRule} from '../custom-alerts.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const rule=(overrides={})=>normalizeCustomRule({
 id:'custom_test_001',name:'Regalo especial',enabled:true,
 platforms:['tiktok','twitch','kick','starvios'],events:['gift','giftsub'],
 conditions:{minValue:5},
 action:{title:'Gracias {user}',message:'{gift} x{count}',duration:7,priority:65,style:'neon'},
 ...overrides
});
test('La creación exige plataformas y eventos; el guardado es una lista tipada',()=>{
 assert.throws(()=>normalizeCustomRule({platforms:[],events:['gift']}),/plataforma/);
 assert.throws(()=>normalizeCustomRule({platforms:['tiktok'],events:[]}),/evento/);
 assert.throws(()=>normalizeCustomRules([rule(),rule()]),/duplicados/);
 assert.equal(normalizeCustomRules([rule()]).length,1);
});
test('Filtros compatibles con regalos reales y Starvios, valores y usuario específico',()=>{
 const r=rule({conditions:{username:'Luna',giftName:'Rosa',minValue:10,minCount:3}});
 assert.equal(ruleMatches(r,{platform:'TikTok',event:'gift',name:'Luna',giftName:'Rosa dorada',count:5,totalDiamonds:50}),true);
 assert.equal(ruleMatches(r,{platform:'TikTok',event:'gift',name:'OTRA',giftName:'Rosa',count:5,totalDiamonds:50}),false);
 assert.equal(ruleMatches(r,{platform:'TikTok',event:'gift',name:'Luna',giftName:'Rosa',count:1,totalDiamonds:50}),false);
 assert.equal(ruleMatches(r,{platform:'TikTok',event:'gift',name:'Luna',giftName:'Rosa',count:3,totalDiamonds:1}),false);
 assert.equal(ruleMatches(r,{platform:'Starvios',event:'gift',eventKind:'giftsub',name:'Luna',giftName:'Rosa',count:3,amount:25}),true);
});
test('Una regla no accede a plataformas fuera de su configuración',()=>{
 const r=rule({platforms:['kick'],conditions:{}});
 assert.equal(ruleMatches(r,{platform:'Twitch',event:'gift',amount:500}),false);
 assert.equal(ruleMatches(r,{platform:'Kick',event:'gift',amount:500}),true);
});
test('Prioridad, enfriamiento global y enfriamiento individual respetados',()=>{
 const r1=rule({id:'test_rule_high',action:{priority:90,cooldownGlobal:5}});
 const r2=rule({id:'test_rule_low',action:{priority:50}});
 const input={platform:'TikTok',event:'gift',name:'fan',amount:100};
 const times=new Map();
 assert.equal(findCustomRule([r2,r1],input,10000,times)?.id,'test_rule_high');
 assert.equal(findCustomRule([r2,r1],input,11000,times)?.id,'test_rule_low');
 assert.equal(findCustomRule([r2,r1],input,16000,times)?.id,'test_rule_high');
});
test('Solo archivos multimedia permitidos; URL javascript o data se descarta',()=>{
 const r=rule({action:{image:'javascript:alert(1)',audio:'data:text/html,foo',video:'https://media.example.com/alert.mp4'}});
 assert.equal(r.action.image,'');
 assert.equal(r.action.audio,'');
 assert.equal(r.action.video,'https://media.example.com/alert.mp4');
});
test('UI, reproductor y API están integrados en las dos fuentes OBS, con sesiones',()=>{
 const panel=read('alerts.html'),ui=read('custom-alerts.html'),overlay=read('afterglow-overlay.html'),
   engine=read('server.mjs'),renderer=read('assets/custom-alert-renderer.js');
 assert.match(panel,/Personalizadas/);
 assert.match(ui,/\/api\/custom-alerts/);
 assert.match(ui,/Guardar en mi cuenta/);
 assert.match(ui,/\/api\/custom-alerts\/test/);
 assert.match(ui,/uploadImage/);
 assert.match(overlay,/GrenaCustomAlerts/);
 assert.match(overlay,/custom-alert-renderer\.js/);
 assert.match(engine,/profileFile\('custom-alerts\.json',user\.id\)/);
 assert.match(engine,/findCustomRule\(customAlerts,a/);
 assert.match(engine,/OBS_PUBLIC_API\.has\(pathname\)&&obsAuthorized\(req\)/);
 assert.match(renderer,/root\.replaceChildren\(stage\)/);
 assert.doesNotThrow(()=>new Script(renderer,{filename:'custom-alert-renderer.js'}));
 const script=ui.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/);
 assert.ok(script,'Browser editor script');
 assert.doesNotThrow(()=>new Script(script[1],{filename:'custom-alerts-inline.js'}));
});
