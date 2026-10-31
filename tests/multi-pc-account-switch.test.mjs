import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const avatar=readFileSync(new URL('../grena-avatar.js',import.meta.url),'utf8');
const login=readFileSync(new URL('../login.html',import.meta.url),'utf8');
const localServer=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const worker=readFileSync(new URL('../cloudflare/licenses/src/worker.mjs',import.meta.url),'utf8');

test('Authenticated profile menu offers switching accounts and creating another GREÑA ID',()=>{
 assert.match(avatar,/data-a="switch">[^<]*Cambiar GREÑA ID/);
 assert.match(avatar,/data-a="new-account">[^<]*Crear otro GREÑA ID/);
 assert.match(avatar,/await fetch\('\/api\/account\/logout',[\s\S]*method:'POST'/);
 assert.match(avatar,/location\.replace\(a==='new-account'\?'\/login\.html#register':'\/login\.html#login'\)/);
 assert.match(avatar,/key='grena-avatar:'\+d\.user\.id/);
});

test('Registration shortcut shows the form and never silently redirects to an old session',()=>{
 assert.match(login,/if\(location\.hash==='#register'\)tab\('register'\)/);
 assert.match(login,/if\(location\.hash==='#register'\)return; if\(d\.authenticated/);
 assert.match(login,/\/api\/account\/register/);
 assert.match(login,/Crear otra cuenta no borra las anteriores/);
});

test('Local registration preserves other profiles and switching still requires credentials',()=>{
 assert.match(localServer,/usersStore\.users\.push\(user\);await persistUsers\(\)/);
 assert.match(localServer,/await activateProfile\(user\.id\);await createSession\(res,user\)/);
 assert.match(localServer,/await verifyPasswordAsync\(password,user\)/);
 assert.match(localServer,/if\(pathname==='\/api\/account\/logout'/);
 assert.match(localServer,/await deactivateProfile\(\)/);
});

test('D1 trial, paid and beta access follow authenticated user, not original device',()=>{
 assert.doesNotMatch(worker,/license_device_id!==deviceId/);
 assert.match(worker,/const initialDevice=null/);
 assert.match(worker,/const cleanLicense=\(u,deviceId\)=>/);
 assert.match(worker,/async function bindPendingDevice\(env,u,deviceId\)\{\s*return u;/);
 assert.match(worker,/deviceBound:false,license:cleanLicense\(u\)/);
});
