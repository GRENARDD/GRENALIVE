'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFile,readFileSync,mkdtemp,rm}=require('node:fs/promises');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {readOwnerFishKeys,storeOwnerFishKey,VAULT_FILE}=require('../fish-owner-vault.cjs');
const {recoverOldKey}=require('../desktop-build/migrate_owner_fish.cjs');

test('Fish owner: source does not distribute an embedded Fish API credential',async()=>{
 const source=await readFile(new URL('../chat-server.mjs','file://'+__filename.replace(/\\/g,'/')),'utf8').catch(async()=>readFile(join(__dirname,'..','chat-server.mjs'),'utf8'));
 assert.doesNotMatch(source,/FISH_AUDIO_API_KEY_1\s*=\s*process\.env\.[^\n]*Buffer\.from/i);
 assert.doesNotMatch(source,/sk-fish-[A-Za-z0-9_-]{20,}/);
});
test('Legacy migration decodes from the old binary only in local memory',()=>{
 const fake='sk-fish-test-owner-1234567890-not-real';
 const fixture="const FISH_AUDIO_API_KEY_1 = process.env.GRENA_FISH_API_KEY || Buffer.from('"+Buffer.from(fake).toString('base64')+"','base64').toString('utf8')";
 assert.equal(recoverOldKey(fixture),fake);
 assert.throws(()=>recoverOldKey('nothing'),/No encontré/);
});
test('Windows DPAPI: owner retains two independent Fish API keys, encrypted on disk', {skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grena-owner-fish-'));
 const previous=[process.env.GRENA_FISH_API_KEY,process.env.GRENA_FISH_API_KEY_2];
 delete process.env.GRENA_FISH_API_KEY; delete process.env.GRENA_FISH_API_KEY_2;
 const a='sk-fish-owner-one-unit-test-123456',b='sk-fish-owner-two-unit-test-654321';
 try{
   assert.deepEqual(await readOwnerFishKeys(dir),[]);
   assert.equal(await storeOwnerFishKey(dir,1,a),1);
   assert.equal(await storeOwnerFishKey(dir,2,b),2);
   const saved=await readFile(join(dir,VAULT_FILE),'utf8');
   assert.doesNotMatch(saved,/sk-fish-owner-/);
   assert.deepEqual(await readOwnerFishKeys(dir),[a,b]);
   assert.equal(await storeOwnerFishKey(dir,2,b+'rotated'),2);
   assert.deepEqual(await readOwnerFishKeys(dir),[a,b+'rotated']);
 }finally{
   if(previous[0]===undefined)delete process.env.GRENA_FISH_API_KEY;else process.env.GRENA_FISH_API_KEY=previous[0];
   if(previous[1]===undefined)delete process.env.GRENA_FISH_API_KEY_2;else process.env.GRENA_FISH_API_KEY_2=previous[1];
   await rm(dir,{recursive:true,force:true});
 }
});
