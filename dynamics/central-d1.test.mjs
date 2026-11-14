import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {dynamicsRequest} from '../cloudflare/licenses/src/dynamics.mjs';

function mockDb(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE users(id TEXT PRIMARY KEY,username TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0)');
 for(const [id,username] of [['host','hostrd'],['friend','amigard'],['outsider','intruso']])
  sqlite.prepare('INSERT INTO users(id,username) VALUES(?,?)').run(id,username);
 const wrap=sql=>{
  const stmt=sqlite.prepare(sql);
  const withArgs=(args=[])=>({
   bind(...values){return withArgs(values)},
   async run(){const result=stmt.run(...args);return {success:true,meta:{changes:Number(result.changes)}}},
   async first(){return stmt.get(...args)||null},
   async all(){return {results:stmt.all(...args)}}
  });
  return withArgs();
 };
 return {sqlite,api:{prepare:wrap,async batch(stmts){return Promise.all(stmts.map(s=>s.run()))}}};
}
const req=(route,body)=>new Request('https://central.example'+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const call=async (db,id,route,body)=>{const response=await dynamicsRequest(req(route,body),{DB:db.api},id===null?null:{id});return {status:response.status,...await response.json()}};

test('D1 room flow: authenticated invite, restricted votes, one vote per viewer and result',async()=>{
 const db=mockDb();
 assert.equal((await call(db,null,'/api/dynamics/rooms')).status,401);
 const created=await call(db,'host','/api/dynamics/rooms',{});assert.equal(created.status,201);
 const roomId=created.roomId;
 assert.equal((await call(db,'outsider','/api/dynamics/rooms/'+roomId)).status,403);
 const invite=await call(db,'host','/api/dynamics/rooms/invite',{roomId,toId:'amigard'});
 assert.equal(invite.status,201);
 const inbox=await call(db,'friend','/api/dynamics/rooms/inbox');
 assert.equal(inbox.invitations.length,1);
 assert.equal((await call(db,'outsider','/api/dynamics/rooms/respond',{invitationId:invite.invitationId,accept:true})).status,404);
 assert.equal((await call(db,'friend','/api/dynamics/rooms/respond',{invitationId:invite.invitationId,accept:true})).status,200);
 assert.equal((await call(db,'friend','/api/dynamics/rooms/respond',{invitationId:invite.invitationId,accept:true})).status,409);
 const challenge={roomId,platform:'tiktok',eventId:'follow-001',followerName:'Luna',questionId:1,optionA:'A',optionB:'B'};
 assert.equal((await call(db,'host','/api/dynamics/rooms/follow',challenge)).accepted,true);
 assert.equal((await call(db,'host','/api/dynamics/rooms/follow',challenge)).duplicate,true);
 assert.equal((await call(db,'friend','/api/dynamics/rooms/vote',{roomId,platform:'tiktok',viewerId:'v1',choice:'A'})).counted,false);
 assert.equal((await call(db,'host','/api/dynamics/rooms/vote',{roomId,platform:'tiktok',viewerId:'v1',choice:'A'})).counted,true);
 assert.equal((await call(db,'host','/api/dynamics/rooms/vote',{roomId,platform:'tiktok',viewerId:'v1',choice:'B'})).counted,true);
 db.sqlite.prepare("UPDATE dynamics_challenges SET ends_at=? WHERE state='active'").run(Date.now()-1000);
 const snapshot=await call(db,'friend','/api/dynamics/rooms/'+roomId);
 assert.equal(snapshot.status,200);
 assert.equal(snapshot.challenges[0].winner,'B');
 assert.ok(snapshot.events.some(e=>e.event_type==='voted_result'&&e.payload.choice==='B'));
 db.sqlite.close();
});

test('inviting an unknown GREÑA ID never creates a ghost account',async()=>{
 const db=mockDb();const {roomId}=await call(db,'host','/api/dynamics/rooms',{});
 const result=await call(db,'host','/api/dynamics/rooms/invite',{roomId,toId:'noexiste'});
 assert.equal(result.status,404);
 db.sqlite.close();
});
