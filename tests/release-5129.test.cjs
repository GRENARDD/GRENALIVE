'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const source=p=>readFileSync(join(root,p),'utf8');

test('5.1.29 ships a real transparent 256px GREÑA G mark instead of default Electron branding',()=>{
 const b64=source('assets/grena-g-icon.png.base64').trim();
 const png=Buffer.from(b64,'base64');
 assert.ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 assert.equal(png.readUInt32BE(16),256);
 assert.equal(png.readUInt32BE(20),256);
 const script=source('desktop-build/build-grena-icon.py');
 assert.match(script,/grena-g\.ico/);
 assert.match(script,/win\["icon"\]/);
 assert.match(script,/installerIcon/);
 assert.match(script,/uninstallerIcon/);
 const ci=source('.github/workflows/grena-desktop-from-kit.yml');
 assert.match(ci,/build-grena-icon\.py/);
 assert.match(ci,/Test-Path 'build\/grena-g\.ico'/);
 assert.ok(ci.indexOf('Generate and verify original GREÑA G icon')<ci.indexOf('Build Windows installer safely'));
});

test('5.1.29 stable gate requires verified Windows build and preserves profiles during upgrade',()=>{
 const ci=source('.github/workflows/grena-desktop-from-kit.yml');
 const release=source('.github/workflows/grena-release-v6001.yml');
 const upgrade=source('desktop-build/verify-upgrade-6000-to-6001.ps1');
 assert.match(ci,/Verify official GREÑA Live 6\.0\.1 version on main/);
 assert.match(ci,/GRENA-LIVE-Installer-Windows-v6\.0\.1/);
 assert.match(upgrade,/\$oldVersion='6\.0\.0'/);
 assert.match(upgrade,/\$newVersion='6\.0\.1'/);
 assert.match(upgrade,/Assert-ProfilePreserved '6\.0\.0'/);
 assert.match(upgrade,/Assert-ProfilePreserved '6\.0\.1'/);
 assert.match(release,/VERSION: '6\.0\.1'/);
 assert.match(release,/\$TESTED_SHA/);
 assert.match(release,/gh run download/);
 assert.match(release,/gh release create/);
});

test('chat recovery is part of the 5.1.29 stable Windows build',()=>{
 const ci=source('.github/workflows/grena-desktop-from-kit.yml');
 const server=source('chat-server.mjs');
 const guard=source('chat-realtime-guard.mjs');
 assert.match(ci,/chat-realtime-guard\.mjs/);
 assert.match(source('desktop-build/fix_startup.py'),/chat-realtime-guard\.mjs/);
 assert.match(server,/createRealtimeTikTokChatRouter/);
 assert.match(server,/createRealtimeSocketWatchdog/);
 assert.match(guard,/onDecoded\(method,decoded\)/);
 assert.match(server,/CHAT_HISTORY_LIMIT = 3000/);
 assert.match(server,/ttSocialLooksLikeFollow/);
 assert.match(server,/emitFollow\(data,'social-fallback'\)/);
 assert.match(server,/WebcastEvent\.FOLLOW/);
});

test('5.1.29 PR preview does not run the official-only in-place Windows upgrade gate',()=>{
 const workflow=source('.github/workflows/grena-desktop-from-kit.yml');
 assert.match(workflow,/Verify installed upgrade from GREÑA 6\.0\.0 to 6\.0\.1 preserves user data\s*\n\s*if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/Set distinct 6\.0\.1 release-candidate version for preview installer/);
 assert.match(workflow,/Verify official GREÑA Live 6\.0\.1 version on main/);
});
