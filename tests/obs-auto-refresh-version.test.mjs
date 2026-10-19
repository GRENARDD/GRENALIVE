import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const overlay=read('afterglow-overlay.html');
const backend=read('server.mjs');
function inline(){
 const scripts=[...overlay.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
 assert.equal(scripts.length,1);
 return scripts[0];
}
test('OBS keeps the same private vertical/horizontal source URLs',()=>{
 assert.match(overlay,/qp\.get\('layout'\)==='horizontal'\?'horizontal':'vertical'/);
 assert.match(overlay,/qp\.get\('obs'\)\|\|''/);
 assert.ok(overlay.includes("new WebSocket(proto+'://'+location.host+'/'+obsQuery)"));
 assert.match(overlay,/d\.type==='alert'/);
 assert.match(overlay,/d\.type==='afterglow-settings'/);
});
test('version endpoint requires the existing account session or OBS token',()=>{
 assert.match(backend,/OBS_PUBLIC_API=new Set\(\['\/api\/overlay-version'/);
 assert.match(backend,/if\(pathname==='\/api\/overlay-version'&&req\.method==='GET'\)return json\(res,200/);
 assert.match(backend,/if\(method==='GET'&&OBS_PUBLIC_API\.has\(pathname\)&&obsAuthorized\(req\)\)return true/);
 assert.match(backend,/OVERLAY_BUILD_ID=String\(process\.env\.RAILWAY_GIT_COMMIT_SHA/);
 assert.match(backend,/overlayVersion:OVERLAY_BUILD_ID/);
});
test('source is stamped with release and all static files disable HTTP cache',()=>{
 assert.match(overlay,/<meta name="grena-release" content="GRENA_RELEASE_PLACEHOLDER">/);
 assert.match(backend,/file==='afterglow-overlay\.html'\?data\.toString\('utf8'\)\.replace\('GRENA_RELEASE_PLACEHOLDER',OVERLAY_BUILD_ID\):data/);
 assert.match(backend,/'cache-control':'no-store, max-age=0'/);
});
test('overlay checks for updates periodically and on WebSocket handshake/reconnect',()=>{
 new vm.Script(inline());
 assert.match(overlay,/setInterval\(checkOverlayRelease,20000\)/);
 assert.match(overlay,/socket\.onopen=\(\)=>\{backoff=1500;checkOverlayRelease\(\)\}/);
 assert.match(overlay,/if\(d\.type==='hello'&&d\.overlayVersion\)considerRelease\(d\.overlayVersion\)/);
 assert.match(overlay,/clearInterval\(versionCheckTimer\)/);
});
test('autorefresh preserves OBS parameters and waits for animation and queue to finish',()=>{
 const code=inline();
 const start=code.indexOf('let runningRelease=');
 const end=code.indexOf('function safe(v)',start);
 assert.ok(start>0&&end>start);
 const url='https://live.example.com/afterglow-overlay.html?layout=vertical&obs=test-secrettoken';
 const redirects=[];
 const context={
  document:{querySelector(){return {content:'build-abc123'}}},
  URL,location:{href:url},
  window:{location:{replace(to){redirects.push(to)}}},
  pending:[],working:false,obsQuery:'?obs=test-secrettoken',
  fetch:async()=>({ok:true,json:async()=>({ok:true,version:'build-def456'})})
 };
 const api=vm.runInNewContext(code.slice(start,end)+';({considerRelease,refreshWhenIdle,checkOverlayRelease})',context);
 context.working=true;api.considerRelease('build-def456');
 assert.equal(redirects.length,0);
 context.working=false;context.pending.push({event:'gift'});api.refreshWhenIdle();
 assert.equal(redirects.length,0);
 context.pending.pop();api.refreshWhenIdle();
 assert.equal(redirects.length,1);
 const updated=new URL(redirects[0]);
 assert.equal(updated.searchParams.get('obs'),'test-secrettoken');
 assert.equal(updated.searchParams.get('layout'),'vertical');
 assert.equal(updated.searchParams.get('__grena_release'),'build-def456');
});
