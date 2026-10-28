// Kick realtime wire decoder: Pusher and Centrifugo JSON transports.
// Never log or persist token/connection negotiation payloads.
function asObject(value){
  if(typeof value==='string'){try{return JSON.parse(value)}catch{return value}}
  return value;
}
export function kickRealtimeFrames(raw,maxBytes=256000){
  const text=Buffer.isBuffer(raw)?raw.toString('utf8'):String(raw||'');
  if(!text||text.length>maxBytes)return [];
  const parts=text.split(/\r?\n/).filter(x=>x.trim());
  const out=[];
  for(const part of parts.slice(0,32)){
    let entry;try{entry=JSON.parse(part)}catch{continue}
    const entries=Array.isArray(entry)?entry:[entry];
    for(const e of entries.slice(0,64)){
      if(!e||typeof e!=='object')continue;
      const push=e.push;
      if(!push||typeof push!=='object'){out.push(e);continue}
      const channel=String(push.channel||'');
      const publication=asObject(push.pub?.data??push.data);
      if(publication&&typeof publication==='object'){
        const event=String(publication.event??publication.name??publication.type??publication.event_type??'');
        const data=asObject(publication.data??publication.payload??publication);
        if(event){
          out.push({event,data,channel,transport:'centrifugo'});
        }else if(data&&typeof data==='object'&&(data.sender||data.user)&&
          (typeof data.content==='string'||typeof data.message==='string')){
          // Only a chatroom publication may be interpreted as an untagged message.
          if(/^chatrooms\.\d+(?:\.v2)?$/.test(channel))
            out.push({event:'chat.message.sent',data,channel,transport:'centrifugo'});
        }
      }
      // Keep the original envelope as a control frame for diagnostics/ack tracking.
      out.push({centrifugoControl:true,push,channel,transport:'centrifugo'});
    }
  }
  return out.slice(0,100);
}
export function kickRealtimeSubscriptionRequest(raw){
  const text=Buffer.isBuffer(raw)?raw.toString('utf8'):String(raw||'');
  if(text.length>16000)return [];
  const requests=[];
  for(const line of text.split(/\r?\n/).filter(Boolean).slice(0,32)){
    let d;try{d=JSON.parse(line)}catch{continue}
    if(!d||typeof d!=='object')continue;
    const channel=String(d.subscribe?.channel||'');
    const id=Number(d.id);
    if(Number.isInteger(id)&&id>0&&/^chatrooms\.\d+(?:\.v2)?$/.test(channel))
      requests.push({id,channel,roomId:Number(channel.match(/\d+/)?.[0]||0)});
  }
  return requests;
}
