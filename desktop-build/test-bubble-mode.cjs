const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {join}=require('node:path');
const root=join(__dirname,'..');
const load=name=>readFileSync(join(root,name),'utf8');

test('botón modo burbuja está en el panel de escritorio',()=>{
 const panel=load('index.html');
 assert.match(panel,/id="grenaBubbleModeControl"/);
 assert.match(panel,/href="\/__grena_bubble_mode__"/);
});

test('Preview LIVE desaparece del panel, sin quitar las vistas de alertas y widgets',()=>{
 const panel=load('index.html');
 assert.ok(!panel.includes('href="/preview.html"'));
 assert.ok(!panel.includes('class="top-link preview-link"'));
 assert.ok(panel.includes('href="/alerts.html"'));
 assert.ok(panel.includes('href="/widgets.html"'));
});

test('pestaña flotante arrastrable y posición recordada entre varios monitores',()=>{
 const panel=load('index.html');
 const html=load('desktop-bubble.html');
 const native=load('desktop-build/fix_bubble.py');
 assert.ok(panel.includes('Pestaña flotante'));
 assert.ok(html.includes('-webkit-app-region:drag'));
 assert.ok(html.includes('#handle'));
 assert.ok(html.includes('cursor:grab'));
 assert.ok(native.includes('readFloatingPosition'));
 assert.ok(native.includes('FLOATING_POSITION_FILE'));
 assert.ok(native.includes("popup.on('move'"));
 assert.ok(native.includes('screen.getDisplayMatching'));
 assert.ok(native.includes('clampFloatingPosition'));
 assert.ok(native.includes('const nearBottom='));
 assert.ok(!native.includes('const right=old.x+old.width'));
});

test('burbuja recibe chat y eventos sin repetir el historial viejo',()=>{
 const html=load('desktop-bubble.html');
 assert.match(html,/\/api\/viewers/);
 assert.match(html,/\/api\/activity\?limit=/);
 assert.match(html,/\/chat-ws/);
 assert.match(html,/d\?\.type==='chat'/);
 assert.match(html,/d\?\.type==='event'/);
 assert.match(html,/Ignore 'chat-history'/);
 assert.match(html,/textContent=/);
 const js=html.match(/<script>([\s\S]*?)<\/script>/i);
 assert.ok(js,'inline controller present');
 new vm.Script(js[1],{filename:'desktop-bubble.html'});
});

test('Electron bubble stays isolated and can restore original app',()=>{
 const p=load('desktop-build/fix_bubble.py');
 assert.match(p,/nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true/);
 assert.match(p,/mainWindow\.hide\(\)/);
 assert.match(p,/mainWindow\.show\(\)/);
 assert.match(p,/__grena_bubble_restore__/);
 assert.match(p,/grenaBubbleQuitting/);
});

test('Starvios supports instantaneous messages and removes optimistic exclusion',()=>{
 const p=load('starvios-reader.mjs');
 assert.match(p,/new MutationObserver/);
 assert.match(p,/state\.queued\.splice\(0\)/);
 assert.match(p,/this\.deliverChat\(\{\.\.\.directChat,source:'Starvios WebSocket'\}\)/);
 assert.doesNotMatch(p,/if\(id\.startsWith\('tmp-'\)\) continue/);
});

test('Kick uses officially recommended OAuth redirect workaround',()=>{
 const p=load('server.mjs');
 assert.match(p,/params\.set\('redirect','127\.0\.0\.1'\)/);
 assert.match(p,/params\.set\('redirect_uri',redirect\)/);
});

test('reconexión multichat recupera mensajes perdidos sin volverlos a poner en la cola TTS',()=>{
 const source=load('chat.html');
 const begin=source.indexOf("if(m.type === 'chat-history'");
 const end=source.indexOf("m.type === 'chat'",begin+25);
 assert.ok(begin>=0&&end>begin,'chat history replay handler exists');
 const section=source.slice(begin,end);
 assert.match(section,/m\.messages\.slice\(-300\)/);
 assert.match(section,/receivedChatIds\.has/);
 assert.match(section,/addMessage\(item\)/);
 assert.doesNotMatch(section,/queueVoice\(item\)/);
});


