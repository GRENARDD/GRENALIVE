import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
const start=source.indexOf('function firstString(');
const stop=source.indexOf('function usernameFromTikTokUrl(',start);
assert.ok(start>=0&&stop>start,'TikTok chat extraction helpers are missing');
const scope={};
runInNewContext(source.slice(start,stop)+';this.extract=extractTikTokChat',scope);

test('TikTok chat survives an additional nested data envelope and keeps the real sender identity',()=>{
  const event={data:{data:{data:{
    user:{id:'viewer-42',uniqueId:'emil',nickname:'Emil'},
    comment:{text:'hola greña'},
    common:{msgId:'nested-message-42'}
  }}}};
  const chat=scope.extract(event);
  assert.equal(chat.user,'emil');
  assert.equal(chat.nickname,'Emil');
  assert.equal(chat.userId,'viewer-42');
  assert.equal(chat.messageId,'nested-message-42');
  assert.equal(chat.text,'hola greña');
});

test('TikTok nested decoded chat with authorInfo and chatMessage is not treated as empty',()=>{
  const event={data:{data:{data:{
    authorInfo:{id:'viewer-99',uniqueId:'emil_alt',nickname:'Emil Alt'},
    chatMessage:{text:'¿me lees?'},
    msgIdStr:'nested-message-99'
  }}}};
  const chat=scope.extract(event);
  assert.equal(chat.user,'emil_alt');
  assert.equal(chat.text,'¿me lees?');
  assert.equal(chat.userId,'viewer-99');
  assert.equal(chat.messageId,'nested-message-99');
});
