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
