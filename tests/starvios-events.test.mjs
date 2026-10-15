import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStarviosEvent,parseStarviosViewerLabel,STARVIOS_SUPPORT_CATALOG} from '../starvios-events.mjs';

const cases=[
 ['follow',{type:'follow',user:'FanUno'},'follow'],
 ['sub',{type:'subscription',username:'FanDos'},'sub'],
 ['subrenew',{event:'subscription.renewed',user:'FanTres'},'subrenew'],
 ['giftsub',{type:'gifted_subscription',user:'FanCuatro',count:4},'giftsub'],
 ['raid',{type:'raid',user:'FanCinco',viewers:25},'raid'],
 ['gift',{type:'starvies',user:'FanSeis',amount:100},'gift'],
 ['shower',{type:'star_shower',user:'FanSiete',level:3},'shower']
];
for(const [title,input,kind]of cases)test('evento '+title,()=>{
  const event=normalizeStarviosEvent(input);
  assert.equal(event?.kind,kind);
  assert.equal(event.platform,'starvios');
});
test('rechaza chat normal y donaciones sin valor',()=>{
  assert.equal(normalizeStarviosEvent({type:'chat',user:'Fan',message:'raid follow 200 Starvies'}),null);
  assert.equal(normalizeStarviosEvent({type:'gift',user:'Fan',amount:0}),null);
  assert.equal(normalizeStarviosEvent({type:'gift',user:'Fan',amount:-5}),null);
});
test('contador conservador: no confunde seguidores ni duración con viewers',()=>{
  assert.equal(parseStarviosViewerLabel('1,234 espectadores'),1234);
  assert.equal(parseStarviosViewerLabel('Viewers: 27'),27);
  assert.equal(parseStarviosViewerLabel('500 followers'),null);
  assert.equal(parseStarviosViewerLabel('Live Stream 4 h 20 min'),null);
});
test('catálogo registra seis categorías, no importes oficiales',()=>{
  assert.equal(STARVIOS_SUPPORT_CATALOG.length,6);
  assert(STARVIOS_SUPPORT_CATALOG.every(x=>x.image.startsWith('/assets/starvios-events/')));
});
