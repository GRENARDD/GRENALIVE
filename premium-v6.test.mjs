import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Script} from 'node:vm';

const root=process.cwd();
const read=p=>readFileSync(resolve(root,p),'utf8');

test('GREÑA V6 premium assets are linked and contain functional anchors',()=>{
 const index=read('index.html');
 const chat=read('chat.html');
 const css=read('grena-premium-v6.css');
 const js=read('grena-premium-v6.js');
 const visibility=read('grena-v6-chat-visibility.js');
 for(const p of ['index.html','alerts.html','widgets.html','cam-room.html','gift-catalog.html','chat.html','live-panel.html','mobile-device.html','dynamics.html']){
  assert.match(read(p),/grena-premium-v6\.css/,p);
 }
 assert.match(index,/id="premiumVoiceCard"/);
 assert.match(index,/id="premiumVoiceSwitch"/);
 assert.match(index,/id="premiumVoiceBackdrop"/);
 assert.match(index,/id="chatFrame"/);
 assert.match(index,/id="grenaPremiumLicense"/);
 assert.match(chat,/id="voiceCooldownSec"/);
 assert.match(chat,/voiceCooldownSeconds:/);
 assert.match(chat,/now-last\s*<\s*voiceUserCooldownMs/);
 assert.match(chat,/grena-v6-chat-visibility\.js/);
 assert.match(css,/grena-v6-voice-only/);
 assert.match(js,/api\/license\/status/);
 assert.match(js,/childVoice\(\)/);
 assert.match(visibility,/grena-v6-linked-platforms/);
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

test('Gold G icon is a native transparent SVG shared by all brand surfaces',()=>{
 const svg=read('favicon.svg');
 assert.match(svg,/<svg[^>]+viewBox="0 0 512 512"/);
 assert.match(svg,/fill="url\(#body\)"/);
 assert.doesNotMatch(svg,/<rect[^>]+(fill=["'](?:white|#fff|#ffffff)|width=["']512)/i);
 assert.doesNotMatch(svg,/data:image\/png;base64/);
 for(const p of ['index.html','login.html','mode.html','afterglow-studio.html','gift-catalog.html','mobile-device.html']){
  assert.match(read(p),/favicon\.svg\?v=600/,p);
 }
 assert.match(read('grena-premium-v6.css'),/background:transparent!important/);
});
