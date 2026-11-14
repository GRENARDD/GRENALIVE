/*
 * GREÑA Auth · YouTube OAuth extension for Cloudflare Workers.
 *
 * Integrate BEFORE existing routes:
 *   const youtubeResponse = await handleYouTubeAuth(request, env);
 *   if (youtubeResponse) return youtubeResponse;
 *
 * Bind a KV namespace named YOUTUBE_OAUTH_KV to env.YOUTUBE_OAUTH_KV.
 * Set secrets GOOGLE_YOUTUBE_CLIENT_ID and GOOGLE_YOUTUBE_CLIENT_SECRET.
 * Set YOUTUBE_OAUTH_CALLBACK_URL to:
 *   https://grena-auth.omelicolon18.workers.dev/v1/callback/youtube
 * Add that exact callback under Google Cloud OAuth Authorized redirect URIs.
 * Set YOUTUBE_ALLOWED_REDIRECTS to a comma-separated allowlist of exact
 * desktop callback URLs (e.g. http://127.0.0.1:8787/oauth/youtube/callback).
 *
 * No Google Client Secret must ever be shipped in the desktop installer.
 */

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';

const json = (obj, status=200) => new Response(JSON.stringify(obj), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const textError = (message,status=400) => json({error:message},status);
const randomToken = (size=32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, x=>x.toString(16).padStart(2,'0')).join('');
};
const required = env => {
  if(!env.YOUTUBE_OAUTH_KV || !env.GOOGLE_YOUTUBE_CLIENT_ID ||
     !env.GOOGLE_YOUTUBE_CLIENT_SECRET || !env.YOUTUBE_OAUTH_CALLBACK_URL) {
    throw new Error('Google YouTube OAuth no está configurado en GREÑA Auth.');
  }
};
const allowedRedirect = (redirect,env) => {
  const allow = String(env.YOUTUBE_ALLOWED_REDIRECTS||'')
    .split(',').map(x=>x.trim()).filter(Boolean);
  return allow.includes(redirect) && (()=>{try{
    const u=new URL(redirect);
    return (u.protocol==='https:' || (u.protocol==='http:' &&
      ['localhost','127.0.0.1'].includes(u.hostname))) &&
      u.pathname==='/oauth/youtube/callback' && !u.hash && !u.search &&
      !u.username && !u.password;
  }catch{return false}})();
};
async function exchangeGoogleToken(params,env){
  const response=await fetch(GOOGLE_TOKEN,{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      ...params,
      client_id:env.GOOGLE_YOUTUBE_CLIENT_ID,
      client_secret:env.GOOGLE_YOUTUBE_CLIENT_SECRET
    })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !data.access_token)throw new Error(
    data.error_description||data.error||'Google rechazó el intercambio OAuth.');
  return data;
}
const withQuery=(base,params)=>{
  const u=new URL(base);
  for(const [k,v] of Object.entries(params))if(v!==undefined && v!=='')u.searchParams.set(k,v);
  return u.toString();
};

/**
 * Handles only the four YouTube endpoints. Return null to let the existing
 * GREÑA Auth router handle TikTok, Twitch, Kick, config, and all other routes.
 */
