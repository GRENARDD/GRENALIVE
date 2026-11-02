import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const overlay = read('afterglow-overlay.html');
const mascotFiles = ['assets/grena-mascot-alerts.html', 'assets/grenito-original-alerts.html'];
const premiumFiles = ['assets/grena-premium-catalog-obs.html', 'assets/grena-fullscreen-gift-obs.html'];

test('all four OBS premium scenes use explicit transparent Chromium root surfaces', () => {
  for (const path of [...mascotFiles, ...premiumFiles]) {
    const page = read(path);
    assert.match(page, /html\.grena-obs-mode\{color-scheme:normal!important\}/, path + ' has dark canvas');
    assert.match(page, /new URLSearchParams\(location\.search\)\.has\('obs'\)/, path + ' cannot enter OBS mode');
    assert.match(page, /html\.grena-obs-mode body/, path + ' lacks OBS body rule');
    assert.match(page, /background(?:-color)?:transparent!important|background-color:rgba\(0,0,0,0\)!important/, path);
  }
});

test('mascot scenes clear the stage and page without changing editor backgrounds', () => {
  for (const path of mascotFiles) {
    const page = read(path);
    assert.match(page, /body\{background:#14101f/, path + ' original editor changed');
    assert.match(page, /html\.grena-obs-mode #app,html\.grena-obs-mode #stw/, path);
    assert.match(page, /html\.grena-obs-mode #st,html\.grena-obs-mode #sv/, path);
    assert.match(page, /html\.grena-obs-mode #cv\{/, path);
    assert.match(page, /html\.grena-obs-mode #pn\{display:none!important\}/, path);
    assert.match(page, /window\.GRENITO=\{trigger\}/, path + ' original mascot trigger removed');
  }
});

test('premium catalog and fullscreen keep original effects but no OBS dark canvas', () => {
  const catalog = read(premiumFiles[0]);
  const fullscreen = read(premiumFiles[1]);
  assert.match(catalog, /\.card\{background:transparent!important;backdrop-filter:none!important/);
  assert.match(fullscreen, /\.dim\{display:none!important\}/);
  for (const page of [catalog, fullscreen]) {
    assert.match(page, /html\.grena-obs-mode \.stage/);
    assert.match(page, /html\.grena-obs-mode #fx/);
    assert.match(page, /background-color:rgba\(0,0,0,0\)!important/);
  }
});

test('the original OBS links and queue load the four transparent embedded players', () => {
  assert.match(overlay, /\.grena-premium-scene-frame\{[^}]*background:transparent!important;color-scheme:normal!important/);
  assert.equal((overlay.match(/scene\.setAttribute\('allowtransparency','true'\)/g) || []).length, 2);
  assert.equal((overlay.match(/scene\.style\.background='transparent'/g) || []).length, 2);
  for (const path of [...mascotFiles, ...premiumFiles]) assert.ok(overlay.includes('/'+path));
  assert.match(overlay, /root\.replaceChildren\(scene\)/);
  assert.match(overlay, /scene\.contentWindow\?\.postMessage/);
});
