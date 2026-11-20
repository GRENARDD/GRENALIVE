import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('V4 keeps the original nine modules while real Minecraft dynamics are connected to their own page',()=>{
 const html=file('index.html'),adapter=file('grena-v4-live.js');
 assert.match(html,/id="nav"/);
 assert.match(html,/data-l="Juegos"/);
 assert.match(html,/pg\(6,/);
 assert.match(adapter,/api\/dynamics\/minecraft/);
 assert.match(adapter,/action:'enable'/);
});
test('V4 original side icons have their accessible labels and open every section',()=>{
 const html=file('index.html');
 for(const label of ['Inicio','Flotante','Móvil','Alertas','Widgets','Juegos','Cámaras','Regalos'])assert.ok(html.includes('data-l="'+label+'"'),label);
 assert.doesNotMatch(html,/data-l="En vivo"/);
 assert.match(html,/id="nav" aria-label="Secciones"/);
 assert.match(html,/const TT=\["Centro de mando"/);
});
test('V4 profile stores one GREÑA ID photograph inside the original profile circle',()=>{
 const html=file('index.html'),adapter=file('grena-v4-live.js');
 assert.match(html,/id="userAvatar"/);
 assert.match(html,/id="profileTrigger"/);
 assert.match(adapter,/grena-avatar:/);
 assert.match(adapter,/avatar\.style\.backgroundImage/);
 assert.doesNotMatch(html,/id="profileNamePhoto"/);
});

test('official v5.1.29 release gate is separate from PR previews and keeps historical 5.1.27 release',()=>{
 const workflow=file('.github/workflows/grena-desktop-from-kit.yml');
 const release=file('.github/workflows/grena-release-v6008.yml');
 const upgrade=file('desktop-build/verify-upgrade-6005-to-6009.ps1');
 const previousRelease=file('.github/workflows/grena-release-v5127.yml');
 assert.match(workflow,/Verify official GREÑA Live 6\.0\.9 version on main/);
 assert.match(workflow,/GRENA-LIVE-Installer-Windows-v6\.0\.9/);
 assert.match(workflow,/verify-upgrade-6005-to-6009\.ps1/);
 assert.match(release,/Publish official v6\.0\.9 release/);
 assert.match(release,/Verify production GREÑA ID Worker has secure shared rooms/);
 assert.match(upgrade,/\$oldVersion='6\.0\.5'/);
 assert.match(upgrade,/\$newVersion='6\.0\.9'/);
 assert.match(previousRelease,/VERSION: '5\.1\.27'/);
});