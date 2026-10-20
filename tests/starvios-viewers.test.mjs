import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStarviosLiveDirectory,STARVIOS_LIVE_DIRECTORY_URL,buildStarviosFreshLiveDirectoryUrl,fetchStarviosDbLiveDirectory,confirmStarviosOffline} from '../starvios-viewers.mjs';

test('Starvios directorio público usa cifras del propio LIVE',()=>{
 const rows=[{status:'live',profiles:{username:'GRENA_RD'},viewer_count:27},
 {status:'offline',profiles:{username:'other'},viewer_count:999}];
 assert.equal(STARVIOS_LIVE_DIRECTORY_URL,'https://starvios.com/api/public/live-now');
 assert.deepEqual(parseStarviosLiveDirectory({rows},'grena_rd'),{state:'live',count:27});
 assert.deepEqual(parseStarviosLiveDirectory({rows},'@GRENA_RD'),{state:'live',count:27});
 assert.deepEqual(parseStarviosLiveDirectory({rows:[{status:'live',profiles:{username:'x'},viewer_count:0}]},'x'),{state:'live',count:0});
});
test('no inventa espectadores ni confunde múltiples canales',()=>{
 assert.deepEqual(parseStarviosLiveDirectory({rows:[]},'streamer'),{state:'offline',count:0});
 assert.deepEqual(parseStarviosLiveDirectory({},'streamer'),{state:'unavailable',count:null});
 assert.deepEqual(parseStarviosLiveDirectory({rows:[{status:'live',profiles:{username:'foo'},viewer_count:null}]},'foo'),{state:'live',count:null});
 assert.deepEqual(parseStarviosLiveDirectory({rows:[{status:'live',profiles:{username:'foo'},viewer_count:'0'}]},'foo'),{state:'live',count:0});
 assert.deepEqual(parseStarviosLiveDirectory({rows:[{status:'live',profiles:{username:'foo'},viewer_count:'unknown'}]},'foo'),{state:'live',count:null});
});

test('respaldo de BD pública recupera espectadores únicamente del canal correcto',async()=>{
 const urls=[];
 const request=async url=>{
  urls.push(url);
  if(url.includes('/profiles?'))return {ok:true,json:async()=>[
   {id:'uuid-otro',username:'otro'},{id:'uuid-01',username:'Grena_RD'}
  ]};
  if(url.includes('/streams?'))return {ok:true,json:async()=>[
   {id:'live-01',channel_id:'uuid-01',status:'live',viewer_count:17},
   {id:'live-falso',channel_id:'uuid-otro',status:'live',viewer_count:800}
  ]};
  throw Error('Consulta desconocida');
 };
 const payload=await fetchStarviosDbLiveDirectory('grena_rd',{
  baseUrl:'https://example.supabase.co/rest/v1',key:'clave-publica',request
 });
 assert.deepEqual(parseStarviosLiveDirectory(payload,'grena_rd'),{state:'live',count:17});
 assert.equal(urls.length,2);
 assert.match(urls[0],/username=ilike/);
 assert.match(urls[1],/channel_id=eq/);
});

test('respaldo no inventa cero cuando no puede comprobar el perfil',async()=>{
 const request=async()=>({ok:true,json:async()=>[]});
 await assert.rejects(()=>fetchStarviosDbLiveDirectory('grena_rd',{
  baseUrl:'https://example.supabase.co/rest/v1',key:'clave-publica',request
 }),/Perfil Starvios no disponible/);
});

test('respaldo acepta un cero verificado y prueba otro nombre de tabla si hace falta',async()=>{
 const request=async url=>{
  if(url.includes('/profiles?'))return {ok:true,json:async()=>[{id:'uuid-01',username:'grena_rd'}]};
  if(url.includes('/streams?'))return {ok:false,status:404};
  if(url.includes('/live_streams?'))return {ok:true,json:async()=>[{id:'live-01',channel_id:'uuid-01',status:'live',viewer_count:0}]};
  throw Error('Consulta desconocida');
 };
 const payload=await fetchStarviosDbLiveDirectory('grena_rd',{
  baseUrl:'https://example.supabase.co/rest/v1',key:'clave-publica',request
 });
 assert.deepEqual(parseStarviosLiveDirectory(payload,'grena_rd'),{state:'live',count:0});
});


test('si streams está vacía también consulta live_streams',async()=>{
 const urls=[];
 const request=async url=>{
  urls.push(url);
  if(url.includes('/profiles?'))return {ok:true,json:async()=>[{id:'uuid-01',username:'greña'.replace('ñ','n')}]};
  if(url.includes('/streams?'))return {ok:true,json:async()=>[]};
  if(url.includes('/live_streams?'))return {ok:true,json:async()=>[{id:'live-02',channel_id:'uuid-01',status:'live',viewer_count:34}]};
  throw Error('Petición inesperada');
 };
 const payload=await fetchStarviosDbLiveDirectory('grena',{
  baseUrl:'https://example.supabase.co/rest/v1',key:'publica',request
 });
 assert.deepEqual(parseStarviosLiveDirectory(payload,'grena'),{state:'live',count:34});
 assert.equal(urls.some(url=>url.includes('/live_streams?')),true);
});

