import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='mobile-android/app/src/main/';
const java=path=>fs.readFileSync(base+'java/com/grena/live/mobile/'+path+'.java','utf8');

test('Android channel editor accepts only TikTok without deleting other account settings',()=>{
  const editor=java('SettingsActivity');
  assert.match(editor,/PLATFORMS=\{"tiktok"\}/);
  assert.match(editor,/PLATFORM_NAMES=\{"TikTok LIVE"\}/);
  assert.match(editor,/new JSONObject\(snapshot\.toString\(\)\)/);
  assert.match(editor,/url\.getPath\(\)\.matches/);
});
test('native dashboard is TikTok-only; does not advertise unimplemented providers',()=>{
  const main=java('MainActivity');
  assert.match(main,/MI TIKTOK LIVE/);
  assert.match(main,/Activar vigilancia TikTok LIVE/);
  assert.doesNotMatch(main,/Ver estado de TikTok, Twitch, Kick, YouTube y Starvios/);
  assert.doesNotMatch(main,/Diagnóstico de las cinco plataformas/);
  assert.doesNotMatch(main,/for\(String name:new String\[\]\{"TikTok","Twitch"/);
});
test('TikTok LIVE watcher keeps listening when not live',()=>{
  const service=java('OverlayService');
  assert.match(service,/response\.optBoolean\("watching",false\)/);
  assert.match(service,/result\.optBoolean\("watching",false\)/);
  assert.match(service,/EN DIRECTO · TikTok LIVE confirmado/);
});
test('original PC theme assets remain packaged, not replaced with mock alerts',()=>{
  const assets=base+'assets/pc-alerts/';
  for(const file of [
    'afterglow-overlay.html','assets/grena-mascot-alerts.html',
    'assets/grenito-original-alerts.html','assets/afterglow-minecraft.js',
    'assets/grena-theme-packs.js'])
    assert.ok(fs.statSync(assets+file).size>500,'Missing original asset: '+file);
});
