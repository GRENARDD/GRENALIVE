'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cleanSpokenChatText,prepareFishNaturalRequest}=require('../fish-natural-voice.cjs');
test('elimina emojis y secuencias compuestas',()=>{
 assert.equal(cleanSpokenChatText('Hola 😂👨‍👩‍👧‍👦 👍🏽 🇩🇴 mundo'),'Hola mundo');
 assert.equal(cleanSpokenChatText('😂🔥❤️'),'');
 assert.equal(cleanSpokenChatText('Hola 1️⃣ amigo'),'Hola amigo');
});
test('acorta risas escritas',()=>{
 assert.equal(cleanSpokenChatText('JAJAJAJAJA'),'jaja');
 assert.equal(cleanSpokenChatText('Qué locura jajajajajaja 😂'),'Qué locura jaja');
 assert.equal(cleanSpokenChatText('jajá'),'jaja');
 assert.equal(cleanSpokenChatText('jaja'),'jaja');
 assert.equal(cleanSpokenChatText('ja, ja'),'jaja');
 assert.equal(cleanSpokenChatText('jejejeje'),'jaja');
});
test('preserva texto normal y modelo de voz',()=>{
 assert.deepEqual(prepareFishNaturalRequest('Hola 😀, qué tal?',{model:'pro'}),{text:'Hola, qué tal?',params:{},model:'pro'});
 assert.equal(cleanSpokenChatText('Tengo 10 diamantes'),'Tengo 10 diamantes');
});
