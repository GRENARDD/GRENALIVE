import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const src=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Starvios engine and assets are retired from GREÑA Live',()=>{
 for(const path of ['starvios-reader.mjs','starvios-viewers.mjs','starvios-events.mjs','starvios-public-events.mjs','assets/platforms/starvios.svg','assets/starvios-events/follow.svg'])
  assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
 const chat=src('chat-server.mjs');
 assert.doesNotMatch(chat,/import\s*\{\s*StarviosReader/);
 assert.doesNotMatch(chat,/new StarviosReader\s*\(/);
 assert.doesNotMatch(chat,/autoConnectYouTube\(\),autoConnectStarvios\(\)/);
 assert.doesNotMatch(chat,/connectionPrefs\.starviosEnabled&&!!normalizeStarviosChannel/);
});
test('Starvios is not shown as a supported platform in chat, widgets, viewer counter, and catalog',()=>{
 const chat=src('chat.html'), widgets=src('widgets.html'), viewers=src('viewers.html'), catalog=src('gift-catalog.html');
 assert.doesNotMatch(chat,/> CONECTAR STARVIOS/);
 assert.doesNotMatch(chat,/data-chat-filter="starvios"/);
 assert.doesNotMatch(chat,/class="voice-box"[^>]*>\s*<h3[^>]*>[\s\S]*?Starvios/);
 assert.doesNotMatch(widgets,/grenaDemoPlatformIndex[^\n]*starvios/);
 assert.doesNotMatch(viewers,/class="counter sv/);
 assert.doesNotMatch(catalog,/Starvios añade tarjetas/);
});
test('retired Starvios bridge events are refused and existing gift cache is filtered',()=>{
 const server=src('server.mjs');
 assert.match(server,/\/api\/internal\/starvios-live','\/api\/internal\/starvios-event/);
 assert.match(server,/items\.map\(normalizeCatalogItem\)\.filter\(item=>item\.platform!=='Starvios'\)/);
 assert.doesNotMatch(server,/normalizeStarviosEvent/);
});
