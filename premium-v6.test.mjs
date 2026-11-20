import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Script} from 'node:vm';

const root=process.cwd();
const read=p=>readFileSync(resolve(root,p),'utf8');

test('GREÑA V4 exact original HTML uses its own DOM and real backend adapter, no old CSS overlay',()=>{
 const index=read('index.html'),ref=read('design/reference/GRENA_LIVE_6_Premium_Interactivo_V4(3).html');
 const adapter=read('grena-v4-live.js'),chat=read('chat.html');
 const css=html=>html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
 const normalize=css=>css.replace(/\r\n?/g,'\n').replace(/\/\* GREÑA Live siempre oscuro: el tema de Windows no altera esta paleta\. \*\/\n/,'').replace(/@media\(prefers-color-scheme:light\)\{[^\n]*\}\n/,'');
 assert.equal(normalize(css(index)),normalize(css(ref)));
 assert.doesNotMatch(css(index),/prefers-color-scheme:light/);
 for(const id of ['home','feed','vsw','plats','ev','prow','profileTrigger','licenseBadge','pg1','pg2','pg4','pg5','pg6','pg7','pg8'])assert.match(index, id.startsWith('pg')?new RegExp('pg\\('+id.slice(2)+','):new RegExp('id="'+id+'"'));
 assert.doesNotMatch(index,/pg\(3,/);
 assert.doesNotMatch(index,/data-l="En vivo"/);
 assert.doesNotMatch(index,/grena-premium-v6\.(css|js)|id="chatFrame"/);
 assert.match(index,/grena-v4-live\.js/);
 assert.match(adapter,/api\/chat\/live-messages/);
 assert.match(adapter,/api\/license\/status/);
 assert.match(chat,/const VOICE_USER_COOLDOWN_MS = 4000;/);
});
test('Premium V6 standalone JavaScript is syntactically valid',()=>{
 for(const p of ['grena-premium-v6.js','grena-v6-chat-visibility.js']){
  assert.doesNotThrow(()=>new Script(read(p),{filename:p}));
 }
});
test('Chat and main dashboard inline scripts remain syntactically valid',()=>{
 for(const p of ['index.html','chat.html']){
  const src=read(p),regex=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let match,count=0;
  while((match=regex.exec(src))){
   const attrs=match[1]||'',code=match[2]||'';
   if(/\bsrc\s*=/.test(attrs)||!code.trim()||/\btype\s*=\s*["']module["']/.test(attrs))continue;
   assert.doesNotThrow(()=>new Script(code,{filename:p+':inline-'+count}),p+' inline script #'+count);
   count++;
  }
  assert.ok(count>0,p+' should contain inline scripts');
 }
});

test('V4 uses its EXACT original gold mark while non-V4 windows and EXE keep gold SVG',()=>{
 const svg=read('favicon.svg'),v4=read('index.html');
 assert.match(svg,/<svg[^>]+viewBox="0 0 512 512"/);
 assert.match(svg,/fill="url\(#body\)"/);
 assert.match(v4,/<div class="logo">G<\/div>/);
 assert.match(v4,/var\(--g1\),var\(--g2\)/);
 for(const p of ['login.html','mode.html','afterglow-studio.html','gift-catalog.html','mobile-device.html'])assert.match(read(p),/favicon\.svg\?v=600/,p);
});