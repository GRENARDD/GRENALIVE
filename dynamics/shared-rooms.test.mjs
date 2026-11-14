import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedDynamics} from './shared-rooms.mjs';

test('recipient alone can accept invitation',()=>{
  const d=createSharedDynamics();
  const room=d.create({ownerId:'grena',gamertag:'Sr Omi1524'});
  const i=d.invite({roomId:room.id,fromId:'grena',toId:'angie'});
  assert.throws(()=>d.respond({invitationId:i.id,userId:'otro',accept:true}));
  assert.equal(d.respond({invitationId:i.id,userId:'angie',accept:true,gamertag:'AngieBabeee'}).members.length,2);
});

test('only the chat of the followed streamer counts votes',()=>{
  let time=1000;
  const d=createSharedDynamics({now:()=>time});
  const r=d.create({ownerId:'grena',gamertag:'Omi',voteSeconds:20});
  const i=d.invite({roomId:r.id,fromId:'grena',toId:'amiga'});
  d.respond({invitationId:i.id,userId:'amiga',accept:true,gamertag:'Angie'});
  d.follow({roomId:r.id,streamerId:'grena',platform:'tiktok',followerName:'Pedro',questionId:1,optionA:'Sin armadura',optionB:'Sin espada'});
  assert.equal(d.vote({roomId:r.id,streamerId:'amiga',platform:'tiktok',userId:'user1',message:'A'}),false);
  assert.equal(d.vote({roomId:r.id,streamerId:'grena',platform:'tiktok',userId:'user1',message:'B'}),true);
  d.vote({roomId:r.id,streamerId:'grena',platform:'tiktok',userId:'user1',message:'A'});
  d.vote({roomId:r.id,streamerId:'grena',platform:'twitch',userId:'user2',message:'A'});
  d.follow({roomId:r.id,streamerId:'amiga',platform:'kick',followerName:'Ana',questionId:2,optionA:'Agua',optionB:'Correr'});
  time+=20000;
  const result=d.tick()[0];
  assert.equal(result.winner,'A');
  assert.deepEqual(result.votes,{A:2,B:0});
  assert.equal(result.players.length,2);
  assert.equal(d.getRoom(r.id).active.ownerId,'amiga');
  assert.equal(d.vote({roomId:r.id,streamerId:'grena',platform:'tiktok',userId:'z',message:'B'}),false);
});

test('disabled streamer cannot receive follows',()=>{
  const d=createSharedDynamics();const r=d.create({ownerId:'grena'});
  d.enable({roomId:r.id,userId:'grena',value:false});
  assert.equal(d.follow({roomId:r.id,streamerId:'grena',platform:'tiktok',questionId:1}).accepted,false);
});
