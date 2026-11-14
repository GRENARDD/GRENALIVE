import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('top navigation includes a real Dinámicas route and never intercepts missing modules',()=>{
 const html=file('index.html'),js=file('control-center.js');
 assert.match(html,/data-module="dynamics"[^>]*title="Dinámicas Minecraft"/);
 assert.match(js,/dynamics:\{path:'\/dynamics\.html\?embed=1'/);
 assert.match(js,/if\(!moduleMap\[key\]\|\|!moduleLayer\|\|!moduleFrame\)return/);
 assert.match(js,/e\.preventDefault\(\);openModule\(key\)/);
});
test('nav buttons expose both accessible names and visible labels',()=>{
 const html=file('index.html'),css=file('grena-gamer.css');
 for(const label of ['Inicio','Móvil','En vivo','Alertas','Widgets','Juegos','Cámaras','Regalos'])assert.ok(html.includes('class="gx-nav-label">'+label+'</span>'),label);
 assert.match(css,/\.primary-nav \.top-link \.gx-nav-label\{display:block!important\}/);
 assert.match(css,/\.primary-nav \.top-link\.active/);
});
test('only one image exists inside the large account avatar',()=>{
 const html=file('index.html'),js=file('grena-avatar.js'),css=file('grena-gamer.css');
 assert.match(html,/id="profileAvatar"/);
 assert.doesNotMatch(html,/id="profileNamePhoto"/);
 assert.doesNotMatch(js,/profileNamePhoto/);
 assert.match(js,/av\.style\.backgroundImage=d/);
 assert.match(css,/width:46px!important;height:46px!important/);
});

test('official v5.1.27 release gate is not the PR preview artifact',()=>{
 const workflow=file('.github/workflows/grena-desktop-from-kit.yml');
 const release=file('.github/workflows/grena-release-v5127.yml');
 const upgrade=file('desktop-build/verify-upgrade-5117-to-5127.ps1');
 assert.match(workflow,/Set official 5\.1\.27 version on main/);
 assert.match(workflow,/GRENA-LIVE-Installer-Windows-v5\.1\.27/);
 assert.match(workflow,/verify-upgrade-5117-to-5127\.ps1/);
 assert.match(release,/Publish official v5\.1\.27 release/);
 assert.match(release,/Verify production GREÑA ID Worker has secure shared rooms/);
 assert.match(upgrade,/\$newVersion='5\.1\.27'/);
});
