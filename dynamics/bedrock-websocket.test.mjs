import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {makeBedrockClientBridge} from './bedrock-websocket.mjs';

async function until(predicate,timeout=3000){
 const stop=Date.now()+timeout;
 while(Date.now()<stop){
  if(predicate())return;
  await new Promise(done=>setTimeout(done,20));
 }
 throw new Error('Timeout Bedrock WebSocket');
}

test('local-only Minecraft WebSocket sends protocol commandRequest and safe effects',async()=>{
 const bridge=makeBedrockClientBridge({port:0});
 bridge.start();
 let client;
 try{
  await until(()=>bridge.status().listening&&bridge.status().port>0);
  assert.equal(bridge.status().host,'127.0.0.1');
  client=new WebSocket('ws://127.0.0.1:'+bridge.status().port);
  const messages=[];
  client.on('message',raw=>messages.push(JSON.parse(String(raw))));
  await until(()=>bridge.status().connected===1);
  assert.equal(bridge.dispatch({type:'vote_open',pregunta:1,players:[{gamertag:'Sr Omi1524'}]}),true);
  await until(()=>messages.length>=1);
  assert.equal(messages[0].header.messagePurpose,'commandRequest');
  assert.match(messages[0].body.commandLine,/^titleraw "Sr Omi1524" actionbar /);
  assert.equal(bridge.dispatch({type:'voted_result',choice:'A',a:3,b:1,players:[{gamertag:'Sr Omi1524'}]}),true);
  await until(()=>messages.length>=3);
  assert.match(messages[2].body.commandLine,/^effect "Sr Omi1524" speed 6 0 true$/);
  assert.equal(bridge.commandLine('kill @a'),false);
  assert.equal(bridge.commandLine('execute @a run give @a diamond'),false);
  const count=messages.length;
  client.send(JSON.stringify({body:{commandLine:'kill @a'}}));
  await new Promise(done=>setTimeout(done,50));
  assert.equal(messages.length,count);
 }finally{client?.close();bridge.close()}
});

test('WebSocket bridge suppresses destructive commands and validates gamertags',async()=>{
 const bridge=makeBedrockClientBridge({port:0});
 bridge.start();
 let client;
 try{
  await until(()=>bridge.status().listening&&bridge.status().port>0);
  client=new WebSocket('ws://127.0.0.1:'+bridge.status().port);
  const messages=[];client.on('message',raw=>messages.push(JSON.parse(String(raw))));
  await until(()=>bridge.status().connected===1);
  bridge.dispatch({type:'voted_result',choice:'B',a:1,b:2,players:[{gamertag:'Bad";kill @a'},{gamertag:'AngieBabeee'}]});
  await until(()=>messages.length>=2);
  assert.ok(messages.every(m=>!m.body.commandLine.includes('kill')));
  assert.ok(messages.every(m=>m.body.commandLine.includes('"AngieBabeee"')));
 }finally{client?.close();bridge.close()}
});
