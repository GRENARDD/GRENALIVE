import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../mobile.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../mobile-control.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../mobile-control.css',import.meta.url),'utf8');

test('mobile controls: syntax and loaded assets',()=>{
  assert.doesNotThrow(()=>new Script(script,{filename:'mobile-control.js'}));
  assert.match(html,/<script src="\/mobile-control\.js"/);
  assert.match(html,/<link rel="stylesheet" href="\/mobile-control\.css"/);
  assert.ok(css.includes('.mobile-preview'));
});
test('mobile controls: every edited field is present once',()=>{
  const fields=['mobTheme','mobMascot','mobIntensity','mobVolume','mobAudioRoute','mobSoundOn','mobFont','mobTextColor','mobAccentMode','mobAccent','mobSaveAlert','mobReloadAlert','mobTestAlert','mobAutoConnect'];
  fields.push(...['follow','gift','sub','raid','share','likes'].map(k=>'mobSound-'+k));
  for(const id of fields){
    const occurrences=html.match(new RegExp('id="'+id+'"','g'))||[];
    assert.equal(occurrences.length,1,id+' is missing or duplicated');
  }
});
test('mobile controls: account and channel sections remain available',()=>{
  for(const id of ['home','chatPanel','alertPanel','channelsPanel','toolsPanel','accountPanel','linkedPlatforms','linkForm','linkSubmit','linkCancel','web','logout','voice','testVoice']){
    assert.match(html,new RegExp('id="'+id+'"'),id);
  }
  assert.match(html,/data-tab="channelsPanel"/);
  assert.match(html,/data-tab="alertPanel"/);
  assert.match(html,/grenaMobileAlertsOpen/);
  assert.match(html,/grenaMobileChannelsOpen/);
});
test('mobile controls: use existing authenticated GREÑA endpoints',()=>{
  for(const endpoint of ['/api/afterglow-settings','/api/alert','/api/auto-connect']){
    assert.ok(script.includes(endpoint),endpoint);
  }
  assert.match(script,/credentials:'same-origin'/);
  assert.match(script,/dirty && !confirm/);
  assert.match(html,/\/api\/connection-prefs/);
  assert.match(html,/\/api\/tiktok\/live-link/);
});
