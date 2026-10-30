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
test('BETA appears only with active authorization; owner stays separate',()=>{
 const a=src('license-admin.html');
 const i=src('index.html');
 const l=src('license.html');
 const local=src('grena-licensing.mjs');
 assert.match(a,/<option value="BETA">/);
 assert.match(a,/✦ BETA · SIN VENCIMIENTO/);
 assert.match(i,/id="betaLicenseBadge"/);
 assert.match(i,/d\.allowed===true&&d\.license\?\.kind==='beta'&&d\.license\?\.active===true/);
 assert.match(l,/BETA · ACCESO SIN VENCIMIENTO/);
 assert.match(local,/local\.license\.kind!=='beta'/);
});
