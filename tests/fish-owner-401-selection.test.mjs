import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const chat=readFileSync(new URL('../chat-server.mjs',import.meta.url),'utf8');
const vault=readFileSync(new URL('../fish-owner-vault.cjs',import.meta.url),'utf8');
const between=(text,a,b)=>{
 const start=text.indexOf(a),end=text.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'Expected source anchors not found');
 return text.slice(start,end);
};
const resolver=between(chat,'async function fetchFishPoolForProfile(profileId){','async function fishPoolForProfile(profileId){');
const a='fish-key-owner-one-valid-for-test-123456789';
const b='fish-key-owner-two-valid-for-test-987654321';
const stale='fish-key-expired-cloud-owner-000000000';
function fakeBridge(result){
 let requests=0;
 const env={
   MAIN_ORIGIN:'http://127.0.0.1:8787',BRIDGE_TOKEN:'test-token',AbortSignal,
   activeProfileId:'owner-local',fishProfileAccount:null,
   fetch:async()=>{requests++;return {ok:true,json:async()=>({ok:true,...result})}},
   reconcileOwnerFishAccounts:keys=>(keys||[]).map((key,i)=>({id:'fish-'+(i+1),key})).filter(x=>!!x.key)
 };
 runInNewContext(resolver+'\nthis.get=fetchFishPoolForProfile;',env);
 return {env,requests:()=>requests};
}
test('Owner always gets BOTH Windows-vault Fish keys, even if an expired Cloudflare API exists',async()=>{
 const {env,requests}=fakeBridge({permanentAccess:true,ownerKeys:[a,b],apiKey:stale});
 const result=await env.get('owner-local');
 assert.equal(result.source,'owner-vault');
 assert.deepEqual(Array.from(result.accounts,x=>x.key),[a,b]);
 assert.equal(requests(),1);
 assert.ok(!result.accounts.some(x=>x.key===stale));
});
test('Owner without Windows keys keeps their own legacy cloud credential',async()=>{
 const {env}=fakeBridge({permanentAccess:true,ownerKeys:[],apiKey:a});
 const result=await env.get('owner-local');
 assert.equal(result.source,'profile');
 assert.deepEqual(Array.from(result.accounts,x=>x.key),[a]);
});
test('Regular GREÑA ID never receives owner credentials even if mistakenly included in bridge payload',async()=>{
 const {env}=fakeBridge({permanentAccess:false,ownerKeys:[a,b],apiKey:stale});
 const result=await env.get('owner-local');
 assert.equal(result.source,'profile');
 assert.deepEqual(Array.from(result.accounts,x=>x.key),[stale]);
});
test('Owner without either key receives actionable setup error, not a silent 401',async()=>{
 const {env}=fakeBridge({permanentAccess:true,ownerKeys:[],apiKey:null});
 const result=await env.get('owner-local');
 assert.equal(result.accounts.length,0);
 assert.match(result.error,/bóveda del propietario/);
});
test('Fish credential resolver never accepts a stale response for another GREÑA ID',async()=>{
 const {env}=fakeBridge({permanentAccess:true,ownerKeys:[a,b],apiKey:stale});
 env.activeProfileId='other-user';
 const result=await env.get('owner-local');
 assert.equal(result.accounts.length,0);
});
test('Windows vault values override stale environment settings, but environment remains legacy fallback',async()=>{
 const vaultRead=async()=>[a,''];
 const source=between(vault,'const activeOwnerFishKeys=[];','async function storeOwnerFishKey(');
 const env={
   process:{platform:'win32',env:{GRENA_FISH_API_KEY:stale,GRENA_FISH_API_KEY_2:b}},
   vaultRead
 };
 runInNewContext(source+'\nthis.read=readOwnerFishKeys;',env);
 const keys=await env.read('local-vault');
 assert.deepEqual(Array.from(keys),[a,b]);
 assert.doesNotMatch(source,/const next=\[0,1\]\.map\(i=>env\[i\]\|\|local\[i\]/);
});
test('Owner 401 diagnostics name only the failing slot and throttle rejected credentials',()=>{
 assert.match(chat,/fishContext\.source==='owner-vault'/);
 assert.match(chat,/fishAccount\.id==='fish-1'\?'1':'2'/);
 assert.match(chat,/fish\.status===401\)coolDownFishAccount\(fishAccount,30000\)/);
 assert.doesNotMatch(chat,/console\.log\([^\n]*fishAccount\.key/);
});
