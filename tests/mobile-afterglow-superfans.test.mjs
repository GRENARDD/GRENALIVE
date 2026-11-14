import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const studio=file('afterglow-studio.html'),overlay=file('afterglow-overlay.html'),server=file('server.mjs');
test('Afterglow stores and restores separate audio files for each of six preset alerts',()=>{
 for(const event of ['follow','gift','sub','raid','share','likes'])assert.match(studio,new RegExp('data-sound-for="'+event+'"'));
 for(const marker of ['selectedAlertType','alertSoundFile','previewSelectedSound','resetSelectedSound','selectedVolume','selectedIntensity'])assert.ok(studio.includes('id="'+marker+'"'));
 for(const marker of ['customAudioFiles','eventLevels','eventIntensity','/api/custom-alerts/media','renderSelectedAudio()'])assert.ok(studio.includes(marker));
 for(const marker of ['const customSound=','const nativeSound=','new Audio(customSound','data.intensity=cfg.eventIntensity'])assert.ok(overlay.includes(marker));
 assert.match(server,/audioFiles,eventLevels,eventIntensity,fontFamily/);
});
test('mobile companion has two distinct offline QR codes and one-time account pairing',()=>{
 const pc=file('mobile-device.html'),mobile=file('mobile.html');
 for(const marker of ['installQr','pairQr','enableWifi'])assert.ok(pc.includes('id="'+marker+'"'));
 for(const marker of ['api/mobile/pair/create','api/mobile/lan/enable'])assert.ok(pc.includes(marker));
 assert.ok(pc.includes('/assets/qr-code.min.js'));
 assert.ok(mobile.includes('redeemDevicePair()'));
 assert.ok(mobile.includes('/api/mobile/pair/consume'));
 assert.ok(server.includes('MOBILE_PAIRS.delete(key)'));
 assert.ok(server.includes('preserveExisting:true'));
 assert.ok(server.includes('mobileGateway'));
});
test('top of day uses separate daily stats, 30 seconds and 5 minute rotation',()=>{
 const top=file('super-fans-overlay.html');
 assert.match(top,/SHOW_MS=demo\?8000:30000/);
 assert.match(top,/PERIOD_MS=demo\?14000:300000/);
 for(const p of ['kick','twitch','tiktok'])assert.ok(top.includes("'"+p+"'"));
 for(const key of ['dailyTops','dailyStats','comments','minutes','shares'])assert.ok(top.includes(key));
 assert.ok(server.includes('dailyTops:'));
});
test('embedded editor and mobile scripts are valid JavaScript',()=>{
 for(const name of ['afterglow-studio.html','afterglow-overlay.html','mobile.html','mobile-device.html','super-fans-overlay.html']){
  const html=file(name);const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(x=>x[1]).filter(Boolean);
  assert.ok(scripts.length>0,name+' has no embedded scripts');
  scripts.forEach((s,i)=>assert.doesNotThrow(()=>new vm.Script(s,{filename:name+'#'+i}),name+' invalid script #'+i));
 }
});
