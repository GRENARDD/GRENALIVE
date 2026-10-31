'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const src=name=>readFileSync(join(__dirname,'..',name),'utf8');

test('Solo el propietario tiene en Administración el formulario de asignación Fish para otros GREÑA ID',()=>{
 const ui=src('license-admin.html');
 assert.match(ui,/id="fishOwnerAssignment"/);
 assert.match(ui,/id="assignFishForm"/);
 assert.match(ui,/id="assignFishKey" type="password"/);
 assert.match(ui,/request\('fish-credentials',\{username,apiKey,action:'set'\}\)/);
 assert.match(ui,/fishButton\.textContent=u\.fishConfigured/);
 assert.match(ui,/Usuarios GREÑA ID/);
 assert.match(ui,/isGithubActionsTestUser/);
 assert.doesNotMatch(ui,/id="ownerFishPanel"|data-owner-fish/);
});
test('Configuración permite vincular, cambiar y quitar la API propia sin mostrarla',()=>{
 const ui=src('grena-avatar.js');
 for(const action of ['Vincular API','Cambiar API','Quitar API'])assert.ok(ui.includes(action),action);
 assert.match(ui,/fishRequest\('POST'/);
 assert.match(ui,/fishRequest\('DELETE'/);
 assert.match(ui,/fishRequest\('GET'/);
 assert.match(ui,/getElementById|querySelector/);
 assert.match(ui,/syncStatus\.textContent=/);
 assert.match(ui,/fishPanel\.hidden=owner/);
});
test('Fish Audio ofrece siempre el botón de sincronización y verifica la cuenta correcta',()=>{
 const ui=src('grena-avatar.js');
 assert.match(ui,/<button data-s="fish-sync" type="button">Sincronizar con Cloudflare<\/button>/);
 assert.match(ui,/fishSync\.hidden=false/);
 assert.doesNotMatch(ui,/fishSync\.hidden=!fishConfigured\|\|!fishNeedsSync/);
 assert.match(ui,/state\.source==='cloud'&&state\.verified===true/);
 assert.match(ui,/state\.source==='device'&&state\.needsSync===true/);
 assert.match(ui,/fishRequest\('POST',undefined,'\/api\/license\/fish-credentials\/sync'\)/);
 assert.match(ui,/No hay API vinculada ni copia local recuperable/);
});
test('Compilación estable publica instalador 5.1.12',()=>{
 const update=src('desktop-build/fix_official_updates.py');
 assert.match(update,/pkg\['version'\]=tag\[1:\] if tag else '5\.1\.11'/);
 const gh=src('.github/workflows/grena-desktop-from-kit.yml');
 assert.match(gh,/GRENA-LIVE-Installer-Windows-v5\.1\.12/);
});
