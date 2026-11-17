'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const src=path=>readFileSync(join(root,path),'utf8');

test('GREÑA 6.0 browser and Windows EXE use the same GOLD SVG source',()=>{
  const favicon=src('favicon.svg');
  assert.match(favicon,/<svg[^>]+viewBox="0 0 512 512"/);
  assert.match(favicon,/<linearGradient id="body"/);
  assert.match(favicon,/fill="url\(#body\)"/);
  assert.doesNotMatch(favicon,/<rect[^>]*fill="(?:white|#fff|#ffffff)"/i);
  assert.doesNotMatch(favicon,/href="data:image\/png;base64/);
  const builder=src('desktop-build/build-grena-icon.py');
  const rasterizer=src('desktop-build/render-grena-g.cjs');
  const verifier=src('desktop-build/verify-grena-g-alpha.py');
  assert.match(builder,/root \/ "favicon\.svg"/);
  assert.match(builder,/render-grena-g\.cjs/);
  assert.doesNotMatch(builder,/grena-g-icon\.png\.base64/);
  assert.match(builder,/grena-g\.ico/);
  assert.match(builder,/installerIcon/);
  assert.match(builder,/uninstallerIcon/);
  assert.match(builder,/win\["icon"\]/);
  assert.match(rasterizer,/require\('@resvg\/resvg-js'\)/);
  assert.match(verifier,/gold\.getdata\(\)/);
  assert.match(verifier,/icon\.getdata\(\)/);
});

test('Main UI, login, modules, floating view and mobile use new gold logo, not blue',()=>{
  const brandPages=[
    'index.html','login.html','alerts.html','gift-catalog.html',
    'mode.html','afterglow-studio.html','desktop-bubble.html',
    'mobile.html','mobile-device.html'
  ];
  for(const path of brandPages){
    const page=src(path);
    assert.match(page,/src="\/favicon\.svg\?v=600"/,path+' must display GOLD G');
    assert.match(page,/rel="icon"[^>]*href="\/favicon\.svg\?v=600"/,path+' must use GOLD G favicon');
  }
  assert.doesNotMatch(src('index.html'),/<div class="brand-mark">G<\/div>/);
  assert.doesNotMatch(src('login.html'),/<div class="mark">G<\/div>/);
  assert.doesNotMatch(src('desktop-bubble.html'),/<div id="mark">G<\/div>/);
  assert.match(src('index.html'),/id="profileAvatar"/,'Do not replace the profile photograph');
  assert.match(src('grena-gamer.css'),/grena-logo-mark/);
  const manifest=JSON.parse(src('assets/mobile.webmanifest'));
  assert.ok(manifest.icons.some(icon=>icon.src==='/favicon.svg'),
    'Mobile home screen uses the same gold logo');
});

test('Windows installer verifies packaged favicon and generated ICO from gold source',()=>{
  const ci=src('.github/workflows/grena-desktop-from-kit.yml');
  assert.match(ci,/Verify bundled GREÑA G branding/);
  assert.match(ci,/Get-FileHash -LiteralPath 'favicon\.svg'/);
  assert.match(ci,/verify-grena-g-alpha\.py/);
  assert.match(ci,/@resvg\/resvg-js@2\.6\.2/);
  assert.match(ci,/src="\/favicon\.svg\?v=600"/);
  assert.doesNotMatch(ci,/if \(!\$favicon\.Contains\('data:image\/png;base64,'/);
});
