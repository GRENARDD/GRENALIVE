'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const src=path=>readFileSync(join(root,path),'utf8');

test('Desktop executable and all in-app brand marks share the exact transparent GREÑA G',()=>{
  const source=src('assets/grena-g-icon.png.base64').trim();
  const favicon=src('favicon.svg');
  assert.ok(source.startsWith('iVBORw0KGgo'), 'Master artwork is a PNG');
  const png=Buffer.from(source,'base64');
  assert.ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
  assert.equal(png.readUInt32BE(16),256);
  assert.equal(png.readUInt32BE(20),256);
  assert.ok(favicon.includes('href="data:image/png;base64,'+source+'"'),
    'Browser favicon must contain the same master PNG, not a different G illustration');
  const builder=src('desktop-build/build-grena-icon.py');
  assert.match(builder,/grena-g-icon\.png\.base64/);
  assert.match(builder,/grena-g\.ico/);
  assert.match(builder,/installerIcon/);
  assert.match(builder,/uninstallerIcon/);
  assert.match(builder,/win\["icon"\]/);
});

test('Main UI, login, modules, floating view and mobile show the G instead of a text placeholder',()=>{
  const brandPages=[
    'index.html','login.html','alerts.html','gift-catalog.html',
    'mode.html','afterglow-studio.html','desktop-bubble.html',
    'mobile.html','mobile-device.html'
  ];
  for(const path of brandPages){
    const page=src(path);
    assert.match(page,/src="\/favicon\.svg\?v=529"/,path+' must display the G');
    assert.match(page,/rel="icon"[^>]*href="\/favicon\.svg\?v=529"/,path+' must use the G favicon');
  }
  assert.doesNotMatch(src('index.html'),/<div class="brand-mark">G<\/div>/);
  assert.doesNotMatch(src('login.html'),/<div class="mark">G<\/div>/);
  assert.doesNotMatch(src('afterglow-studio.html'),/<div class="mark">G\/<\/div>/);
  assert.doesNotMatch(src('desktop-bubble.html'),/<div id="mark">G<\/div>/);
  assert.match(src('index.html'),/id="profileAvatar"/,'Do not replace the creator profile photo');
  assert.match(src('grena-gamer.css'),/grena-logo-mark/);
  const manifest=JSON.parse(src('assets/mobile.webmanifest'));
  assert.ok(manifest.icons.some(icon=>icon.src==='/favicon.svg'),
    'Mobile homescreen icon should use the same G');
});

test('Windows installer gate checks that the branded pages and favicon were actually packaged',()=>{
  const ci=src('.github/workflows/grena-desktop-from-kit.yml');
  assert.match(ci,/Verify bundled GREÑA G branding/);
  assert.match(ci,/favicon\.svg/);
  assert.match(ci,/grena-g-icon\.png\.base64/);
});
