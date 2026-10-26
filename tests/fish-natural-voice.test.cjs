'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeFishNaturalOptions,prepareFishNaturalRequest}=require('../fish-natural-voice.cjs');

test('old clients preserve the old request',()=>{
  const result=prepareFishNaturalRequest('Hola, mundo!',undefined);
  assert.equal(result.text,'Hola, mundo!');
  assert.deepEqual(result.params,{});
  assert.equal(result.enabled,false);
});
test('Natural Spanish preserves meaning and adds sentence ending only for TTS',()=>{
  const text='  Hola   gente  ';
  const result=prepareFishNaturalRequest(text,{style:'natural',expressiveness:75,speed:0.95,naturalPauses:true});
  assert.equal(result.text,'Hola gente.');
  assert.equal(text,'  Hola   gente  ');
  assert.equal(result.params.prosody.speed,0.95);
  assert.equal(result.params.temperature,0.78);
});
test('English and Spanish short chat stay neutral and audible',()=>{
  for(const line of ['Hola','Hello','Gracias','GG']){
    const result=prepareFishNaturalRequest(line,{style:'natural',automaticEmotion:true,expressiveness:85});
    assert.equal(result.text,line);
    assert.ok(!result.text.startsWith('['));
  }
});
test('Emotions only in stronger obvious context, can be disabled',()=>{
  const options={style:'expressive',automaticEmotion:true,expressiveness:80};
  assert.match(prepareFishNaturalRequest('¡Increíble, ganamos!',options).text,/^\[excited\]/);
  assert.doesNotMatch(prepareFishNaturalRequest('¡Increíble, ganamos!',{...options,automaticEmotion:false}).text,/^\[/);
  assert.match(prepareFishNaturalRequest('Lo siento, eso es triste.',options).text,/^\[sad\]/);
});
test('User-supplied tags cannot control Fish speech',()=>{
  const out=prepareFishNaturalRequest('[angry] Hola [whisper] cómo estás',{style:'natural',naturalPauses:true});
  assert.equal(out.text,'(angry) Hola (whisper) cómo estás.');
});
test('Options clamp on the server and never allow arbitrary styles',()=>{
  const a=normalizeFishNaturalOptions({style:'[evil]',speed:999,expressiveness:-12,naturalPauses:'yes'});
  assert.equal(a.style,'off');
  assert.equal(a.speed,2);
  assert.equal(a.expressiveness,0);
  assert.equal(a.naturalPauses,false);
});
