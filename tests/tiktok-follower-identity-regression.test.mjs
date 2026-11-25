import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
const chat=readFileSync(new URL('../chat.html',import.meta.url),'utf8');

test('TikTok follower status is read from nested connector envelopes',()=>{
  const start=source.indexOf('function getTikTokFollowerStatus(data, user) {');
  const stop=source.indexOf('function getTikTokSubscriberStatus',start);
  assert.ok(start>=0&&stop>start,'TikTok follower status parser is missing');
  const scope={};
  runInNewContext(source.slice(start,stop)+';this.read=getTikTokFollowerStatus',scope);
  assert.equal(scope.read({data:{user:{followRole:1}}},{}),true);
  assert.equal(scope.read({data:{data:{user:{followRole:2}}}},{}),true);
  assert.equal(scope.read({data:{user:{isFollower:true}}},{}),true);
  assert.equal(scope.read({data:{user:{followRole:0}}},{}),false);
  assert.equal(scope.read({data:{user:{}}},{}),null);
});

test('Follow events cache both normalized username and stable user ID',()=>{
  assert.match(source,/data\.data\?\.user\?\.uniqueId/);
  assert.match(source,/tiktokUsers\.set\(key,cached\)/);
  assert.match(source,/tiktokUsers\.set\('id:'\+rawUserId,cached\)/);
  assert.match(source,/tiktokUsers\.get\('id:'\+String\(chat\.userId\)\)/);
});

test('A follower role learned from a follow event is preserved when chat omits role metadata',()=>{
  assert.match(source,/chat\.isFollower === null && typeof oldUser\?\.isFollower === 'boolean'/);
  assert.match(source,/const idKey=chat\.userId\?'id:'\+String\(chat\.userId\):''/);
});

test('Follower-only voice mode remains strict, while normal all-chat mode is unchanged',()=>{
  assert.match(chat,/if\(mode === 'followers'\)\{\s*return m\.isFollower === true;/);
  assert.match(chat,/return true;\s*\n\s*\}/);
});
