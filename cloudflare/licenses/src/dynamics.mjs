// GREÑA ID: salas compartidas de Minecraft. Usa el user.id autenticado por Worker.
const ok=(data,status=200)=>new Response(JSON.stringify({ok:true,...data}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const bad=(error,status=400)=>new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const stamp=()=>Date.now();
const isId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const uuid=()=>crypto.randomUUID();
let initialized=false;
async function tables(db){
 if(initialized)return;
 const statements=[
  "CREATE TABLE IF NOT EXISTS dynamics_rooms(id TEXT PRIMARY KEY,host_user_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)",
  "CREATE TABLE IF NOT EXISTS dynamics_members(room_id TEXT NOT NULL,user_id TEXT NOT NULL,gamertag TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1,joined_at INTEGER NOT NULL,PRIMARY KEY(room_id,user_id))",
  "CREATE TABLE IF NOT EXISTS dynamics_invitations(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,sender_id TEXT NOT NULL,recipient_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS dynamics_invitations_inbox ON dynamics_invitations(recipient_id,status,expires_at)",
  "CREATE TABLE IF NOT EXISTS dynamics_events(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,streamer_id TEXT NOT NULL,event_type TEXT NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL)",
  "CREATE INDEX IF NOT EXISTS dynamics_events_by_room ON dynamics_events(room_id,created_at)",
  "CREATE TABLE IF NOT EXISTS dynamics_votes(event_id TEXT NOT NULL,streamer_id TEXT NOT NULL,platform TEXT NOT NULL,viewer_id TEXT NOT NULL,choice TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(event_id,platform,viewer_id))",
  "CREATE TABLE IF NOT EXISTS dynamics_challenges(id TEXT PRIMARY KEY,room_id TEXT NOT NULL,streamer_id TEXT NOT NULL,source_platform TEXT NOT NULL,follower_name TEXT NOT NULL,source_event_key TEXT NOT NULL,question_id INTEGER NOT NULL,option_a TEXT NOT NULL,option_b TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',created_at INTEGER NOT NULL,starts_at INTEGER,ends_at INTEGER,winner TEXT,UNIQUE(streamer_id,source_platform,source_event_key))",
  "CREATE INDEX IF NOT EXISTS dynamics_challenges_queue ON dynamics_challenges(room_id,state,created_at)"
 ];
 for(const sql of statements)await db.prepare(sql).run();
 initialized=true;
}
async function data(req){
 if(!String(req.headers.get('content-type')||'').startsWith('application/json'))throw Object.assign(Error('JSON requerido'),{status:415});
 const raw=await req.text();if(raw.length>4096)throw Object.assign(Error('Solicitud demasiado grande'),{status:413});
 const value=JSON.parse(raw||'{}');if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Datos inválidos');return value;
}
async function membership(db,room,user){return db.prepare('SELECT m.enabled,r.status,r.host_user_id FROM dynamics_members m JOIN dynamics_rooms r ON r.id=m.room_id WHERE m.room_id=? AND m.user_id=?').bind(room,user).first()}
async function emit(db,room,type,payload){const id=uuid();await db.prepare('INSERT INTO dynamics_events(id,room_id,streamer_id,event_type,payload,created_at) VALUES(?,?,?,?,?,?)').bind(id,room,String(payload.streamerId||''),type,JSON.stringify(payload),stamp()).run();return id}
async function advance(db,room){
 const a=await db.prepare("SELECT * FROM dynamics_challenges WHERE room_id=? AND state='active' ORDER BY starts_at LIMIT 1").bind(room).first();
 if(a&&a.ends_at<=stamp()){
  const count=await db.prepare("SELECT choice,COUNT(*) AS n FROM dynamics_votes WHERE event_id=? GROUP BY choice").bind(a.id).all();
  const tally=Object.fromEntries((count.results||[]).map(v=>[v.choice,v.n]));
  const A=Number(tally.A||0),B=Number(tally.B||0),winner=A===B?'TIE':A>B?'A':'B';
  const changed=await db.prepare("UPDATE dynamics_challenges SET state='done',winner=? WHERE id=? AND state='active' AND ends_at<=?").bind(winner,a.id,stamp()).run();
  if(changed.meta?.changes===1)await emit(db,room,'voted_result',{streamerId:a.streamer_id,challengeId:a.id,questionId:a.question_id,choice:winner,a:A,b:B,platform:a.source_platform,followerName:a.follower_name});
 }
 const still=await db.prepare("SELECT id FROM dynamics_challenges WHERE room_id=? AND state='active' LIMIT 1").bind(room).first();
 if(still)return;
 const next=await db.prepare("SELECT * FROM dynamics_challenges WHERE room_id=? AND state='queued' ORDER BY created_at,id LIMIT 1").bind(room).first();
 if(!next)return;
 const start=stamp(),end=start+20000;
 const activated=await db.prepare("UPDATE dynamics_challenges SET state='active',starts_at=?,ends_at=? WHERE id=? AND state='queued' AND NOT EXISTS(SELECT 1 FROM dynamics_challenges WHERE room_id=? AND state='active')").bind(start,end,next.id,room).run();
 if(activated.meta?.changes===1)await emit(db,room,'vote_open',{streamerId:next.streamer_id,challengeId:next.id,questionId:next.question_id,optionA:next.option_a,optionB:next.option_b,followerName:next.follower_name,platform:next.source_platform,endsAt:end});
}
// All entrypoints must first authenticate the request and pass sessionUser.id.
export async function dynamicsRequest(req,env,identity){
 const path=new URL(req.url).pathname,method=req.method;
 if(!path.startsWith('/api/dynamics/rooms'))return null;
 if(!identity?.id)return bad('GREÑA ID requerido',401);
 const db=env.DB; if(!db)return bad('D1 no configurado',503);
 try{
  await tables(db);
  if(path==='/api/dynamics/rooms'&&method==='GET'){
   const rows=await db.prepare("SELECT r.id,r.host_user_id,r.status,r.created_at FROM dynamics_rooms r JOIN dynamics_members m ON m.room_id=r.id WHERE m.user_id=? AND r.status='open' ORDER BY r.created_at DESC LIMIT 20").bind(identity.id).all();
   return ok({rooms:rows.results||[]});
  }
  if(path==='/api/dynamics/rooms'&&method==='POST'){
   const id=uuid(),t=stamp();
   await db.batch([
    db.prepare("INSERT INTO dynamics_rooms(id,host_user_id,created_at,updated_at) VALUES(?,?,?,?)").bind(id,identity.id,t,t),
    db.prepare("INSERT INTO dynamics_members(room_id,user_id,joined_at) VALUES(?,?,?)").bind(id,identity.id,t)
   ]);
   return ok({roomId:id},201);
  }
  if(path==='/api/dynamics/rooms/inbox'&&method==='GET'){
   const rows=await db.prepare("SELECT i.id,i.room_id,i.sender_id,i.expires_at,i.created_at,u.username AS sender_username FROM dynamics_invitations i JOIN users u ON u.id=i.sender_id WHERE i.recipient_id=? AND i.status='pending' AND i.expires_at>? ORDER BY i.created_at DESC LIMIT 30").bind(identity.id,stamp()).all();
   return ok({invitations:rows.results||[]});
  }
  if(path==='/api/dynamics/rooms/invite'&&method==='POST'){
   const p=await data(req),room=String(p.roomId||''),name=String(p.toId||'').trim().toLowerCase();
   if(!isId(room)||!/^[a-z0-9_.-]{3,32}$/.test(name))return bad('Sala o GREÑA ID incorrecto');
   const member=await membership(db,room,identity.id);
   if(!member||member.host_user_id!==identity.id||member.status!=='open')return bad('Solo anfitrión puede invitar',403);
   const recipient=await db.prepare('SELECT id FROM users WHERE username=? AND disabled=0').bind(name).first();
   if(!recipient)return bad('GREÑA ID no encontrado',404);
   if(recipient.id===identity.id)return bad('No puedes invitarte');
   if(await membership(db,room,recipient.id))return bad('Ya participa en esta sala',409);
   const id=uuid(),t=stamp();
   await db.prepare("INSERT INTO dynamics_invitations(id,room_id,sender_id,recipient_id,expires_at,created_at) VALUES(?,?,?,?,?,?)").bind(id,room,identity.id,recipient.id,t+300000,t).run();
   return ok({invitationId:id,expiresAt:t+300000},201);
  }
  if(path==='/api/dynamics/rooms/respond'&&method==='POST'){
   const p=await data(req),id=String(p.invitationId||'');
   if(!isId(id)||typeof p.accept!=='boolean')return bad('Respuesta inválida');
   const item=await db.prepare('SELECT i.*,r.status AS room_status FROM dynamics_invitations i JOIN dynamics_rooms r ON r.id=i.room_id WHERE i.id=? AND i.recipient_id=?').bind(id,identity.id).first();
   if(!item)return bad('Invitación no encontrada',404);
   if(item.status!=='pending'||item.expires_at<=stamp()||item.room_status!=='open')return bad('Invitación vencida',409);
   const changed=await db.prepare("UPDATE dynamics_invitations SET status=? WHERE id=? AND recipient_id=? AND status='pending' AND expires_at>?").bind(p.accept?'accepted':'rejected',id,identity.id,stamp()).run();
   if(changed.meta?.changes!==1)return bad('Ya fue respondida',409);
   if(p.accept)await db.prepare('INSERT OR IGNORE INTO dynamics_members(room_id,user_id,joined_at) VALUES(?,?,?)').bind(item.room_id,identity.id,stamp()).run();
   return ok({accepted:p.accept,roomId:item.room_id});
  }
  if(path==='/api/dynamics/rooms/follow'&&method==='POST'){
   const p=await data(req),room=String(p.roomId||''),platform=String(p.platform||'').toLowerCase(),key=String(p.eventId||'').trim();
   const m=await membership(db,room,identity.id);
   if(!m||m.status!=='open'||!m.enabled)return bad('Participante desactivado',403);
   if(!['tiktok','twitch','kick','youtube'].includes(platform)||!key||key.length>128)return bad('Follow sin plataforma o ID verificable');
   const n=Number(p.questionId);
   if(!Number.isInteger(n)||n<1||n>200)return bad('Número de pregunta inválido');
   const questionA=String(p.optionA||'').slice(0,250),questionB=String(p.optionB||'').slice(0,250);
   if(!questionA||!questionB)return bad('Opciones inválidas');
   const id=uuid(),t=stamp();
   try{await db.prepare("INSERT INTO dynamics_challenges(id,room_id,streamer_id,source_platform,follower_name,source_event_key,question_id,option_a,option_b,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,room,identity.id,platform,String(p.followerName||'Seguidor').slice(0,64),key,n,questionA,questionB,t).run()}
   catch(e){if(/UNIQUE|constraint/i.test(String(e)))return ok({duplicate:true});throw e}
   await advance(db,room);return ok({accepted:true,challengeId:id});
  }
  if(path==='/api/dynamics/rooms/vote'&&method==='POST'){
   const p=await data(req),room=String(p.roomId||''),platform=String(p.platform||'').toLowerCase(),viewer=String(p.viewerId||'').trim(),choice=String(p.choice||'').toUpperCase();
   const m=await membership(db,room,identity.id);
   if(!m||m.status!=='open'||!m.enabled)return bad('Participante desactivado',403);
   if(!['tiktok','twitch','kick','youtube'].includes(platform)||!viewer||viewer.length>128||!['A','B'].includes(choice))return bad('Voto inválido');
   await advance(db,room);
   const active=await db.prepare("SELECT * FROM dynamics_challenges WHERE room_id=? AND streamer_id=? AND state='active' AND ends_at>? ORDER BY starts_at LIMIT 1").bind(room,identity.id,stamp()).first();
   if(!active)return ok({counted:false,reason:'chat-not-owner-or-vote-closed'});
   await db.prepare("INSERT INTO dynamics_votes(event_id,streamer_id,platform,viewer_id,choice,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(event_id,platform,viewer_id) DO UPDATE SET choice=excluded.choice,updated_at=excluded.updated_at").bind(active.id,identity.id,platform,viewer,choice,stamp()).run();
   return ok({counted:true,challengeId:active.id});
  }
  const match=/^\/api\/dynamics\/rooms\/([0-9a-f-]{36})$/.exec(path);
  if(match&&method==='GET'){
   const room=match[1],m=await membership(db,room,identity.id);
   if(!m)return bad('No perteneces a esta sala',403);
   await advance(db,room);
   const members=await db.prepare('SELECT m.user_id,m.gamertag,m.enabled,u.username FROM dynamics_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.joined_at').bind(room).all();
   const challenges=await db.prepare("SELECT id,streamer_id,source_platform,follower_name,question_id,option_a,option_b,state,ends_at,winner FROM dynamics_challenges WHERE room_id=? AND state!='queued' ORDER BY created_at DESC LIMIT 10").bind(room).all();
   const events=await db.prepare('SELECT id,event_type,payload,created_at FROM dynamics_events WHERE room_id=? ORDER BY created_at DESC LIMIT 40').bind(room).all();
   return ok({roomId:room,members:members.results||[],challenges:challenges.results||[],events:(events.results||[]).map(e=>({...e,payload:JSON.parse(e.payload)}))});
  }
  return bad('Ruta no encontrada',404);
 }catch(e){return bad(String(e.message||e).slice(0,160),Number(e.status)||500)}
}
