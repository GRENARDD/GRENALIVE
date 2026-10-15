import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStarviosLiveDirectory,STARVIOS_LIVE_DIRECTORY_URL} from '../starvios-viewers.mjs';

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
