import test from 'node:test';
import assert from 'node:assert/strict';
import {StarviosReader,normalizeStarviosChannel} from '../starvios-reader.mjs';
import {normalizeStarviosEvent} from '../starvios-events.mjs';

test('normaliza canales de Starvios sin permitir otros dominios',()=>{
  assert.equal(normalizeStarviosChannel('https://starvios.com/live/gre%C3%B1a'), '');
  assert.equal(normalizeStarviosChannel('https://starvios.com/live/grena_rd'),'grena_rd');
  assert.equal(normalizeStarviosChannel('@gre_na'),'gre_na');
  assert.equal(normalizeStarviosChannel('https://evil.example/live/test'),'');
});

test('recibe eventos expresos anidados serializados por websocket',()=>{
  const events=[];
  const reader=new StarviosReader({onEvent:event=>events.push(event)});
  reader.channel='prueba';
  reader.running=true;
  reader.acceptFrame(JSON.stringify({type:'socket',data:JSON.stringify({event:'gift',user:'luna',amount:125,id:'gift-1'})}));
  reader.acceptFrame(JSON.stringify({type:'socket',data:JSON.stringify({event:'gift',user:'luna',amount:125,id:'gift-1'})}));
  assert.equal(events.length,1);
  assert.equal(events[0].platform,'starvios');
  assert.equal(events[0].amount,125);
  assert.equal(events[0].user,'luna');
});

test('no convierte mensajes normales en alertas',()=>{
  assert.equal(normalizeStarviosEvent({type:'message',message:'Me suscribí, Starvies!'}),null);
  const events=[];
  const reader=new StarviosReader({onEvent:event=>events.push(event)});
  reader.channel='prueba';reader.running=true;
  reader.acceptFrame(JSON.stringify({event:'chat.message',payload:{text:'Raid y follow!',username:'test'}}));
  assert.deepEqual(events,[]);
});

test('recuperación desactivada al desconectar',async()=>{
  const reader=new StarviosReader();
  reader.scheduleRecovery('prueba');
  assert.equal(reader.reconnectTimer,null);
  await reader.disconnect();
  assert.equal(reader.running,false);
  assert.equal(reader.reconnectTimer,null);
});
