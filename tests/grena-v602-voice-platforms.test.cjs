'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const read=p=>readFileSync(join(__dirname,'..',p),'utf8');
test('GREÑA Premium V4 voice has one master toggle and four luminous network switches',()=>{
 const main=read('grena-v4-live.js'),section=main.split('function openVoiceModal(){')[1]?.split('// ---- Conexiones reales')[0];
 assert.ok(section,'voice modal present');
 for(const network of ['tiktok','twitch','kick','youtube']) assert.match(main,new RegExp("id:'"+network+"'"));
 assert.match(section,/v4VoiceAdvancedButton/);
 assert.match(main,/data-vadv-platform/);
 assert.match(main,/aria-pressed/);
 assert.match(main,/vadvWords/);
 assert.match(main,/setVoiceControl\(id\+'VoiceEnabled',!input\.checked\)/);
 assert.doesNotMatch(section,/id="v4VoiceEnabled"/);
 assert.doesNotMatch(section,/setVoiceControl\('voiceEnabled'/);
 assert.match(main,/vsw\.addEventListener\('click'/);
});
test('individual platform choices persist using the original voice engine',()=>{
 const main=read('grena-v4-live.js');
 assert.match(main,/setV4VoiceMode\(current,el\('vadvMode'\)\.value\)/);
 assert.match(main,/setVoiceControl\(current\+'SelectedUsers',el\('vadvUsers'\)\.value\)/);
 const chat=read('chat.html');
 for(const network of ['tiktok','twitch','kick','youtube']){
  assert.match(chat,new RegExp('id="'+network+'VoiceEnabled"'));
  assert.match(chat,new RegExp('name="'+network+'Mode" value="subscribers"'));
 }
 assert.match(chat,/m\.isSubscriber === true \|\| m\.isMember === true/);
 assert.match(chat,/voiceQueue=voiceQueue\.filter\(m=>m\.__voiceTest===true \|\| isUserAllowed\(m\)\)/);
});
