import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTikTokUsername,safeEventText} from '../protocol.mjs';

test('normalizes public TikTok user and live URLs',()=>{
  assert.equal(normalizeTikTokUsername('@grena_rd'),'grena_rd');
  assert.equal(normalizeTikTokUsername('https://www.tiktok.com/@grena_rd/live?lang=es'),'grena_rd');
  assert.equal(normalizeTikTokUsername('https://m.tiktok.com/@grena_rd'),'grena_rd');
});
test('rejects unknown domains and dangerous local or credential URLs',()=>{
  for(const input of [
    'http://www.tiktok.com/@test','https://evil.tiktok.com.evil.net/@test',
    'https://127.0.0.1/@test','https://attacker@www.tiktok.com/@test',
    'https://www.tiktok.com:444/@test','https://www.tiktok.com/@bad%2Fuser',
    'https://tiktok.com/','@../foo','https://www.tiktok.com/@a'
  ])assert.throws(()=>normalizeTikTokUsername(input),input);
});
test('bound untrusted event messages before forwarding to the Android overlay',()=>{
  assert.equal(safeEventText('  hola\\u0000 ',8),'hola\\u00');
  assert.equal(safeEventText('a'.repeat(600),240).length,240);
});
