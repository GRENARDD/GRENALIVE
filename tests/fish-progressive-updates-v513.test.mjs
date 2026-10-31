import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const chat=src('chat.html'), bridge=src('chat-server.mjs'), upd=src('desktop-build/fix_official_updates.py');
test('Fish streaming begins on the live first comment without forcing a full MP3 download',()=>{
  assert.match(chat,/async function startFishProgressivePlayback\(/);
  assert.match(chat,/MediaSource\.isTypeSupported\('audio\/mpeg'\)/);
  assert.match(chat,/stream:true/);
  assert.match(chat,/response\.body\.getReader\(\)/);
  assert.match(chat,/sourceBuffer\.appendBuffer\(pending\.shift\(\)\)/);
  assert.match(chat,/audio\.playbackRate=1/);
  assert.match(bridge,/incoming\.stream===true && fish\.body/);
  assert.match(bridge,/for await\(const part of fish\.body\)/);
  assert.match(bridge,/response\.write\(chunk\)/);
  assert.match(bridge,/fishAudioCachePut\(fishCacheKey,Buffer\.concat\(streamedParts,streamedBytes\)\)/);
  // Buffered fallback and original Fish model choice remain available.
  assert.match(bridge,/const audio=Buffer\.from\(await fish\.arrayBuffer\(\)\)/);
  assert.match(bridge,/body:JSON\.stringify\(\{text:naturalSpeech\.text,reference_id:referenceId,format:'mp3'\}\)/);
  const q=chat.slice(chat.indexOf('function queueVoice(m)'),chat.indexOf('/* =====================================================\n   HABLAR'));
  assert.ok(q.indexOf('speakNext();')<q.lastIndexOf('pumpFishPrefetch();'));
  const s=chat.slice(chat.indexOf('function speakNext(){'),chat.indexOf('function ',chat.indexOf('function speakNext(){')+15));
  assert.doesNotMatch(s,/pumpFishPrefetch\(\);\s*const message = voiceQueue\.shift/);
});
test('Fish streaming never exposes API secrets or shares generated audio between GREÑA IDs',()=>{
  assert.match(bridge,/String\(request\.headers\['x-grena-internal'\]\|\|'\'\)!==BRIDGE_TOKEN/);
  assert.match(bridge,/activeProfileId,\s*fishContext\.accounts\.map\(a=>a\.key\)\.sort\(\)/);
  assert.doesNotMatch(chat.slice(chat.indexOf('async function startFishProgressivePlayback('),chat.indexOf('async function speakFishMessage(')),/fishAccount\.key|Authorization:.*Bearer/);
});
test('v5.1.13 update download displays progress, uses published full NSIS, preserves owner release gate',()=>{
  assert.match(upd,/disableDifferentialDownload=true/);
  assert.match(upd,/autoUpdater\.on\('download-progress'/);
  assert.match(upd,/setTitle\('GREÑA Live PRO · Descargando v'/);
  assert.match(upd,/setProgressBar\(percent\/100\)/);
  assert.match(upd,/autoUpdater\.on\('error'/);
  assert.match(upd,/\/api\/updates\/latest/);
  assert.match(upd,/state\?\.published===true/);
  assert.match(upd,/tag\[1:\] if tag else '5\.1\.14'/);
  assert.doesNotMatch(upd,/autoUpdater\.allowDowngrade=true/);
});
