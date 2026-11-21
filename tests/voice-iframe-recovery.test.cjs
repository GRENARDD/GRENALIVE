'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const read=path=>readFileSync(join(__dirname,'..',path),'utf8');

test('El panel V4 puede recuperar el motor de voz sin crear otro motor',()=>{
  const source=read('grena-v4-live.js');
  const engine=source.split('// ---- Un solo motor de Chat de Voz')[1]?.split('const V4_VOICE_PLATFORMS=')[0];
  assert.ok(engine,'la implementación del motor está presente');
  assert.match(engine,/frame\.src=location\.origin\+'\/chat\/\?embed=1&profile='/);
  assert.match(engine,/const path='\/chat\.html\?embed=1&profile='/);
  assert.match(engine,/frame\.addEventListener\('load'/);
  assert.match(engine,/frame\.addEventListener\('error'/);
  assert.match(engine,/recoverVoiceEngine\(false\)/);
  assert.match(engine,/recoverVoiceEngine\(true\)/);
  assert.match(engine,/if\(persistent\.voiceFrame\)return/);
  assert.match(engine,/voiceRecoveryTimer/);
  assert.doesNotMatch(engine,/new Audio\(/);
  assert.doesNotThrow(()=>new Function(source),'el JS del dashboard debe compilar');
});

test('El clic para activar voz se conserva durante la recuperación y no falsea el estado visual',()=>{
  const source=read('grena-v4-live.js');
  const engine=source.split('// ---- Un solo motor de Chat de Voz')[1]?.split('const V4_VOICE_PLATFORMS=')[0];
  assert.match(engine,/persistent\.voiceDesiredEnabled=persistent\.voiceDesiredEnabled===null/);
  assert.match(engine,/if\(typeof persistent\.voiceDesiredEnabled==='boolean'\)/);
  assert.match(engine,/if\(input\.checked!==desired\)setVoiceControl\('voiceEnabled',desired\)/);
  assert.match(engine,/badge\(vsw,input\.checked\)/);
  assert.match(engine,/input\.dataset\.grenaV4Bridge!=='1'/);
  assert.match(engine,/input\.addEventListener\('change'/);
});

test('La ruta alternativa conserva el chat y la autenticación Fish en el servidor local',()=>{
  const server=read('server.mjs');
  const chat=read('chat.html');
  assert.match(server,/CHAT_HTTP_ROUTES=new Set\(\[/);
  assert.match(server,/'\/api\/fish-tts'/);
  assert.match(server,/'\/api\/fish-ready'/);
  assert.match(chat,/location\.port === '8788' \? '\/ws' : '\/chat-ws'/);
  assert.match(chat,/fetch\('\/api\/fish-ready'/);
});