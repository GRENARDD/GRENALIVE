import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=file=>readFileSync(new URL(file,import.meta.url),'utf8');
test('license Worker mounts dynamics only after authenticating central bearer',()=>{
 const worker=source('../cloudflare/licenses/src/worker.mjs');
 const module=source('../cloudflare/licenses/src/dynamics.mjs');
 assert.match(worker,/import \{dynamicsRequest\} from '\.\/dynamics\.mjs'/);
 assert.match(worker,/if\(path\.startsWith\('\/api\/dynamics\/rooms'\)\)\{\s*const user=await sessionUser\(env,req\);\s*return dynamicsRequest\(req,env,user\)/);
 assert.match(module,/if\(!identity\?\.id\)return bad\('GREÑA ID requerido',401\)/);
 assert.match(module,/SELECT id FROM users WHERE username=\? AND disabled=0/);
});
test('central follows and votes are idempotent and isolated to authenticated streamer',()=>{
 const src=source('../cloudflare/licenses/src/dynamics.mjs');
 assert.match(src,/UNIQUE\(streamer_id,source_platform,source_event_key\)/);
 assert.match(src,/UNIQUE|constraint/);
 assert.match(src,/WHERE room_id=\? AND streamer_id=\? AND state='active'/);
 assert.match(src,/bind\(room,identity\.id,stamp\(\)\)/);
 assert.match(src,/PRIMARY KEY\(event_id,platform,viewer_id\)/);
 assert.match(src,/ON CONFLICT\(event_id,platform,viewer_id\) DO UPDATE SET choice/);
 assert.match(src,/WHERE i\.id=\? AND i\.recipient_id=\?/);
});
test('desktop never forwards central GREÑA session token to browser',()=>{
 const licensing=source('../grena-licensing.mjs');
 const desktop=source('../server.mjs');
 assert.match(licensing,/return fetchCentral\(path,method,payload,c\.token\)/);
 assert.match(desktop,/licensing\.requestDynamics\(me\.id,centralPath,req\.method,input\)/);
 assert.match(desktop,/minecraftForwardFollow/);
 assert.match(desktop,/minecraftForwardVote/);
 assert.match(desktop,/if\(!eventId\)return/);
});
