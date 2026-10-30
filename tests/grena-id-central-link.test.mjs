import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeLicensing } from '../grena-licensing.mjs';

async function harness(fetchHandler){
  const dir=await mkdtemp(join(tmpdir(),'grena-link-test-'));
  const origFetch=globalThis.fetch;
  globalThis.fetch=fetchHandler;
  const options={cloud:false,dataDir:dir,profileFile:(name,id)=>join(dir,'profiles',id,name),
    activeUser:()=>null,readBody:async()=>'',remoteUrl:'https://grena.example.test'};
  const cleanup=async()=>{globalThis.fetch=origFetch;await rm(dir,{recursive:true,force:true})};
  return {licensing:await makeLicensing(options),options,cleanup};
}
const account={id:'central-100',username:'ejemplo_rd',displayName:'Ejemplo',email:'example@example.test'};
const session={ok:true,user:account,token:'C'.repeat(43),
  license:{kind:'beta',active:true,expiresAt:null,revokedAt:null},permanentAccess:false};
const fakeResponse=(status,data)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'}
});
test('A previously registered GREÑA ID can be linked to a fresh installation and stays linked after restart',async()=>{
  const h=await harness(async(url)=> {
    assert.match(String(url),/\/api\/license\/identity\/login$/);
    return fakeResponse(200,session);
  });
  try{
    assert.equal(h.licensing.centralConfigured(),true);
    const central=await h.licensing.loginCentralIdentity('ejemplo_rd','valid-password');
    await h.licensing.attachCentralSession('local-new-device',central,'ejemplo_rd');
    const local=await h.licensing.getCached('local-new-device');
    assert.equal(local.centralUserId,account.id);
    assert.equal(local.token,session.token);
    assert.equal(local.connected,true);
    assert.equal(await h.licensing.canUse('local-new-device'),true);
    const restarted=await makeLicensing(h.options);
    const restored=await restarted.getCached('local-new-device');
    assert.equal(restored.token,session.token);
    assert.equal(restored.centralUserId,account.id);
  }finally{await h.cleanup()}
});
test('An identity from a different GREÑA ID cannot take over an existing profile',async()=>{
  const h=await harness(async()=>fakeResponse(200,session));
  try{
    await h.licensing.attachCentralSession('local-user',session,'ejemplo_rd');
    const other={...session,user:{...account,id:'central-999'}};
    await assert.rejects(h.licensing.attachCentralSession('local-user',other,'ejemplo_rd'),{status:409});
    assert.equal((await h.licensing.getCached('local-user')).centralUserId,account.id);
  }finally{await h.cleanup()}
});
test('A temporary outage does not erase saved central token and account mapping',async()=>{
  let online=true;
  const h=await harness(async()=>online?fakeResponse(200,session):fakeResponse(503,{ok:false,error:'Servicio temporalmente no disponible'}));
  try{
    const localUser={id:'local-owner',username:'ejemplo_rd',email:account.email,displayName:account.displayName};
    assert.equal((await h.licensing.onLocalAuth(localUser,'pw')).connected,true);
    online=false;
    assert.equal((await h.licensing.onLocalAuth(localUser,'pw')).connected,false);
    const cached=await h.licensing.getCached(localUser.id);
    assert.equal(cached.token,session.token);
    assert.equal(cached.centralUserId,account.id);
    assert.equal(cached.connected,false);
    assert.equal(await h.licensing.canUse(localUser.id),true);
  }finally{await h.cleanup()}
});
test('A new registration is rejected when Cloudflare reports a duplicate',async()=>{
  const h=await harness(async()=>fakeResponse(409,{ok:false,error:'GREÑA ID ya registrado'}));
  try{
    await assert.rejects(h.licensing.registerCentralIdentity(account,'pw'),{status:409});
    const empty=await h.licensing.getCached('uncreated-user');
    assert.equal(!!empty.token,false);
  }finally{await h.cleanup()}
});
