import {randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';

/**
 * Local Bedrock client bridge. An OP enters /connect ws://127.0.0.1:19135
 * in Minecraft for Windows while playing on an Aternos server.
 * Minecraft's own client dispatches /title and short /effect commands to
 * the world. No remote Aternos API, server-net addon, or third-party secrets.
 *
 * Security: loopback only; ignores inbound messages; fixed command allowlist.
 * This cannot promise compatibility with every Bedrock client or server.
 */
export function makeBedrockClientBridge({port=19135,host='127.0.0.1',Server=WebSocketServer}={}){
 let listening=false,lastError='',lastCommand='',clients=new Set(),server=null;
 const name=s=>typeof s==='string'&&/^[A-Za-z0-9_ ]{1,16}$/.test(s.trim())?s.trim():null;
 const safeText=s=>String(s??'').replace(/[\u0000-\u001F\u007F]/g,' ').slice(0,170);
 const uniquePlayers=players=>[...new Set((Array.isArray(players)?players:[]).map(p=>name(p?.gamertag)).filter(Boolean))].slice(0,20);
 function status(){return {listening,connected:clients.size,port:server?.address()?.port||port,host,error:lastError,command:'/connect ws://127.0.0.1:'+String(server?.address()?.port||port)}}
 function commandLine(line){
   if(!/^(?:titleraw|title|effect) /.test(line))return false;
   if(!clients.size)return false;
   lastCommand=line;
   const payload=JSON.stringify({header:{version:1,requestId:randomUUID(),messageType:'commandRequest',messagePurpose:'commandRequest'},body:{version:1,origin:{type:'player'},commandLine:line}});
   for(const socket of clients){if(socket.readyState===WebSocket.OPEN)socket.send(payload)}
   return true;
 }
 function showTitle(target,text){
   const json=JSON.stringify({rawtext:[{text:safeText(text)}]});
   return commandLine('titleraw '+target+' actionbar '+json);
 }
 function dispatch(event){
   if(!event||!['vote_open','voted_result'].includes(event.type))return false;
   const players=uniquePlayers(event.players);
   const targets=players.length?players.map(p=>'"'+p+'"'):['@a'];
   let sent=false;
   if(event.type==='vote_open'){
     const headline='GREÑA · ¿Qué prefieres? #'+String(Number(event.pregunta)||0)+' · Vota A o B en el LIVE';
     for(const target of targets)sent=showTitle(target,headline)||sent;
   }else{
     const choice=String(event.choice||'TIE').toUpperCase();
     const winner=choice==='A'?'A':choice==='B'?'B':'EMPATE';
     for(const target of targets){
       sent=showTitle(target,'GREÑA · Resultado: '+winner+' · A '+Number(event.a||0)+' / B '+Number(event.b||0))||sent;
       // Only temporary harmless effects; never summon, teleport, damage or destroy.
       if(choice==='A')commandLine('effect '+target+' speed 6 0 true');
       if(choice==='B')commandLine('effect '+target+' jump_boost 6 0 true');
     }
   }
   return sent;
 }
 function start(){
   try{
     server=new Server({host,port,maxPayload:2048,perMessageDeflate:false});
     server.on('listening',()=>{listening=true;lastError=''});
     server.on('connection',socket=>{
       clients.add(socket);
       socket.on('message',()=>{}); // Never evaluate client-supplied commands.
       socket.on('close',()=>clients.delete(socket));
       socket.on('error',()=>clients.delete(socket));
     });
     server.on('error',e=>{listening=false;lastError=String(e.code||e.message||e).slice(0,120)});
     server.on('close',()=>{listening=false;clients.clear()});
   }catch(e){lastError=String(e.message||e).slice(0,120)}
   return status();
 }
 function close(){for(const c of clients)c.close();server?.close()}
 return {start,close,status,dispatch,commandLine};
}
