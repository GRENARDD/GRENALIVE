'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeFishNaturalOptions,prepareFishNaturalRequest}=require('../fish-natural-voice.cjs');

test('FREE is the default official Fish model and leaves plain text untouched',()=>{
  const input='¡Hola gente! ¿Cómo están?';
  const result=prepareFishNaturalRequest(input);
  assert.deepEqual(result,{text:input,params:{},model:'free'});
});
test('PRO is selected explicitly, and FREE cannot silently become paid',()=>{
  assert.deepEqual(normalizeFishNaturalOptions({model:'pro'}),{model:'pro'});
  for(const model of ['invalid','s2.1-pro','paid',null,0,{},[]])
    assert.deepEqual(normalizeFishNaturalOptions({model}),{model:'free'});
  const result=prepareFishNaturalRequest('Buenos días.',{model:'pro'});
  assert.equal(result.model,'pro');
  assert.deepEqual(result.params,{});
});
test('No emotion tags, extra punctuation, changes to capitalization or synthesizer controls',()=>{
  const message='¡VAMOOOS!!!...  ¿Qué pasó?  [emote] 123';
  for(const mode of ['free','pro']){
    const result=prepareFishNaturalRequest(message,{model:mode,style:'expressive',expressiveness:100,speed:1.5,naturalPauses:true,automaticEmotion:true,temperature:0.4});
    assert.equal(result.text,message);
    assert.deepEqual(result.params,{});
    assert.equal(result.model,mode);
  }
});
test('Only trim transport whitespace, never alter the actual comment',()=>{
  assert.equal(prepareFishNaturalRequest('   Hola, Sofía.   ',{model:'free'}).text,'Hola, Sofía.');
});
