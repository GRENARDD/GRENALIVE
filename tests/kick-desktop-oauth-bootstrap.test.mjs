import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Kick desktop opens only a local authorized bootstrap before external OAuth',()=>{
 const ui=read('grena-v4-live.js'),patch=read('desktop-build/fix_oauth.py'),server=read('server.mjs');
 assert.match(ui,/window\.open\('\/oauth\/kick\/ready'/);
 assert.doesNotMatch(ui,/window\.open\('about:blank','grena_oauth_kick'/);
 assert.match(ui,/api\/oauth\/kick\/prepare/);
 assert.match(ui,/persistent\.status\?\.kick\?\.authenticated/);
 assert.match(patch,/target\.pathname === '\/oauth\/kick\/ready'/);
 assert.match(server,/pathname==='\/oauth\/kick\/ready'&&req\.method==='GET'/);
 assert.match(server,/if\(!sessionUser\(req\)\)return callbackPage/);
 assert.match(server,/pathname==='\/api\/oauth\/kick\/prepare'&&req\.method==='POST'/);
});
