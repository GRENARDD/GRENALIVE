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

test('official v5.1.29 release gate is separate from PR previews and keeps historical 5.1.27 release',()=>{
 const workflow=file('.github/workflows/grena-desktop-from-kit.yml');
 const release=file('.github/workflows/grena-release-v6001.yml');
 const upgrade=file('desktop-build/verify-upgrade-6000-to-6001.ps1');
 const previousRelease=file('.github/workflows/grena-release-v5127.yml');
 assert.match(workflow,/Verify official GREÑA Live 6\.0\.1 version on main/);
 assert.match(workflow,/GRENA-LIVE-Installer-Windows-v6\.0\.1/);
 assert.match(workflow,/verify-upgrade-6000-to-6001\.ps1/);
 assert.match(release,/Publish official v6\.0\.1 release/);
 assert.match(release,/Verify production GREÑA ID Worker has secure shared rooms/);
 assert.match(upgrade,/\$oldVersion='6\.0\.0'/);
 assert.match(upgrade,/\$newVersion='6\.0\.1'/);
 assert.match(previousRelease,/VERSION: '5\.1\.27'/);
});
