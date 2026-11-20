import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthCallbackBelongsToProfile as allowed} from './oauth-callback-ownership.mjs';
const state={userId:'grena_rd',mode:'grena-auth'};
test('Kick callback in Chrome can finish without Electron session cookie',()=>assert.equal(allowed({platform:'kick',state,activeUserId:'grena_rd',sessionUserId:undefined}),true));
test('Kick callback is rejected after active profile changes',()=>assert.equal(allowed({platform:'kick',state,activeUserId:'other_user',sessionUserId:undefined}),false));
test('Kick callback rejects missing state owner',()=>assert.equal(allowed({platform:'kick',state:{},activeUserId:'grena_rd'}),false));
test('YouTube broker callback retains Chrome allowance',()=>assert.equal(allowed({platform:'youtube',state,activeUserId:'grena_rd'}),true));
test('Direct YouTube requires session',()=>{
 assert.equal(allowed({platform:'youtube',state:{userId:'grena_rd'},activeUserId:'grena_rd'}),false);
 assert.equal(allowed({platform:'youtube',state:{userId:'grena_rd'},activeUserId:'grena_rd',sessionUserId:'grena_rd'}),true);
});
test('TikTok callback retains session requirement',()=>{
 assert.equal(allowed({platform:'tiktok',state,activeUserId:'grena_rd'}),false);
 assert.equal(allowed({platform:'tiktok',state,activeUserId:'grena_rd',sessionUserId:'grena_rd'}),true);
});
