'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const src=path=>readFileSync(join(root,path),'utf8');

test('New GREÑA 6.0 browser branding uses transparent gold SVG rather than the old blue logo',()=>{
  const favicon=src('favicon.svg');
  assert.match(favicon,/<svg[^>]+viewBox="0 0 512 512"/);
  assert.match(favicon,/<linearGradient id="body"/);
  assert.match(favicon,/fill="url\(#body\)"/);
  assert.doesNotMatch(favicon,/<rect[^>]*fill="(?:white|#fff|#ffffff)"/i);
  assert.doesNotMatch(favicon,/href="data:image\/png;base64/);
});

test('Legacy blue icon remains a valid Windows build source until EXE branding migration',()=>{
  const source=src('assets/grena-g-icon.png.base64').trim();
  assert.ok(source.startsWith('iVBORw0KGgo'));
  const png=Buffer.from(source,'base64');
  assert.ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  assert.equal(png.readUInt32BE(16),256);
  assert.equal(png.readUInt32BE(20),256);
  const builder=src('desktop-build/build-grena-icon.py');
  assert.match(builder,/grena-g-icon\.png\.base64/);
  assert.match(builder,/grena-g\.ico/);
  assert.match(builder,/installerIcon/);
  assert.match(builder,/uninstallerIcon/);
  assert.match(builder,/win\["icon"\]/);
});

test('Main UI, login, modules, floating view and mobile use the new browser logo',()=>{
  const brandPages=[
    'index.html','login.html','alerts.html','gift-catalog.html',
    'mode.html','afterglow-studio.html','desktop-bubble.html',
    'mobile.html','mobile-device.html'
  ];
  for(const path of brandPages){
    const page=src(path);
    assert.match(page,/src="\/favicon\.svg\?v=600"/,path+' must display the golden G');
    assert.match(page,/rel="icon"[^>]*href="\/favicon\.svg\?v=600"/,path+' must use the new favicon');
  }
  assert.doesNotMatch(src('index.html'),/<div class="brand-mark">G<\/div>/);
  assert.doesNotMatch(src('login.html'),/<div class="mark">G<\/div>/);
  assert.doesNotMatch(src('afterglow-studio.html'),/<div class="mark">G\/<\/div>/);
  assert.doesNotMatch(src('desktop-bubble.html'),/<div id="mark">G<\/div>/);
  assert.match(src('index.html'),/id="profileAvatar"/,'Do not replace the creator profile photo');
  assert.match(src('grena-gamer.css'),/grena-logo-mark/);
  const manifest=JSON.parse(src('assets/mobile.webmanifest'));
  assert.ok(manifest.icons.some(icon=>icon.src==='/favicon.svg'));
});

test('Windows installer gate checks that branded pages and favicon are packaged',()=>{
  const ci=src('.github/workflows/grena-desktop-from-kit.yml');
  assert.match(ci,/Verify bundled GREÑA G branding/);
  assert.match(ci,/favicon\.svg/);
  assert.match(ci,/grena-g-icon\.png\.base64/);
});
