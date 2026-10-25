import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const social=read('social-overlay.html');
const server=read('server.mjs');
const overlay=read('afterglow-overlay.html');
const catalog=read('assets/grena-premium-catalog-obs.html');
const fullscreen=read('assets/grena-fullscreen-gift-obs.html');

test('animated social widget respects selected side, margin and user sizing',()=>{
  assert.match(social,/stage\.style\.justifyContent=edge==='right'\?'flex-end':'flex-start'/);
  assert.match(social,/stage\.style\.paddingLeft=/);
  assert.match(social,/stage\.style\.paddingRight=/);
  assert.match(social,/cfg\.fontSize/);
  assert.match(social,/cfg\.iconSize/);
  assert.match(social,/enterFromRight/);
  assert.match(social,/\.name\{[^}]*text-overflow:ellipsis/);
});

test('catalog resolves actual gift ID ahead of same-name gifts',()=>{
  const start=server.indexOf('function catalogMatch(');
  const end=server.indexOf('function rememberObservedCatalogGift(',start);
  assert.ok(start>=0&&end>start,'catalogMatch function not found');
  const ctx={
    giftCatalogCache:{items:[
      {platform:'TikTok',id:'live:111',name:'Rosa',nameEs:'Rosa',amount:1},
      {platform:'TikTok',id:'live:222',name:'Rosa',nameEs:'Rosa',amount:1,meta:{liveGiftId:'222'}}
    ]},
    catalogPlatform:p=>p,
    giftTextKey:s=>String(s||'').trim().toLowerCase()
  };
  const match=vm.runInNewContext(server.slice(start,end)+';catalogMatch',ctx);
  assert.equal(match('TikTok',{id:'222',name:'Rosa'}).id,'live:222');
  assert.equal(match('TikTok',{id:'111',name:'Rosa'}).id,'live:111');
  assert.match(server,/catalogMatch\(p,\{id:extra\.giftId,name,amount,event\}\)/);
  assert.match(overlay,/giftAnimatedImage:safeGiftSrc\(data\.giftAnimatedImage\)/);
});

test('both Premium themes use real media or neutral artwork, never a demo gift',()=>{
  assert.match(catalog,/evtAsset\('gift'\)/);
  assert.match(catalog,/kind:'missing'/);
  assert.match(fullscreen,/genericGiftArt/);
  assert.match(fullscreen,/img\.src=gift\.animatedImage\|\|gift\.image\|\|gift\.src\|\|genericGiftArt/);
});

test('full-screen gift name is text, not user-controlled HTML',()=>{
  assert.match(fullscreen,/what\.replaceChildren\(\)/);
  assert.match(fullscreen,/strong\.textContent=String\(gift\.name/);
  assert.doesNotMatch(fullscreen,/\$\('what'\)\.innerHTML=/);
});

test('OBS-only transparent canvas does not flatten the editor previews',()=>{
  for(const page of [catalog,fullscreen]){
    assert.match(page,/has\('obs'\)\)document\.documentElement\.classList\.add\('grena-obs-mode'\)/);
    assert.match(page,/html\.grena-obs-mode \.stage/);
    assert.match(page,/html\.grena-obs-mode \.side/);
    assert.match(page,/GRENA_OBS_ALERT/);
  }
});
