'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const src=p=>readFileSync(join(__dirname,'..',p),'utf8');
test('the community carousel is built into the premium sidebar and uses live GREÑA data',()=>{
  const js=src('grena-v4-live.js'),css=src('grena-v4-fixes.css');
  assert.match(js,/function initCommunityTicker\(\)/);
  assert.match(js,/Q\('#home > \.side'\)/);
  assert.match(js,/initCommunityTicker\(\);/);
  assert.match(js,/api\('\/api\/license\/community'\)/);
  assert.match(js,/api\('\/api\/license\/presence'/);
  assert.match(js,/u\.live!==false/);
  assert.match(js,/persistent\.bridge\[p\]===true/);
  assert.match(js,/storageKey='grena-community-share:'\+/);
  assert.match(css,/#home \.v4-community-window/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('the community carousel keeps the original Premium V4 template untouched',()=>{
  const html=src('index.html');
  assert.match(html,/grena-v4-live\.js/);
  assert.doesNotMatch(html,/v4CommunityCard/);
});
