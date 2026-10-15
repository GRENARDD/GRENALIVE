import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const ui=readFileSync(new URL('../alerts.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const platformKinds=['follow','sub','subrenew','giftsub','gift','raid','shower'];
test('Alertas: StarVios aparece en el resumen y estado de plataforma',()=>{
 assert.match(ui,/id="starviosAlerts"/);
 assert.match(ui,/id="starviosAlertState"/);
 assert.match(ui,/id="starviosStatus"/);
 assert.match(ui,/id="starviosEventDetail"/);
 assert.match(ui,/StarVios · Alertas del LIVE/);
 assert.match(ui,/data-sv-edit="follow"/);
 assert.match(ui,/data-sv-edit="gift"/);
});
test('Cada tipo de alerta StarVios tiene una prueba cableada con el overlay',()=>{
 for(const k of platformKinds){
  assert(ui.includes('data-sv-kind="'+k+'"'),'Missing UI card for '+k);
  assert(app.includes(' '+k+':{event:'),'Missing demo event '+k);
 }
 assert.match(app,/fetch\('\/api\/alert',\{method:'POST'/);
 assert.match(app,/starviosDemo\(button\.dataset\.svKind,button\)/);
 assert.match(app,/platform:'Starvios',name:'USUARIO_PRUEBA'/);
 assert.match(ui,/Compartir LIVE:/);
 assert.match(ui,/no hemos confirmado un evento público/);
});
test('Browser JavaScript still parses and status distinguishes real events from demos',()=>{
 assert.doesNotThrow(()=>new Script(app,{filename:'app.js'}));
 assert.match(server,/let starviosRealEventAt=0;/);
 assert.match(server,/starviosRealEventAt=Date\.now\(\);/);
 assert.match(server,/lastRealEventAt:starviosRealEventAt/);
 assert.match(app,/const hasReal=!!svHealth\.lastRealEventAt;/);
});
