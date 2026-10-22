// Regression checks for desktop connections and persistent OBS styles.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const read=path=>readFileSync(join(__dirname,'..',path),'utf8');

test('Starvios opens an in-app username/link form instead of window.prompt',()=>{
 const html=read('index.html'),js=read('control-center.js');
 for(const id of ['starviosLinkModal','starviosLiveUrl','starviosLinkConnect','starviosLinkHint'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/openChannelLinkModal\('starvios'\)/);
 assert.match(js,/chatWS\.send\(JSON\.stringify\(\{type:'connect',platform,url\}\)\)/);
 assert.doesNotMatch(js,/prompt\('Tu usuario o enlace público de Starvios:/);
});
test('YouTube LIVE link no longer blocks on an unavailable OAuth provider',()=>{
 const html=read('index.html'),js=read('control-center.js'),engine=read('chat-server.mjs');
 for(const id of ['youtubeLinkModal','youtubeLiveUrl','youtubeLinkConnect'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/\$\('loginYouTube'\)\.onclick=\(\)=>openChannelLinkModal\('youtube'\)/);
 assert.match(engine,/platform === 'youtube'/);
 assert.match(engine,/await connectYouTube\(message\.url\)/);
});
test('Vertical and horizontal OBS sources persist and actively resynchronize their theme',()=>{
 const html=read('alerts.html'),overlay=read('afterglow-overlay.html'),picker=read('assets/alerts-theme-picker.js');
 assert.match(html,/searchParams\.set\('layout','vertical'\)/);
 assert.match(html,/searchParams\.set\('layout','horizontal'\)/);
 assert.match(overlay,/settingsCheckTimer=setInterval\(refreshSettings,6000\)/);
 assert.match(overlay,/if\(d\.type==='afterglow-settings'\)applySettings\(d\.settings\)/);
 assert.match(overlay,/if\(cfg\.theme==='minecraft'\)window\.AfterglowMinecraft/);
 assert.match(picker,/if\(saved\.theme!==next\)throw Error/);
});
