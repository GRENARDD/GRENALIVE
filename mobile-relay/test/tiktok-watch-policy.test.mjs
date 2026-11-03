import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDelay,canRetry,confirmedLive,WATCH_RETRY_MS} from '../tiktok-watch-policy.mjs';

test('watcher stays active when channel is offline, retries after interval',()=>{
  const session={watching:true,connected:false,connecting:false,retryAt:1000};
  assert.equal(canRetry(session,999),false);
  assert.equal(canRetry(session,1000),true);
  assert.equal(canRetry({...session,connecting:true},1000),false);
  assert.equal(canRetry({...session,watching:false},1000),false);
  assert.equal(canRetry({...session,connected:true},1000),false);
});
test('backoff is bounded, never busy-loops on failed LIVE',()=>{
  assert.equal(retryDelay(1),WATCH_RETRY_MS);
  assert.equal(retryDelay(2),60000);
  assert.equal(retryDelay(100),120000);
  assert.equal(retryDelay(-1),WATCH_RETRY_MS);
});
test('only actual platform handshake counts as LIVE',()=>{
  assert.equal(confirmedLive({watching:true,connected:false,roomId:'123'}),false);
  assert.equal(confirmedLive({watching:true,connected:true,roomId:''}),false);
  assert.equal(confirmedLive({watching:false,connected:true,roomId:'123'}),false);
  assert.equal(confirmedLive({watching:true,connected:true,roomId:'123'}),true);
});
