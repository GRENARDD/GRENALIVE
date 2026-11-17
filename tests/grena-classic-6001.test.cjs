'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const source=p=>readFileSync(join(root,p),'utf8');

test('Classic 6.0.1 restores the exact pre-6.0 UI without the V6 Premium override',()=>{
  const pkg=JSON.parse(source('package.json'));
  const index=source('index.html');
  assert.equal(pkg.version,'6.0.1');
  assert.match(index,/<main class="workspace">/);
  assert.match(index,/id="chatFrame"/);
  assert.match(index,/id="soundboardStrip"/);
  assert.match(index,/id="profileAvatar"/);
  assert.match(index,/id="activityFeed"/);
  assert.match(index,/id="totalViewers"/);
  assert.doesNotMatch(index,/grena-premium-v6\.(?:css|js)/);
  assert.equal(existsSync(join(root,'grena-premium-v6.css')),false);
  assert.equal(existsSync(join(root,'grena-premium-v6.js')),false);
});

test('Classic release never reuses 6.0.0 binaries or mutates the previous stable tag',()=>{
  const ci=source('.github/workflows/grena-desktop-from-kit.yml');
  const release=source('.github/workflows/grena-release-v6001.yml');
  const upgrade=source('desktop-build/verify-upgrade-6000-to-6001.ps1');
  assert.match(ci,/6\.0\.1-rc\.1/);
  assert.match(ci,/GRENA-LIVE-Installer-Windows-v6\.0\.1/);
  assert.match(ci,/Verify installed upgrade from GREÑA 6\.0\.0 to 6\.0\.1/);
  assert.match(ci,/electron-builder --win nsis --x64 --publish never/);
  assert.match(release,/VERSION: '6\.0\.1'/);
  assert.match(release,/test "\$\(git rev-parse HEAD\)" = "\$TESTED_SHA"/);
  assert.match(release,/gh run download "\$TESTED_RUN"/);
  assert.match(release,/gh release create/);
  assert.match(upgrade,/\$oldVersion='6\.0\.0'/);
  assert.match(upgrade,/\$newVersion='6\.0\.1'/);
  assert.match(upgrade,/Assert-ProfilePreserved '6\.0\.0'/);
  assert.match(upgrade,/Assert-ProfilePreserved '6\.0\.1'/);
  assert.match(upgrade,/Get-FileHash -Algorithm SHA256/);
});
