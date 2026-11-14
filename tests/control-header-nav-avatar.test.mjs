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
