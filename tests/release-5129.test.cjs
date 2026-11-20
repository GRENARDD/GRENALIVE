'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const source=p=>readFileSync(join(root,p),'utf8');

test('6.0.9 ships a real transparent 256px GREÑA G mark instead of default Electron branding',()=>{
 const svg=source('favicon.svg');
 assert.match(svg,/G Dorada/);
 assert.match(svg,/<linearGradient id="body"/);
 assert.equal(svg.includes('data:image/png;base64,'),false);
 const script=source('desktop-build/build-grena-icon.py');
 assert.match(script,/grena-g\.ico/);
 assert.match(script,/win\["icon"\]/);
 assert.match(script,/installerIcon/);
 assert.match(script,/uninstallerIcon/);
 const ci=source('.github/workflows/grena-desktop-from-kit.yml');
 assert.match(ci,/build-grena-icon\.py/);
 assert.match(ci,/Test-Path 'build\/grena-g\.ico'/);
 assert.ok(ci.indexOf('Generate and verify GOLD GREÑA G icon')<ci.indexOf('Build Windows installer safely'));
});

test('6.0.9 stable gate requires verified Windows build and preserves profiles during upgrade',()=>{
 const ci=source('.github/workflows/grena-desktop-from-kit.yml');
 const release=source('.github/workflows/grena-release-v6008.yml');
 const upgrade=source('desktop-build/verify-upgrade-6005-to-6009.ps1');
 assert.match(ci,/Verify official GREÑA Live 6\.0\.9 version on main/);
 assert.match(ci,/GRENA-LIVE-Installer-Windows-v6\.0\.9/);
 assert.match(upgrade,/\$oldVersion='6\.0\.5'/);
 assert.match(upgrade,/\$newVersion='6\.0\.9'/);
 assert.match(upgrade,/Assert-ProfilePreserved '6\.0\.5'/);
 assert.match(upgrade,/Assert-ProfilePreserved '6\.0\.9'/);
 assert.match(release,/VERSION: '6\.0\.8'/);
 assert.match(release,/\$TESTED_SHA/);
 assert.match(release,/gh run download/);
 assert.match(release,/gh release create/);
});

test('chat recovery is part of the 6.0.9 stable Windows build',()=>{
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

test('6.0.9 PR preview does not run the official-only in-place Windows upgrade gate',()=>{
 const workflow=source('.github/workflows/grena-desktop-from-kit.yml');
 assert.match(workflow,/Verify installed upgrade from GREÑA 6\.0\.5 to 6\.0\.9 preserves user data\s*\n\s*if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/Set distinct 6\.0\.9 release-candidate version for preview installer/);
 assert.match(workflow,/Verify official GREÑA Live 6\.0\.9 version on main/);
});