test('burbuja muestra mensajes enteros y alertas completas, sin ellipsis',()=>{
 const html=load('desktop-bubble.html');
 assert.match(html,/white-space:pre-wrap/);
 assert.match(html,/overflow-wrap:anywhere/);
 assert.match(html,/eventTitle/);
 assert.match(html,/byId\('thanks'\)/);
 assert.match(html,/d\?\.type==='alert'/);
 assert.match(html,/d\?\.type==='activity'/);
 assert.match(html,/delayFor\(item\)/);
 assert.doesNotMatch(html,/truncate\(\s*item\.(?:text|user)/);
 assert.doesNotMatch(html,/text-overflow:ellipsis/);
});

test('la ventana Electron cambia de altura de forma segura sin salirse de la pantalla',()=>{
 const native=load('desktop-build/fix_bubble.py');
 const preload=load('desktop-bubble-preload.cjs');
 assert.match(native,/preload:join\(APP_ROOT,'desktop-bubble-preload.cjs'\)/);
 assert.match(native,/ipcMain\.on\('grena:bubble:layout',applyGrenaBubbleLayout\)/);
 assert.match(native,/event\.sender!==popup\.webContents/);
 assert.match(native,/Math\.floor\(area\.height\*\.86\)/);
 assert.match(native,/old\.y\+old\.height/);
 assert.match(native,/pkg\['version'\]='5\.0\.8'/);
 assert.match(preload,/contextBridge\.exposeInMainWorld\('grenaBubble'/);
 assert.match(preload,/ipcRenderer\.send\('grena:bubble:layout'/);
});

test('simulación: mensaje completo, alerta completa y expansión manual',()=>{
 const html=load('desktop-bubble.html');
 const body=html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
 assert.ok(body);
 const listeners=new Map(),sockets=[],resizes=[];
 function element(id){
  const classes=new Set(['notification','eventTitle','thanks','queueCount'].includes(id)?['hidden']:[]);
  return {
   id,hidden:false,textContent:'',scrollTop:0,scrollHeight:190,
   firstChild:{textContent:''},children:[],
   classList:{
    add:s=>classes.add(s),remove:s=>classes.delete(s),contains:s=>classes.has(s),
    toggle:(s,value)=>{if(value===undefined? !classes.has(s):value)classes.add(s);else classes.delete(s)}
   },
   setAttribute:()=>{},
   addEventListener:(type,fn)=>listeners.set(id+':'+type,fn),
   replaceChildren(){this.children=[]},
   append(v){this.children.push(v)},
   style:{},
  };
 }
 const elems=Object.fromEntries(['bubble','notification','kind','label','eventTitle','text','thanks','queueCount','expand','count','platforms','signal','subtitle'].map(id=>[id,element(id)]));
 const document={
   getElementById:id=>elems[id],
   createElement:tag=>element(tag)
 };
 class WS{
  constructor(url){this.url=url;this.listeners={};sockets.push(this)}
  addEventListener(type,fn){this.listeners[type]=fn}
  emit(data){this.listeners.message({data:JSON.stringify(data)})}
  close(){}
 }
 let raf=0;
 const sandbox={
   document,window:{grenaBubble:{resize:x=>resizes.push(x)}},location:{protocol:'http:',host:'127.0.0.1:8787'},ResizeObserver:class{observe(){}},WebSocket:WS,
   setTimeout:()=>1,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
   requestAnimationFrame:fn=>{fn();return ++raf},cancelAnimationFrame:()=>{},
   fetch:async path=>({ok:true,json:async()=>path==='/api/viewers'?{viewers:{tiktok:184}}:{activity:[]}}),
   console,URL,Date
 };
 vm.runInNewContext(body,sandbox,{filename:'desktop-bubble.html',timeout:1500});
 assert.equal(sockets.length,1);
 assert.match(sockets[0].url,/\/chat-ws$/);
 const user='EspectadorConUnNombreMuyLargoPeroCompleto';
 const longText='Hola, esto es un mensaje muy largo para que puedas leerlo sin que aparezcan puntos suspensivos. '.repeat(9);
 sockets[0].emit({type:'chat',platform:'tiktok',nickname:user,text:longText});
 assert.equal(elems.text.textContent,longText.trim());
 assert.match(elems.label.textContent,new RegExp(user));
 assert.equal(elems.notification.classList.contains('hidden'),false);
 assert.ok(resizes.length>=1,'La ventana no notificó su altura.');
 const expand=listeners.get('expand:click');
 assert.equal(typeof expand,'function');
 expand();
 assert.equal(resizes.at(-1).expanded,true);
 // Nuevo entorno para probar un evento inmediato, en lugar de esperar a que
 // desaparezca el chat anterior.
 const ele2=Object.fromEntries(Object.keys(elems).map(id=>[id,element(id)]));
 const sockets2=[],callbacks2=new Map();
 const doc2={getElementById:id=>ele2[id],createElement:tag=>element(tag)};
 class WS2 extends WS{constructor(url){super(url);sockets2.push(this)}}
 vm.runInNewContext(body,{
   ...sandbox,document:doc2,WebSocket:WS2,
   requestAnimationFrame:fn=>{fn();return 1},
   window:{grenaBubble:{resize:()=>{}}},
 },{filename:'desktop-bubble-alert.html',timeout:1500});
 const action='Envió un regalo especial x27 y desbloqueó una animación larga con información que debemos ver completa';
 const thanks='¡Muchísimas gracias por tu apoyo y por acompañar a toda la comunidad de GREÑA LIVE!';
 sockets2[0].emit({type:'alert',alert:{platform:'TikTok',event:'gift',name:'Gran colaborador',action,message:thanks,receivedAt:Date.now()}});
 assert.equal(ele2.text.textContent,action);
 assert.equal(ele2.thanks.textContent,thanks);
 assert.equal(ele2.eventTitle.textContent,'Regalo recibido');
 assert.equal(ele2.thanks.classList.contains('hidden'),false);
});
