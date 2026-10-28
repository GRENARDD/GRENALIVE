// GREÑA LIVE Desktop — assert the *real* chat.html TTS sanitizer removes emojis.
// No external LIVE account, API key or Fish Audio traffic is involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname,'..','chat.html'),'utf8');
const begin = '// GRENA_VOICE_EMOJI_FILTER_BEGIN';
const end = '// GRENA_VOICE_EMOJI_FILTER_END';
const start = html.indexOf(begin), stop = html.indexOf(end);
assert.ok(start>=0 && stop>start,'No existe el filtro TTS real en chat.html');
const scope=vm.createContext({Intl,Array,String});
vm.runInContext(html.slice(start+begin.length,stop),scope,{timeout:1000});
const strip = input => scope.stripEmojisForVoice(input);

test('emojis simples y repetidos no se pronuncian, pero la frase queda legible',()=>{
  assert.equal(strip('Hola 😂😂🔥, gente ❤️'),'Hola, gente');
  assert.equal(strip('Hola🫠Mundo'),'Hola Mundo');
  assert.equal(strip('Amo Minecraft 💎 y el dominó 🎲'),'Amo Minecraft y el dominó');
});
test('mensajes compuestos únicamente por emojis no producen audio',()=>{
  for (const x of ['🥹😂❤️🔥','👨‍👩‍👧‍👦','🇩🇴','👍🏽💪🏻','#️⃣1️⃣','🫶🏿❤️‍🔥']) {
    assert.equal(strip(x),'','Emoji no eliminado: '+x);
  }
});
test('las banderas, tonos de piel, emojis unidos y keycaps se descartan completos',()=>{
  assert.equal(strip('🇩🇴 ¡Qué lo qué! 💪🏾'),'¡Qué lo qué!');
  assert.equal(strip('Hola 👩🏽‍💻 familia 👨‍👩‍👧‍👦'),'Hola familia');
  assert.equal(strip('El 1️⃣ y el #️⃣, gracias'),'El y el, gracias');
});
test('los mensajes normales, acentos y números no se alteran',()=>{
  for(const x of ['Hola, ¿cómo estás?','GREÑA LIVE 2026','12345, qué lo qué','@grena_rd gracias','mañana jugamos Minecraft'])assert.equal(strip(x),x);
});
test('voces del sistema conservan filtro emoji y Fish elimina codigos de stickers sin alterar frases',()=>{
  assert.match(html,/result\s*=\s*stripEmojisForVoice\(\s*result\s*\)/);
  assert.match(html,/const spokenName = stripEmojisForVoice\(/);
  assert.match(html,/const humanText=stripStickerAndInternalCodes\(m\.text\|\|''\)/);
  assert.match(html,/isFishVoiceSelected\(\)\s*\?\s*humanText/);
  assert.match(html,/cleanTextForVoice\(humanText\)/);
  assert.match(html,/insertVoiceByPriority\(\{\s*\.\.\.m,\s*text\s*\}\)/);
  assert.match(html,/function buildSpokenText\(message\)/);
  assert.match(html,/const spokenText = buildSpokenText\(message\)/);
  assert.match(html,/function startFishPrefetch\(message\)/);
});
