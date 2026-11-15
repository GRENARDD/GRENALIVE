// Guards against a decoded TikTok comment failing to reach the named CHAT event.
// The documented connector emits DECODED_DATA before CHAT for the same message.
// Never filter a legitimate named message by text, cooldown or username.
export function createRealtimeTikTokChatRouter({
  deliver,
  getId,
  signature,
  now = () => Date.now(),
  defer = fn => setTimeout(fn, 0)
}){
  const deliveredIds=new Map();
  const namedSignatures=new Map();
  const stats={named:0,decoded:0,fallbackDelivered:0,duplicates:0};
  function prune(at){
    for(const [id,stamp] of deliveredIds)if(at-stamp>10*60*1000)deliveredIds.delete(id);
    while(deliveredIds.size>5000)deliveredIds.delete(deliveredIds.keys().next().value);
    for(const [sig,stamp] of namedSignatures)if(at-stamp>1000)namedSignatures.delete(sig);
    while(namedSignatures.size>500)namedSignatures.delete(namedSignatures.keys().next().value);
  }
  function send(data,source,observedAt){
    if(!data||typeof data!=='object')return false;
    const at=now();
    let id='',sig='';
    // Malformed or partially decoded metadata must never prevent delivery.
    try{id=String(getId(data)||'')}catch{}
    try{sig=String(signature(data)||'')}catch{}
    if(id&&deliveredIds.has(id)){stats.duplicates++;return false}
    // Only the delayed decoded fallback uses text matching: never suppress
    // repeated legitimate CHAT events from a viewer.
    if(source==='decoded'&&!id&&sig&&(namedSignatures.get(sig)||-1)>=observedAt){
      stats.duplicates++;return false;
    }
    let accepted=false;
    try{accepted=deliver(data,source)!==false}catch{return false}
    // A parsed-but-empty comment was not actually shown. A richer decoded
    // payload with the same ID may still rescue it.
    if(!accepted)return false;
    if(id)deliveredIds.set(id,at);
    if(source==='named'&&sig)namedSignatures.set(sig,at);
    if(deliveredIds.size>5000||namedSignatures.size>500)prune(at);
    if(source==='decoded')stats.fallbackDelivered++;
    return true;
  }
  return {
    onNamed(data){stats.named++;return send(data,'named',now())},
    onDecoded(method,decoded){
      if(method!=='WebcastChatMessage'||!decoded?.data||typeof decoded.data!=='object')return;
      stats.decoded++;
      const at=now();
      defer(()=>send(decoded.data,'decoded',at));
    },
    stats
  };
}

// A socket can appear connected even after its transport stops responding.
// Ping/pong and inbound packets establish actual liveness; quiet chat alone
// is never interpreted as a failure.
export function createRealtimeSocketWatchdog({
  socket,
  active,
  stale,
  now = () => Date.now(),
  timeoutMs=45000
}){
  let awaiting=false,pingAt=0,fired=false,lastHealthyAt=now();
  function markHealthy(){
    if(!active())return;
    awaiting=false;
    lastHealthyAt=now();
  }
  function tick(){
    if(fired||!active())return;
    if(!socket||socket.readyState!==1||socket.open===false){
      fired=true;stale('socket-closed');return;
    }
    if(awaiting){
      if(now()-pingAt>=timeoutMs){fired=true;stale('pong-timeout')}
      return;
    }
    try{socket.ping();awaiting=true;pingAt=now()}
    catch{fired=true;stale('ping-failed')}
  }
  return {tick,markHealthy,getState:()=>({awaiting,lastHealthyAt,pingAt,stale:fired})};
}
