'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const src=name=>readFileSync(join(__dirname,'..',name),'utf8');

test('Administración no contiene bodegas ni asignación de APIs de Fish Audio',()=>{
 const ui=src('license-admin.html');
 assert.doesNotMatch(ui,/id="ownerFishPanel"|id="fishAdminPanel"|data-owner-fish|fishAdminForm/);
 assert.match(ui,/Usuarios GREÑA ID/);
 assert.match(ui,/isGithubActionsTestUser/);
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
test('Compilación estable publica instalador 5.1.5',()=>{
 const update=src('desktop-build/fix_official_updates.py');
 assert.match(update,/pkg\['version'\]=tag\[1:\] if tag else '5\.1\.3'/);
 const gh=src('.github/workflows/grena-desktop-from-kit.yml');
 assert.match(gh,/GRENA-LIVE-Installer-Windows-v5\.1\.5/);
});
