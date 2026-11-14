import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../mobile.html',import.meta.url),'utf8');

test('mobile dashboard includes live viewer totals and four platforms',()=>{
 for(const name of ['liveViewerTotal','liveViewersTiktok','liveViewersTwitch','liveViewersKick','liveViewersYoutube']){
  assert.match(html,new RegExp('id="'+name+'"'));
 }
 assert.match(html,/updateViewerPanel\(b\.viewers\)/);
 assert.match(html,/setInterval\(refresh,10000\)/);
});

test('mobile uses a compact viewport with horizontal event rail and independent chat scroll',()=>{
 for(const fragment of [
  'body{height:100dvh;min-height:0;display:flex;flex-direction:column;overflow:hidden}',
  'main:has(#chatPanel:not(.hidden)){overflow:hidden}',
  '#chatPanel .activity-feed{height:78px;',
  'scroll-snap-type:x proximity',
  '#chatPanel .chat{flex:1 1 auto;min-height:0;height:auto;',
  '#chatPanel .activity-card{flex:0 0',
  '#chatPanel .voice-settings[open]{position:fixed'
 ])assert.ok(html.includes(fragment),'Missing layout fragment: '+fragment);
});

test('activity from real server is recovered and rendered outside chat with filters',()=>{
 for(const fragment of [
  '/api/activity?limit=120',
  'if(d.type==="activity")addLiveAlert(d.activity)',
  'function renderMobileActivities()',
  'function addLiveAlert(a){addMobileActivity(a)}',
  'data-activity-filter="follow"',
  'data-activity-filter="gift"',
  'data-activity-filter="share"',
  'data-activity-filter="sub"'
 ])assert.ok(html.includes(fragment),'Missing activity fragment: '+fragment);
});

test('chat remains text only and account, mobile pairing and voice functionality remain',()=>{
 for(const fragment of [
  "if(!platforms.includes(p)||m.type!=='chat')return",
  'className=\'platform-tag\'',
  "body.textContent=' '+String(m.text||'').slice(0,1500)",
  'async function redeemDevicePair()',
  'function enqueue(message)',
  'function speakNext()',
  "function changeTab(id)"
 ])assert.ok(html.includes(fragment),'Missing functionality: '+fragment);
});

test('inline GREÑA Mobile JavaScript passes syntax validation',()=>{
 const scripts=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(scripts.length,1);
 assert.doesNotThrow(()=>new vm.Script(scripts[0][1],{filename:'mobile.html'}));
});
