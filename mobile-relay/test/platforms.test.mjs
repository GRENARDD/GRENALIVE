import test from 'node:test';
import assert from 'node:assert/strict';
import {PLATFORM_IDS, PLATFORM_INFO, channelReference, safeEvent, connectionState} from '../platforms.mjs';

test('all five platforms have a declared connection and event protocol',()=>{
  assert.deepEqual(PLATFORM_IDS,['tiktok','twitch','kick','youtube','starvios']);
  for(const platform of PLATFORM_IDS){
    assert.ok(PLATFORM_INFO[platform]?.auth);
    assert.ok(PLATFORM_INFO[platform]?.events.includes('chat'));
  }
});
test('normalizes a public handle and HTTPS URL for every platform',()=>{
  const data={
    tiktok:['@leyshmv','https://www.tiktok.com/@leyshmv/live?lang=es'],
    twitch:['@grena_rd','https://www.twitch.tv/grena_rd?ref=home'],
    kick:['@grena-rd','https://kick.com/grena-rd?source=direct'],
    youtube:['@grena_rd','https://www.youtube.com/@grena_rd/live'],
    starvios:['@grena_rd','https://www.starvios.com/grena_rd']
  };
  for(const id of PLATFORM_IDS){
    for(const input of data[id]){
      const c=channelReference(id,input);
      assert.equal(c.platform,id);
      assert.ok(c.url.startsWith('https://'));
      assert.ok(!c.url.includes('?ref=')&&!c.url.includes('?source=')&&!c.url.includes('?lang='));
    }
  }
  assert.equal(channelReference('youtube','https://youtu.be/ABCDEFGHIjk').kind,'video');
  assert.equal(channelReference('youtube','https://www.youtube.com/watch?v=ABCDEFGHIjk&feature=shared').url,
      'https://www.youtube.com/watch?v=ABCDEFGHIjk');
});
test('rejects impersonation, SSRF, credentials and invalid user inputs for every platform',()=>{
  for(const id of PLATFORM_IDS){
    for(const input of ['http://localhost:8787/live','https://127.0.0.1/live',
      'https://user:password@'+id+'.com/channel','@bad /user','https://evil.com/live']){
      assert.throws(()=>channelReference(id,input),id+' '+input);
    }
  }
  assert.throws(()=>channelReference('invalid','@user'));
});
test('normalizes real provider event shapes for the original PC alert renderer',()=>{
  for(const id of PLATFORM_IDS){
    assert.deepEqual(
      {kind:safeEvent(id,{event:'message',user:'Alex',message:'hola'}).kind,
       platform:safeEvent(id,{event:'message',user:'Alex',message:'hola'}).platform},
      {kind:'chat',platform:id}
    );
    for(const kind of ['follow','sub','gift','raid']){
      const a=safeEvent(id,{event:kind,user:'Alex',amount:3,giftName:'Rosa'});
      assert.equal(a.kind,'alert');
      assert.equal(a.action,kind);
      assert.equal(a.platform,id);
    }
  }
  assert.equal(safeEvent('starvios',{event:'starvies',user:'L',amount:100}).action,'gift');
  assert.equal(safeEvent('youtube',{event:'superchat',user:'L',amount:9}).action,'gift');
  assert.equal(safeEvent('twitch',{event:'bits',user:'L',amount:9}).action,'gift');
});
test('caps untrusted values and does not mark a URL as connected',()=>{
  const item=safeEvent('tiktok',{event:'chat',user:'U'.repeat(500),message:'a'.repeat(800),amount:1e20});
  assert.equal(item.user.length,64);
  assert.equal(item.message.length,300);
  assert.equal(item.amount,99999);
  assert.equal(connectionState({linked:true,adapterReady:false}),'unavailable');
  assert.equal(connectionState({linked:true,adapterReady:true,authenticated:true,handshake:true,live:false}),'connected_offline');
  assert.equal(connectionState({linked:true,adapterReady:true,authenticated:true,handshake:true,live:true}),'live');
  assert.equal(connectionState({linked:true,adapterReady:true,authenticated:false}),'authorization_required');
  assert.equal(connectionState({linked:false,adapterReady:true,authenticated:true,handshake:true,live:true}),'not_linked');
});