export async function handleYouTubeAuth(request,env){
  const url=new URL(request.url),path=url.pathname;
  const methods={
    '/v1/authorize/youtube':'GET',
    '/v1/callback/youtube':'GET',
    '/v1/exchange/youtube':'POST',
    '/v1/refresh/youtube':'POST'
  };
  if(!(path in methods))return null;
  if(request.method!==methods[path])return textError('Método no permitido.',405);
  try{
    required(env);
    if(path==='/v1/authorize/youtube'){
      const redirect=url.searchParams.get('redirect_uri')||'';
      const clientState=url.searchParams.get('state')||'';
      if(!allowedRedirect(redirect,env))return textError('redirect_uri de GREÑA no autorizado.',400);
      if(!/^[a-zA-Z0-9_-]{20,180}$/.test(clientState))return textError('Estado OAuth inválido.',400);
      const nonce=randomToken();
      await env.YOUTUBE_OAUTH_KV.put('yt:state:'+nonce,
        JSON.stringify({redirect,clientState,created:Date.now()}),{expirationTtl:600});
      return Response.redirect(withQuery(GOOGLE_AUTH,{
        client_id:env.GOOGLE_YOUTUBE_CLIENT_ID,
        redirect_uri:env.YOUTUBE_OAUTH_CALLBACK_URL,
        response_type:'code',
        scope:SCOPE,access_type:'offline',prompt:'select_account consent',state:nonce
      }),302);
    }
    if(path==='/v1/callback/youtube'){
      const nonce=url.searchParams.get('state')||'';
      if(!/^[0-9a-f]{64}$/.test(nonce))return textError('Estado inválido.');
      const key='yt:state:'+nonce, raw=await env.YOUTUBE_OAUTH_KV.get(key);
      if(!raw)return textError('La solicitud de autorización venció.');
      await env.YOUTUBE_OAUTH_KV.delete(key);
      const state=JSON.parse(raw);
      if(!allowedRedirect(state.redirect,env))return textError('Origen inválido.');
      const denied=url.searchParams.get('error');
      if(denied)return Response.redirect(withQuery(state.redirect,{
        state:state.clientState,error:denied
      }),302);
      const googleCode=url.searchParams.get('code')||'';
      if(!googleCode)return textError('Google no entregó código de autorización.');
      const tokens=await exchangeGoogleToken({
        code:googleCode,grant_type:'authorization_code',
        redirect_uri:env.YOUTUBE_OAUTH_CALLBACK_URL
      },env);
      const ticket=randomToken();
      // Short-lived one-time ticket. For strict atomic redemption,
      // use a Durable Object instead of KV in a multi-region deployment.
      await env.YOUTUBE_OAUTH_KV.put('yt:ticket:'+ticket,
        JSON.stringify({tokens,redirect:state.redirect}),{expirationTtl:120});
      return Response.redirect(withQuery(state.redirect,{
        code:ticket,state:state.clientState
      }),302);
    }
    if(path==='/v1/exchange/youtube'){
      const body=await request.json().catch(()=>null);
      const ticket=String(body?.code||'');
      const redirect=String(body?.redirect_uri||'');
      if(!/^[0-9a-f]{64}$/.test(ticket)||!allowedRedirect(redirect,env))return textError('Solicitud inválida.');
      const key='yt:ticket:'+ticket,raw=await env.YOUTUBE_OAUTH_KV.get(key);
      if(!raw)return textError('La autorización ya fue consumida o venció.',410);
      const data=JSON.parse(raw);
      if(data.redirect!==redirect)return textError('La redirección no coincide.',403);
      await env.YOUTUBE_OAUTH_KV.delete(key);
      return json({tokens:data.tokens});
    }
    if(path==='/v1/refresh/youtube'){
      const body=await request.json().catch(()=>null);
      const token=String(body?.refresh_token||'');
      if(!token||token.length>4096)return textError('Refresh token inválido.');
      const refreshed=await exchangeGoogleToken({
        refresh_token:token,grant_type:'refresh_token'
      },env);
      return json({tokens:{...refreshed,refresh_token:refreshed.refresh_token||token}});
    }
  }catch(err){
    // Avoid leaking Google token details, secrets, or error objects.
    return textError(err?.message==='Google YouTube OAuth no está configurado en GREÑA Auth.'?
      err.message:'No se pudo completar la autorización de YouTube.',503);
  }
  return null;
}

/** Merge into the existing /v1/config response (do not replace other providers). */
export function youtubeProviderConfig(env){
  return {enabled:!!(env.YOUTUBE_OAUTH_KV&&env.GOOGLE_YOUTUBE_CLIENT_ID&&
    env.GOOGLE_YOUTUBE_CLIENT_SECRET&&env.YOUTUBE_OAUTH_CALLBACK_URL&&
    env.YOUTUBE_ALLOWED_REDIRECTS)};
}
