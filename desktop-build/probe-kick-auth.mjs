// Diagnostic only: inspect the public GREÑA Auth Kick OAuth handshake without
// credentials, personal data, secrets, or following third-party redirects.
import {readFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
const cfg=JSON.parse(readFileSync(new URL('../grena-public-config.json',import.meta.url),'utf8'));
const service=new URL(cfg.authServiceUrl);
if(service.protocol!=='https:' || service.hostname!=='grena-auth.omelicolon18.workers.dev')throw Error('Untrusted GREÑA Auth host');
const verifier=randomBytes(32).toString('base64url');
const challenge=createHash('sha256').update(verifier).digest('base64url');
for(const [name,path] of [
 ['configuration','/v1/config'],
 ['kick authorization','/v1/authorize/kick?'+new URLSearchParams({
   redirect_uri:'http://127.0.0.1:8787/oauth/kick/callback',
   state:randomBytes(16).toString('base64url'),
   code_challenge:challenge
 })]
]){
 try{
   const r=await fetch(new URL(path,service),{redirect:'manual',signal:AbortSignal.timeout(9000)});
   if(name==='configuration'){
     const d=await r.json().catch(()=>({}));
     const p=d?.providers?.kick||{};
     console.log('GRENA_AUTH_CHECK',JSON.stringify({step:name,status:r.status,kickConfigured:!!p.enabled,hasClientId:!!p.clientId,keys:Object.keys(p).filter(x=>!/(secret|token|key)/i.test(x))}));
   }else{
     const loc=r.headers.get('location')||'';
     let dest=null;
     if(loc){const u=new URL(loc,service);dest={
       host:u.host,path:u.pathname,
       paramNames:[...u.searchParams.keys()],
       redirect_uri:u.searchParams.get('redirect_uri')||null,
       sacrificial_redirect:u.searchParams.has('redirect'),
       client_id_present:!!u.searchParams.get('client_id'),
       state_present:!!u.searchParams.get('state'),
       challenge_present:!!u.searchParams.get('code_challenge'),
       scope:u.searchParams.get('scope')||null
     }}
     let error='';
     if(r.status>=400){const data=await r.json().catch(()=>({}));error=String(data.error||data.message||'HTTP '+r.status).slice(0,120)}
     console.log('GRENA_AUTH_CHECK',JSON.stringify({step:name,status:r.status,dest,error}));
   }
 }catch(e){console.log('GRENA_AUTH_CHECK',JSON.stringify({step:name,networkError:String(e?.message||e).slice(0,120)}))}
}
