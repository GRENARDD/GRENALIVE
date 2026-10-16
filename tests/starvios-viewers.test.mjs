import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStarviosLiveDirectory,STARVIOS_LIVE_DIRECTORY_URL,fetchStarviosDbLiveDirectory} from '../starvios-viewers.mjs';

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
