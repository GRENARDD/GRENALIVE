import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStarviosChannel } from '../starvios-reader.mjs';

test('acepta usuario directo y con @',()=>{
  assert.equal(normalizeStarviosChannel('grena_rd'),'grena_rd');
  assert.equal(normalizeStarviosChannel(' @grena_rd '),'grena_rd');
});
test('acepta enlaces del canal y del popout público',()=>{
  assert.equal(normalizeStarviosChannel('https://starvios.com/@grena_rd'),'grena_rd');
  assert.equal(normalizeStarviosChannel('https://www.starvios.com/popout/chat/grena_rd'),'grena_rd');
});
test('rechaza dominios externos y entradas ambiguas',()=>{
  assert.equal(normalizeStarviosChannel('https://starvios.com.evil.example/test'),'');
  assert.equal(normalizeStarviosChannel('https://evil.example/grena_rd'),'');
  assert.equal(normalizeStarviosChannel('https://starvios.com/'),'');
  assert.equal(normalizeStarviosChannel(''),'');
  assert.equal(normalizeStarviosChannel('https://starvios.com/popout/chat/hi%2Fthere'),'');
});
