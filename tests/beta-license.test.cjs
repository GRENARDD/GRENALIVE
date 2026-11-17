'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('BETA license can be granted indefinitely and revoked centrally',()=>{
 const w=src('cloudflare/licenses/src/worker.mjs');
 assert.match(w,/BETA_TAG='BETA'/);
 assert.match(w,/license_expires_at=NULL,license_device_id=NULL,license_revoked_at=NULL,license_code_id=\?/);
 assert.match(w,/active:!revokedAt&&\(beta\|\|expiresAt>now\(\)\)/);
 assert.match(w,/license_code_id='BETA'/);
 assert.match(w,/license_revoked_at=\?/);
 assert.match(w,/sessionUser\(env,req\)/);
});
test('BETA appears only when allowed with active central license, and owner stays separate in V4',()=>{
 const admin=src('license-admin.html'),html=src('index.html'),license=src('license.html'),local=src('grena-licensing.mjs'),adapter=src('grena-v4-live.js');
 assert.match(admin,/<option value="BETA">/);
 assert.match(admin,/✦ BETA · SIN VENCIMIENTO/);
 assert.match(html,/id="licenseBadge"/);
 assert.match(adapter,/license\.permanentAccess===true/);
 assert.match(adapter,/license\.allowed===true&&licenceRecord\.kind==='beta'&&licenceRecord\.active===true/);
 assert.match(license,/BETA · ACCESO SIN VENCIMIENTO/);
 assert.match(local,/local\.license\.kind!=='beta'/);
});