'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('owner-only administration buttons navigate within GREÑA, not blocked popups',()=>{
 const js=file('grena-v4-live.js');
 assert.match(js,/if\(owner\|\|status\.isAdmin===true\)actions\.unshift\(\{label:'Gestionar usuarios y licencias'/);
 assert.match(js,/if\(a==='admin'\)/);
 const license=js.slice(js.indexOf("async function openMyLicense(){"),js.indexOf("function profileModal(){"));
 const profile=js.slice(js.indexOf("function profileModal(){"),js.indexOf("el('profileTrigger').addEventListener"));
 assert.match(license,/location\.assign\('\/license-admin\.html'\)/);
 assert.match(profile,/location\.assign\('\/license-admin\.html'\)/);
 assert.doesNotMatch(license,/window\.open\('\/license-admin\.html'/);
 assert.doesNotMatch(profile,/window\.open\('\/license-admin\.html'/);
});
test('admin authorization is still enforced on the server',()=>{
 const server=file('server.mjs');
 assert.match(server,/if\(pathname==='\/license-admin\.html'/);
 assert.match(server,/licensing\.isAdministrator\(u\.id\)/);
 assert.match(server,/Administración reservada a cuentas administradoras verificadas por GREÑA ID/);
 const page=file('license-admin.html');
 assert.match(page,/Gestionar|Administración de usuarios/);
 assert.match(page,/location\.assign\('\/'\)/);
});
