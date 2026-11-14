// GREÑA ID · Cloudflare D1 collaborative dynamics module.
// Mount from the existing identity Worker AFTER its Bearer token middleware.
// IMPORTANT: authUserId MUST come from the authenticated central session,
// never from request JSON. This module does not authorize chat/vote injection.
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const uid=()=>crypto.randomUUID();
const now=()=>Date.now();
const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_.-]{1,80}$/.test(x);
async function payload(req){const text=await req.text();if(text.length>4096)throw Error('Solicitud demasiado grande');return JSON.parse(text||'{}')}
async function member(db,roomId,userId){return db.prepare('SELECT 1 AS yes FROM dynamics_members WHERE room_id=? AND user_id=?').bind(roomId,userId).first()}
async function owner(db,roomId,userId){return db.prepare("SELECT id FROM dynamics_rooms WHERE id=? AND host_user_id=? AND status='open'").bind(roomId,userId).first()}
export async function handleDynamicsIdentityRequest(request,env,authUserId,{verifyRecipient}={}){
 const path=new URL(request.url).pathname,method=request.method;
 if(!path.startsWith('/api/dynamics/rooms'))return null;
 if(!validId(authUserId))return response({ok:false,error:'GREÑA ID sin verificar'},401);
 if(!env.DB)return response({ok:false,error:'Cloudflare D1 no está configurado'},503);
 const db=env.DB;
 try{
  if(path==='/api/dynamics/rooms'&&method==='POST'){
   const id=uid(),at=now();
   const result=await db.batch([
    db.prepare("INSERT INTO dynamics_rooms(id,host_user_id,status,created_at,updated_at) VALUES(?,?,'open',?,?)").bind(id,authUserId,at,at),
    db.prepare("INSERT INTO dynamics_members(room_id,user_id,joined_at) VALUES(?,?,?)").bind(id,authUserId,at)
   ]);
   if(result.some(x=>!x.success))throw Error('No se pudo crear sala');
   return response({ok:true,roomId:id},201);
  }
  if(path==='/api/dynamics/rooms/inbox'&&method==='GET'){
   const rows=await db.prepare("SELECT id,room_id,sender_id,created_at,expires_at FROM dynamics_invitations WHERE recipient_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC LIMIT 30").bind(authUserId,now()).all();
   return response({ok:true,invitations:rows.results||[]});
  }
  if(path==='/api/dynamics/rooms/invite'&&method==='POST'){
   const p=await payload(request),roomId=String(p.roomId||''),to=String(p.toId||'');
   if(!validId(to)||!validId(roomId)||to===authUserId)return response({ok:false,error:'Destinatario inválido'},400);
   if(!await owner(db,roomId,authUserId))return response({ok:false,error:'Solo el anfitrión puede invitar'},403);
   if(await member(db,roomId,to))return response({ok:false,error:'Ya está en la sala'},409);
   // The identity Worker must provide a genuine username/id lookup before enabling this route in production.
   // A supplied recipient is NOT treated as registered merely because its format passes.
   if(typeof verifyRecipient!=='function')return response({ok:false,error:'Falta conectar verificación de identidad GREÑA'},503);
   if(!await verifyRecipient(to))return response({ok:false,error:'GREÑA ID no existe'},404);
   const id=uid(),at=now();
   await db.prepare("INSERT INTO dynamics_invitations(id,room_id,sender_id,recipient_id,status,expires_at,created_at) VALUES(?,?,?,?,'pending',?,?)").bind(id,roomId,authUserId,to,at+300000,at).run();
   return response({ok:true,invitationId:id,expiresAt:at+300000},201);
  }
  if(path==='/api/dynamics/rooms/respond'&&method==='POST'){
   const p=await payload(request),id=String(p.invitationId||'');
   if(!validId(id)||typeof p.accept!=='boolean')return response({ok:false,error:'Solicitud inválida'},400);
   const invite=await db.prepare("SELECT * FROM dynamics_invitations WHERE id=? AND recipient_id=?").bind(id,authUserId).first();
   if(!invite)return response({ok:false,error:'No tienes esa invitación'},404);
   if(invite.status!=='pending'||invite.expires_at<=now())return response({ok:false,error:'Invitación vencida o respondida'},409);
   const at=now();
   // One SQL statement changes status exactly once, preventing a second acceptance replay.
   const changed=await db.prepare("UPDATE dynamics_invitations SET status=? WHERE id=? AND recipient_id=? AND status='pending' AND expires_at>?").bind(p.accept?'accepted':'rejected',id,authUserId,at).run();
   if(changed.meta?.changes!==1)return response({ok:false,error:'Invitación ya procesada'},409);
   if(p.accept){
     await db.prepare("INSERT OR IGNORE INTO dynamics_members(room_id,user_id,joined_at) VALUES(?,?,?)").bind(invite.room_id,authUserId,at).run();
   }
   return response({ok:true,accepted:p.accept,roomId:invite.room_id});
  }
  const match=path.match(/^\/api\/dynamics\/rooms\/([0-9a-f-]{36})$/);
  if(match&&method==='GET'){
   const id=match[1];
   if(!await member(db,id,authUserId))return response({ok:false,error:'No perteneces a la sala'},403);
   const room=await db.prepare("SELECT id,host_user_id,status FROM dynamics_rooms WHERE id=?").bind(id).first();
   if(!room)return response({ok:false,error:'Sala no encontrada'},404);
   const members=await db.prepare("SELECT user_id,gamertag,enabled FROM dynamics_members WHERE room_id=? ORDER BY joined_at").bind(id).all();
   return response({ok:true,room,members:members.results||[]});
  }
  return response({ok:false,error:'Ruta no disponible'},404);
 }catch(e){return response({ok:false,error:String(e.message||e).slice(0,180)},500)}
}
