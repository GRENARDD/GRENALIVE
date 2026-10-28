import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../chat.html',import.meta.url),'utf8');
const start=html.indexOf('function looksLikeStickerOrInternalCode(text=\'\'){');
const stop=html.indexOf('function voiceUserRateKey(',start);
assert.ok(start>=0&&stop>start,'Sticker functions are missing');
const vm={};
runInNewContext(html.slice(start,stop)+'\nthis.isSticker=looksLikeStickerOrInternalCode;this.strip=stripStickerAndInternalCodes',vm);
const strip=vm.strip,isSticker=vm.isSticker;

test('Never narrate sticker-only content, emotes or image URLs',()=>{
 for(const text of ['[laughcry]','[laughcry][laughcry]','[sticker_102]','sticker:code123','sticker','emote','gif','https://cdn.kick.com/image.webp',':laughcry:',':sunglasses:']){
   assert.equal(isSticker(text)||!strip(text),true,JSON.stringify(text));
 }
});
test('Mixed comments keep human words while silently removing sticker codes',()=>{
 assert.equal(strip('Hola [laughcry] familia'),'Hola familia');
 assert.equal(strip('Qué tal :laughcry: gente'),'Qué tal gente');
 assert.equal(strip('Mira https://cdn.kick.com/123.gif jajaja'),'Mira jajaja');
 assert.equal(strip('nos vemos [sticker_100] en Kick'),'nos vemos en Kick');
});
test('Normal chat text stays untouched and is not classified as sticker',()=>{
 for(const t of ['Vamos a jugar Minecraft','No veo los stickers','Qué tal amigos 123','¿Cómo va el directo?']){
   assert.equal(strip(t),t);
   assert.equal(isSticker(t),false);
 }
});
test('Fish and system voices receive human text, not visual token placeholders',()=>{
 assert.match(html,/const humanText=stripStickerAndInternalCodes\(m\.text\|\|''\)/);
 assert.match(html,/isFishVoiceSelected\(\)\s*\?\s*humanText\s*:\s*cleanTextForVoice\(humanText\)/);
 assert.match(html,/addMessage\(m\);[\s\S]{0,180}queueVoice\(m\);/);
});
