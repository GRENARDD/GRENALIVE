// GREÑA Kick OAuth: harmless validation with an intentionally invalid code.
// Never stores, prints or sends real user tokens.
import {randomBytes,createHash} from 'node:crypto';
const url='https://grena-auth.omelicolon18.workers.dev';
const verifier=randomBytes(48).toString('base64url');
const challenge=createHash('sha256').update(verifier).digest('base64url');
const state=randomBytes(24).toString('base64url');
const redirect='http://127.0.0.1:8787/oauth/kick/callback';
const endpoint=url+'/v1/authorize/kick?'+new URLSearchParams({redirect_uri:redirect,state,code_challenge:challenge});
const start=await fetch(endpoint,{redirect:'manual',signal:AbortSignal.timeout(10000)});
const loc=start.headers.get('location')||'';
console.log('KICK_PROBE_START',JSON.stringify({status:start.status,validKickRedirect:loc.startsWith('https://id.kick.com/oauth/authorize'),hasNoRedirect:!loc}));
const t0=Date.now();
try{
 const result=await fetch(url+'/v1/exchange/kick',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({code:'grena-diagnostic-invalid-'+randomBytes(12).toString('hex'),redirect_uri:redirect,code_verifier:verifier}),
   signal:AbortSignal.timeout(12000),redirect:'manual'
 });
 const body=await result.text();
 let data={};try{data=JSON.parse(body)}catch{}
 const msg=String(data.error||data.message||data.error_description||'').slice(0,210);
 console.log('KICK_PROBE_EXCHANGE',JSON.stringify({status:result.status,tookMs:Date.now()-t0,invalidCodeAccepted:result.status<300,message:msg}));
 if(result.status<300)process.exitCode=2;
}catch(e){console.log('KICK_PROBE_EXCHANGE',JSON.stringify({networkError:e?.message||String(e),tookMs:Date.now()-t0}));process.exitCode=3}
