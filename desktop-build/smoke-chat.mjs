// End-to-end Windows packaged chat bridge smoke test.
// Run while the real packaged Electron/Node backend is listening on :8787.
// Uses synthetic messages; no external TikTok LIVE or API credentials are needed.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const main='http://127.0.0.1:8787';
const chat='http://127.0.0.1:8788';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url, opts={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),3000);
  try{return await fetch(url,{signal:controller.signal,...opts})}finally{clearTimeout(timer)}
}
async function waitChat(){
  for(let i=0;i<70;i++){
    try{
      const r=await get(chat+'/health');
      if(r.ok && (await r.json()).ok)return;
    }catch{}
    await sleep(500);
  }
  throw Error('GREÑA CHAT :8788 no arrancó; la prueba de :8787 no es suficiente.');
}
await waitChat();
console.log('OK: motor de chat independiente :8788 responde /health.');

const resources=[
  '/assets/platforms/tiktok.webp',
  '/assets/platforms/twitch.webp',
  '/assets/platforms/kick.svg',
  '/assets/platforms/starvios.svg',
  '/control-center.js'
];
for(const resource of resources){
  const r=await get(main+resource);
  assert.equal(r.status,200,'No carga el recurso de plataforma: '+resource);
  if(resource!=='/control-center.js')assert.match(r.headers.get('content-type')||'',/image\//i,'Tipo MIME icono '+resource);
}
console.log('OK: iconos y JS del panel disponibles en :8787.');

// This source line must be in the built installation, preventing direct :8788 iframe regression.
const js=await (await get(main+'/control-center.js')).text();
assert.match(js,/const wanted=\u0060\$\{location\.origin\}\/chat\/\?embed=/,'El iframe sigue apuntando directamente a :8788.');
console.log('OK: el iframe de GREÑA CHAT usa /chat/ del servidor principal.');

const username='test'+randomBytes(6).toString('hex');
const registration=await get(main+'/api/account/register',{
  method:'POST',
  headers:{'content-type':'application/json','Origin':main},
  body:JSON.stringify({username,displayName:'Prueba GitHub Actions',password:randomBytes(18).toString('hex'),email:username+'@example.invalid'})
});
if(!registration.ok)throw Error('No se pudo crear el usuario de prueba en almacenamiento temporal: HTTP '+registration.status+' '+await registration.text());
const rawCookie=registration.headers.get('set-cookie');
assert.ok(rawCookie,'Registro no devuelve cookie de sesion.');
const cookie=rawCookie.split(';')[0];
const embedded=await get(main+'/chat/?embed=1',{headers:{Cookie:cookie}});
assert.equal(embedded.status,200,'El proxy /chat/ rechaza la sesion local.');
const body=await embedded.text();
assert.match(body,/chat-ws/,'El chat embebido no contiene el WebSocket.');
assert.match(body,/GRENA_VOICE_EMOJI_FILTER_BEGIN/,'El instalador no incluye el filtro actualizado de emojis para voz.');
assert.match(body,/result\s*=\s*stripEmojisForVoice\(\s*result\s*\)/,'El TTS empaquetado aún lee descripciones de emojis.');
console.log('OK: /chat/ carga el chat completo con la sesión autenticada.');
const panel=await get(main+'/',{headers:{Cookie:cookie}});
assert.equal(panel.status,200,'El panel principal no abre tras iniciar sesión.');
const panelHtml=await panel.text();
assert.match(panelHtml,/id="starviosLinkModal"/,'El formulario Starvios falta en el HTML del instalador.');
assert.match(panelHtml,/id="starviosLinkInput"/,'El campo de usuario Starvios no está empaquetado.');
assert.match(js,/function openStarviosLinkModal\(\)/,'El botón de Starvios no abre el modal nuevo.');
assert.match(js,/starviosLinkForm.*addEventListener\('submit',submitStarviosLink\)/,'El formulario Starvios no permite guardar el canal.');
console.log('OK: panel empaquetado incluye formulario Starvios compatible con Electron.');

// Verificación real del caso reportado en OBS: navegador SIN cookie GREÑA.
const obsResponse=await get(main+'/api/obs-token',{headers:{Cookie:cookie}});
assert.equal(obsResponse.status,200,'No se pudo obtener el token OBS del perfil de prueba.');
const obsToken=(await obsResponse.json()).token;
assert.ok(typeof obsToken==='string'&&obsToken.length>=40,'Token OBS inválido.');
const suffix='?obs='+encodeURIComponent(obsToken);
const obsHtml=await get(main+'/chat/multichat-overlay.html'+suffix);
assert.equal(obsHtml.status,200,'OBS multichat requiere cookie aunque la URL lleva token privado.');
assert.match(await obsHtml.text(),/OBS_ACCESS/,'La fuente multichat empaquetada no propaga su token.');
for(const endpoint of [
  '/chat/api/multichat-settings'+suffix,
  '/chat/api/multichat-history'+suffix,
  '/chat/avatar?obs='+encodeURIComponent(obsToken)
]){
  const res=await get(main+endpoint);
  assert.notEqual(res.status,401,'El recurso OBS exige sesión GREÑA indebidamente: '+endpoint);
}
const obsNoToken=await get(main+'/chat/multichat-overlay.html');
assert.equal(obsNoToken.status,401,'El multichat OBS sin cookie ni token NO debe abrirse.');
console.log('OK: OBS multichat, historial y avatar autorizados por token sin cookie; acceso sin token bloqueado.');

// Tema elegido persistido y visible por la fuente OBS sin cookie de inicio de sesión.
const savedTheme=await get(main+'/api/afterglow-settings',{
  method:'POST',headers:{'content-type':'application/json',Origin:main,Cookie:cookie},
  body:JSON.stringify({theme:'domino',soundEnabled:false})
});
assert.equal(savedTheme.status,200,'No se pudo activar el tema dominó en GREÑA.');
const currentTheme=await get(main+'/api/afterglow-settings');
assert.equal(currentTheme.status,200,'El overlay local no puede leer el tema guardado.');
const afterglowState=await currentTheme.json();
assert.equal(afterglowState.settings?.theme,'domino','El motor OBS aún usa otro tema después de seleccionarlo.');
const afterglowSource=await get(main+'/afterglow-overlay.html');
assert.equal(afterglowSource.status,200,'No se carga el overlay de AFTERGLOW.');
assert.match(await afterglowSource.text(),/settingsSyncTimer/,'OBS no refresca el tema al reconectar.');
const studio=await get(main+'/afterglow-studio.html?embed=1',{headers:{Cookie:cookie}});
assert.equal(studio.status,200,'AFTERGLOW Studio no abre en la sesión del creador.');
assert.match(js,/studio:\{path:'\/afterglow-studio.html\?embed=1'/,'Falta navegación interna a Studio.');
console.log('OK: clic Dominó -> tema persistente -> API de OBS sin cookie y Studio en módulo Electron.');


const ws=new WebSocket('ws://127.0.0.1:8787/chat-ws',{headers:{Origin:main,Cookie:cookie}});
let resolveMessage,rejectMessage;
const unique='GRENA-CI-CHAT-'+randomBytes(6).toString('hex');
const received=new Promise((resolve,reject)=>{
  resolveMessage=resolve;rejectMessage=reject;
  const timeout=setTimeout(()=>reject(Error('El WebSocket del panel no entregó el mensaje de prueba.')),9000);
  ws.on('message',raw=>{
    try{const m=JSON.parse(raw.toString());if(m.type==='chat'&&m.text===unique){clearTimeout(timeout);resolve(m)}}catch{}
  });
  ws.on('error',e=>{clearTimeout(timeout);reject(e)});
  ws.on('close',()=>{clearTimeout(timeout);reject(Error('El WebSocket se cerró antes de recibir el mensaje'))});
});
await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
try{
  const sent=await get(chat+'/api/multichat-test',{
    method:'POST',headers:{'content-type':'application/json','Origin':main},
    body:JSON.stringify({platform:'tiktok',user:'prueba',nickname:'Prueba CI',text:unique})
  });
  assert.equal(sent.status,200,'El motor de chat rechazó un mensaje simulado.');
  const event=await received;
  assert.equal(event.platform,'tiktok');
  assert.equal(event.text,unique);
  const history=await (await get(chat+'/api/live-messages')).json();
  assert.ok(history.messages.some(x=>x.text===unique),'El historial no guardó el mensaje.');
  const proxied=await (await get(main+'/api/chat/live-messages',{headers:{Cookie:cookie}})).json();
  assert.ok(proxied.messages.some(x=>x.text===unique),'El historial del panel no recibió el mensaje.');
  console.log('OK: TikTok simulado -> chat :8788 -> WebSocket /chat-ws :8787 y ambos historiales.');
}finally{
  ws.close();
}