test('la tabla pública puede referir al creador como profile_id',async()=>{
 const request=async url=>{
  if(url.includes('/profiles?'))return {ok:true,json:async()=>[{id:'uuid-01',username:'grena_rd'}]};
  if(url.includes('/streams?')&&!url.includes('channel_id='))return {ok:true,json:async()=>[
   {id:'live-02',profile_id:'uuid-01',status:'live',current_viewers:51}
  ]};
  return {ok:true,json:async()=>[]};
 };
 const payload=await fetchStarviosDbLiveDirectory('grena_rd',{
  baseUrl:'https://example.supabase.co/rest/v1',key:'publica',request
 });
 assert.deepEqual(parseStarviosLiveDirectory(payload,'grena_rd'),{state:'live',count:51});
});

test('cada lectura de audiencia evade caché sin alterar la ruta de Starvios',()=>{
 const a=new URL(buildStarviosFreshLiveDirectoryUrl(1760634000000));
 const b=new URL(buildStarviosFreshLiveDirectoryUrl(1760634006000));
 assert.equal(a.origin,'https://starvios.com');
 assert.equal(a.pathname,'/api/public/live-now');
 assert.equal(a.searchParams.get('_live_ts'),'1760634000000');
 assert.notEqual(a.href,b.href);
});


test('Starvios no declara offline por fallos transitorios del directorio',()=>{
 const now=200000;
 assert.equal(confirmStarviosOffline({misses:1,missingSince:now-120000,lastLive:true,now}),false);
 assert.equal(confirmStarviosOffline({misses:4,missingSince:now-20000,lastLive:true,now}),false);
 assert.equal(confirmStarviosOffline({misses:4,missingSince:now-89000,lastLive:true,now}),false);
 assert.equal(confirmStarviosOffline({misses:4,missingSince:now-90000,lastLive:true,now}),true);
 assert.equal(confirmStarviosOffline({misses:4,missingSince:now-30000,lastLive:null,now}),true);
 assert.equal(confirmStarviosOffline({misses:4,missingSince:0,lastLive:null,now}),false);
});

test('Starvios renueva LIVE confirmado después de pérdida del primer aviso',async()=>{
 const {StarviosReader}=await import('../starvios-reader.mjs');
 const previous=globalThis.fetch;
 const signals=[];
 const reader=new StarviosReader({onLive:s=>signals.push(s),onViewers:()=>{}});
 reader.running=true;reader.generation=1;reader.channel='grena_rd';
 globalThis.fetch=async()=>new Response(JSON.stringify({rows:[{status:'live',profiles:{username:'grena_rd'},viewer_count:3}]}),{status:200});
 try {
  reader.lastLive=true;
  reader.lastLiveReportAt=Date.now()-31000;
  await reader.scanLive();
  assert.equal(signals.length,1);
  assert.equal(signals[0].live,true);
  await reader.scanLive();
  assert.equal(signals.length,1);
 }finally{globalThis.fetch=previous}
});

test('Starvios conserva LIVE al perder temporalmente el canal de la lista',async()=>{
 const {StarviosReader}=await import('../starvios-reader.mjs');
 const previous=globalThis.fetch;
 const signals=[];
 const reader=new StarviosReader({onLive:s=>signals.push(s),onViewers:()=>{}});
 reader.running=true;reader.generation=1;reader.channel='grena_rd';
 reader.lastLive=true;reader.lastViewerCount=2;
 globalThis.fetch=async()=>new Response(JSON.stringify({rows:[]}),{status:200});
 try{
  await reader.scanLive();
  assert.equal(reader.lastLive,true);
  assert.equal(reader.lastViewerCount,2);
  assert.equal(signals.length,0);
  reader.liveDirectoryMisses=3;
  reader.liveMissingSince=Date.now()-100000;
  await reader.scanLive();
  assert.equal(reader.lastLive,false);
  assert.equal(signals.length,1);
  assert.equal(signals[0].live,false);
 }finally{globalThis.fetch=previous}
});


test('Starvios recupera pronto el endpoint oficial tras un timeout y enfría la BD retirada',async()=>{
 const {StarviosReader}=await import('../starvios-reader.mjs');
 const previous=globalThis.fetch;
 const reader=new StarviosReader();
 reader.running=true;reader.generation=1;reader.channel='grena_rd';
 reader.readViewerFromLiveDirectory=async()=>null;
 let primaryRequests=0,dbRequests=0;
 globalThis.fetch=async(url)=>{
  if(String(url).includes('/api/public/live-now')){primaryRequests++;throw Error('simulated timeout');}
  dbRequests++;
  return new Response(JSON.stringify({code:'PGRST205',message:"Could not find the table 'public.streams' in the schema cache"}),{status:404});
 };
 try{
  const now=Date.now();
  await reader.scanLive();
  assert.equal(primaryRequests,1);
  assert.ok(reader.directoryPrimaryRetryAt>now);
  assert.ok(reader.directoryPrimaryRetryAt<=Date.now()+18000);
  assert.ok(reader.dbSchemaRetryAt>=now+9*60*1000);
  reader.directoryFallbackRetryAt=0;
  await reader.scanLive();
  assert.equal(dbRequests,1);
  assert.equal(reader.lastLive,null);
 }finally{globalThis.fetch=previous}
});
