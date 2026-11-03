import {Container} from '@cloudflare/containers';

/**
 * Dedicated Cloudflare Container for GREÑA Mobile; not the GREÑA PC Worker.
 * Node connector is isolated, preserving GREÑA Desktop and D1 tables.
 * Requires Cloudflare Workers Paid; do not auto-deploy.
 */
export class GrenaMobileContainer extends Container {
  defaultPort=8080;
  sleepAfter='30m';
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health'&&request.method==='GET'){
      return env.MOBILE_CONTAINER.getByName('grena-live-mobile-beta').fetch(request);
    }
    if(!url.pathname.startsWith('/api/mobile/')||!['GET','POST'].includes(request.method)){
      return Response.json({ok:false,error:'Ruta no encontrada'}, {status:404});
    }
    // Actual token validation happens inside Node via the existing GREÑA ID Worker.
    // Keep the relay off the public unauthenticated path.
    if(!/^Bearer [A-Za-z0-9_-]{32,100}$/.test(request.headers.get('Authorization')||'')){
      return Response.json({ok:false,error:'Inicia sesión con GREÑA ID.'},{status:401});
    }
    return env.MOBILE_CONTAINER.getByName('grena-live-mobile-beta').fetch(request);
  }
};
