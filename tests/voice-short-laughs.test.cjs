'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {runInNewContext}=require('node:vm');
const chat=readFileSync(join(__dirname,'..','chat.html'),'utf8');
const begin='// GRENA_VOICE_SHORT_LAUGHS_BEGIN';
const end='// GRENA_VOICE_SHORT_LAUGHS_END';
const start=chat.indexOf(begin),stop=chat.indexOf(end,start);
assert.ok(start>=0 && stop>start,'voice-only laughter reducer must exist in chat.html');
const fn=runInNewContext(chat.slice(start+begin.length,stop)+'\nshortenRepeatedLaughsForVoice',{}, {timeout:1000});

test('gigantic repeated laughter stays a short, legible spoken chuckle',()=>{
 for(const [input,expected] of [
  ['jajajajajajajaja','ja, ja'],
  ['JAJAJAJAJAJA','ja, ja'],
  ['jajaja','ja, ja'],
  ['JEJEJEJEJE','je, je'],
  ['Jijijijijiji','ji, ji'],
  ['hahahahahaha','ha, ha'],
  ['JAAAAAAJAAAJAAAA','ja, ja'],
  ['kkkkkkkkk','ja, ja'],
  ['xdddddddd','ja, ja'],
  ['xdxdxdxd','ja, ja'],
  ['JA JA JA JA JA','ja, ja'],
  ['Me mató jajajajajajajaja ese clip','Me mató ja, ja ese clip'],
  ['Qué pasó? jejejejeje!','Qué pasó? je, je!'],
 ])assert.equal(fn(input),expected,input);
});

test('ordinary words, short laughs, links, tags, emoji and names are unchanged',()=>{
 for(const input of [
  'Hola gente, mañana jugamos Minecraft',
  'Muy buena esa, jaja',
  'jeje',
  'xd',
  'klk jajaja24',
  'ojalá que funcione',
  '@jajajajajajaja hola',
  '#jajajajaja reaccion',
  'https://jajajajajaja.com/test',
  'www.jajajajajaja.com',
  'Reí un montón 😂😂😂',
  '123456789012345',
  'Greña RD',
 ]) assert.equal(fn(input),input,input);
});

test('laugh compression only touches the TTS message copy, never the visual chat',()=>{
 assert.match(chat,/const humanText=stripStickerAndInternalCodes\(m\.text\|\|''\)/);
 assert.match(chat,/let text=isFishVoiceSelected\(\)\s*\?\s*humanText\s*:\s*cleanTextForVoice\(humanText\);/);
 assert.match(chat,/text=shortenRepeatedLaughsForVoice\(text\);/);
 assert.match(chat,/insertVoiceByPriority\(\{\s*\.\.\.m,\s*text\s*\}\)/);
 assert.doesNotMatch(chat.slice(start,stop),/m\.text\s*=/);
 assert.match(chat,/audio\.playbackRate = 1/);
});
