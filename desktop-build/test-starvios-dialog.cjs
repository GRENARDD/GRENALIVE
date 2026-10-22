const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.resolve(__dirname,'..');
const html = fs.readFileSync(path.join(dir,'index.html'),'utf8');
const css = fs.readFileSync(path.join(dir,'control-center.css'),'utf8');
const source = fs.readFileSync(path.join(dir,'control-center.js'),'utf8');
const begin=source.indexOf('// El prompt() del navegador');
const end=source.indexOf('\nfunction onboardingKey()',begin);
assert.ok(begin>-1 && end>begin,'No existe el manejador Starvios para Electron');
const handler=source.slice(begin,end);

function setup({failure=false,saved=''}={}){
  const actions=new Map(),calls=[],toasts=[];
  const elements={};
  const ids=['loginStarvios','starviosLinkModal','starviosLinkInput','starviosLinkHint','starviosLinkCancel','starviosLinkForm','starviosLinkConnect','starviosLinkDisconnect'];
  for(const id of ids){
    const classes=new Set();
    const el={
      id,value:'',textContent:'',hidden:false,disabled:false,attrs:{},
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,b)=>{if(b)classes.add(x);else classes.delete(x)}},
      addEventListener:(event,fn)=>actions.set(id+':'+event,fn),
      setAttribute:(a,b)=>{el.attrs[a]=b},
      focus:()=>{},
    };
    elements[id]=el;
  }
  const state={starviosSavedChannel:saved,bridge:{starvios:false},status:{starvios:{account:'',configured:false}}};
  const fetch=async(url,opts={})=>{
    calls.push({url,opts});
    if(failure)return {ok:false,status:503,json:async()=>({error:'Motor de chat no disponible'})};
    if(url==='/api/connection-prefs' && !opts.method)return {ok:true,json:async()=>({ok:true,prefs:{starviosEnabled:true,starviosUrl:'ejemplo'}})};
    return {ok:true,json:async()=>({ok:true,prefs:{}})};
  };
  const context=vm.createContext({
    $,state,URL,setTimeout:fn=>{fn();return 1},
    fetch,toast:msg=>toasts.push(msg),renderPlatforms:()=>{},loadInitial:async()=>{}
  });
  function $(id){return elements[id]||null;}
  vm.runInContext(handler,context,{timeout:1500});
  return {actions,calls,toasts,state,elements,context};
}

test('Starvios abre un modal interno real, sin prompt() ni popups externos',()=>{
  assert.match(html,/id="starviosLinkModal"/);
  assert.match(html,/id="starviosLinkForm"/);
  assert.match(html,/id="starviosLinkInput"/);
  assert.match(html,/id="starviosLinkDisconnect"/);
  assert.match(css,/\.starvios-link-backdrop/);
  const scriptWithoutComments=handler.split('\n').filter(line=>!line.trimStart().startsWith('//')).join('\n');
  assert.doesNotMatch(scriptWithoutComments,/\b(?:prompt|confirm)\s*\(/);
  const ctx=setup();ctx.actions.get('loginStarvios:click')();
  assert.equal(ctx.elements.starviosLinkModal.classList.contains('show'),true);
  assert.equal(ctx.elements.starviosLinkModal.attrs['aria-hidden'],'false');
  assert.equal(ctx.elements.starviosLinkInput.value,'');
  ctx.actions.get('starviosLinkCancel:click')();
  assert.equal(ctx.elements.starviosLinkModal.classList.contains('show'),false);
});

test('acepta usuario y enlace público, pero rechaza dominios distintos de Starvios',()=>{
  const c=setup().context;
  assert.equal(c.normalizeStarviosChannelInput('@canal.15'),'canal.15');
  assert.equal(c.normalizeStarviosChannelInput('https://www.starvios.com/canal_15?hola=1'),'canal_15');
  assert.equal(c.normalizeStarviosChannelInput('starvios.com/canal-15'),'canal-15');
  assert.equal(c.normalizeStarviosChannelInput('https://fake-starvios.com/canal'),'');
  assert.equal(c.normalizeStarviosChannelInput('https://starvios.com/'),'');
  assert.equal(c.normalizeStarviosChannelInput('abc!!!'),'');
});

test('botón guardar persiste el canal y habilita la reconexión automática',async()=>{
  const x=setup();
  x.actions.get('loginStarvios:click')();
  x.elements.starviosLinkInput.value='https://starvios.com/mi_canal';
  await x.actions.get('starviosLinkForm:submit')({preventDefault(){}});
  assert.equal(x.state.starviosSavedChannel,'mi_canal');
  assert.equal(x.elements.starviosLinkModal.classList.contains('show'),false);
  const save=x.calls.find(c=>c.url==='/api/connection-prefs'&&c.opts.method==='POST');
  assert.ok(save,'No se guardó canal en motor');
  const body=JSON.parse(save.opts.body);
  assert.equal(body.autoConnect,true);
  assert.equal(body.starviosEnabled,true);
  assert.equal(body.starviosUrl,'mi_canal');
  assert.match(x.toasts.join(' '),/guardado/i);
  assert.doesNotMatch(x.toasts.join(' '),/LIVE conectado/i);
});

test('si el motor de chat está apagado deja el formulario abierto con un error real',async()=>{
  const x=setup({failure:true});
  x.actions.get('loginStarvios:click')();
  x.elements.starviosLinkInput.value='canal_1';
  await x.actions.get('starviosLinkForm:submit')({preventDefault(){}});
  assert.equal(x.elements.starviosLinkModal.classList.contains('show'),true);
  assert.equal(x.state.starviosSavedChannel,'');
  assert.equal(x.elements.starviosLinkHint.classList.contains('error'),true);
});

test('un canal existente permite editar su enlace o desvincularlo',async()=>{
  const x=setup({saved:'mi_canal'});
  x.actions.get('loginStarvios:click')();
  assert.equal(x.elements.starviosLinkInput.value,'mi_canal');
  assert.equal(x.elements.starviosLinkDisconnect.hidden,false);
  await x.actions.get('starviosLinkDisconnect:click')();
  assert.equal(x.state.starviosSavedChannel,'');
  assert.ok(x.calls.some(c=>c.url==='/api/disconnect/starvios'));
  const clear=x.calls.find(c=>c.url==='/api/connection-prefs'&&c.opts.method==='POST');
  assert.equal(JSON.parse(clear.opts.body).starviosEnabled,false);
});

test('primer inicio recupera el canal guardado desde el motor local',async()=>{
  const x=setup();
  const d=await x.context.refreshStarviosPrefs(false);
  assert.equal(d.ok,true);
  assert.equal(x.state.starviosSavedChannel,'ejemplo');
  assert.ok(x.calls.some(c=>c.url==='/api/connection-prefs'));
});
