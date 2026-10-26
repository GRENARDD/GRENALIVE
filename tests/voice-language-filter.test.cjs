// Test the language filter exactly as shipped in the chat user interface.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'chat.html'), 'utf8');
const begin = '// GRENA_VOICE_LANGUAGE_FILTER_BEGIN';
const end = '// GRENA_VOICE_LANGUAGE_FILTER_END';
const start = html.indexOf(begin), stop = html.indexOf(end);
assert.ok(start >= 0 && stop > start, 'Voice language filter markers missing');
const filter={value:'all'};
const scope=vm.createContext({
  $: id => id==='voiceLanguageFilter'?filter:null,
  document:{querySelectorAll:()=>[]}
});
vm.runInContext(html.slice(start+begin.length,stop),scope,{timeout:1000});
const accepts=(mode,text)=>{filter.value=mode;return scope.languageAllowedForVoice(text);};

test('English-only accepts short English chat messages',()=>{
  for(const text of ['Hello','Thanks','Hey','Nice','GG','Hello everyone','I love this stream','What a great game']){
    assert.equal(accepts('en',text),true, 'English rejected: '+text);
  }
});
test('English-only rejects recognizable Spanish and other languages',()=>{
  for(const text of ['Hola','Gracias','Buenas noches','Bonjour','Olá','Ciao','こんにちは','Привет']){
    assert.equal(accepts('en',text),false, 'Wrong language accepted: '+text);
  }
});
test('Spanish + English permits both, short comments and emoji-free slang',()=>{
  for(const text of ['Hola','Hello','Thanks','Gracias','Good morning','Buenas noches','gg','xd']){
    assert.equal(accepts('es-en',text),true,'Bilingual rejected: '+text);
  }
  for(const text of ['Bonjour','Olá','こんにちは']){
    assert.equal(accepts('es-en',text),false,'Unwanted language accepted: '+text);
  }
});
test('Spanish-only accepts Spanish and rejects recognizable English',()=>{
  assert.equal(accepts('es','Hola'),true);
  assert.equal(accepts('es','Gracias'),true);
  assert.equal(accepts('es','Hello'),false);
});
test('All languages mode preserves previous unrestricted behavior',()=>{
  assert.equal(accepts('all','Bonjour'),true);
  assert.equal(accepts('all','hello'),true);
});
test('Queue and voice test remain wired to the shipped filter',()=>{
  assert.match(html,/if\(!languageAllowedForVoice\(text\)\) return;/);
  assert.match(html,/\$\('voiceLanguageFilter'\)\?\.value === 'en'/);
});
