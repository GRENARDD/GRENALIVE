import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('mobile QR refuses localhost links and requires a reachable gateway',()=>{
 const page=src('mobile-device.html');
 assert.match(page,/const accessible=d\.publicAccess\|\|d\.lanEnabled/);
 assert.match(page,/Todavía no disponible desde el teléfono/);
 assert.match(page,/Habilitar acceso por Wi-Fi local/);
 assert.match(page,/api\/mobile\/pair\/create/);
});

test('mobile live chat uses main server proxy when viewed from Wi-Fi',()=>{
 const page=src('mobile.html');
 assert.match(page,/remoteHost\?\(location\.protocol==='https:'/);
 assert.match(page,/location\.host\+'\/chat-ws'/);
 assert.match(page,/YouTube se vincula mediante Google OAuth desde la PC/);
 const server=src('server.mjs');
 assert.match(server,/pathname==='\/chat-ws'/);
});

test('YouTube broker is rechecked on login and diagnostics omit tokens',()=>{
 const source=src('server.mjs');
 assert.match(source,/async function beginOAuth\(/);
 assert.match(source,/if\(AUTH_SERVICE_URL\)await loadAuthServiceConfig\(\)/);
 const diag=source.split("if(pathname==='/api/youtube/diagnostic'")[1]?.split("if(pathname==='/api/obs-token'")[0]||'';
 assert.match(diag,/workerReachable/);
 assert.match(diag,/brokerEnabled/);
 assert.doesNotMatch(diag,/access_token|refresh_token|client_secret/i);
});

test('alert editor shows current sound and persists per-event audio',()=>{
 const alerts=src('alerts.html');
 for(const term of ['grenaSoundEditor','grenaSoundType','grenaSoundCurrent','grenaSoundUpload','grenaSoundPreview','grenaSoundSave','grenaSoundReset'])assert.ok(alerts.includes(term),term);
 assert.match(alerts,/settings\.audioFiles\[k\]=pending\.url/);
 assert.match(alerts,/api\/custom-alerts\/media/);
 assert.match(alerts,/api\/afterglow-settings/);
});

test('Super Fans remains 30 seconds per 5 minute cycle in intended order',()=>{
 const page=src('super-fans-overlay.html');
 assert.match(page,/SHOW_MS=demo\?8000:30000,PERIOD_MS=demo\?14000:300000/);
 assert.match(page,/platforms=\['kick','tiktok','twitch'\]/);
 assert.match(page,/st\.comments/);
 assert.match(page,/st\.minutes/);
 assert.match(page,/st\.shares/);
});
