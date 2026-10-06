(()=>{
'use strict';
class GrenaCamRTC{
  constructor(opts={}){
    this.opts=opts;
    this.ws=null;
    this.peerId='';
    this.participantId='';
    this.roomObsToken='';
    this.localStream=opts.localStream||null;
    this.peers=new Map();
    this.pendingUnlocks=new Map();
    this.closed=false;
    this.joinPayload=null;
    this.reconnectAttempt=0;
    this.reconnectTimer=null;
    this.iceServers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
  }
  wsUrl(){return `${location.protocol==='https:'?'wss':'ws'}://${location.host}`}
  connect(joinPayload){
    this.joinPayload={...joinPayload};
    this.closed=false;
    return new Promise((resolve,reject)=>this.openSocket(resolve,reject,true));
  }
  openSocket(resolve,reject,isInitial=false){
    if(this.closed)return;
    clearTimeout(this.reconnectTimer);
    const ws=this.ws=new WebSocket(this.wsUrl());
    let settled=false;
    const failInitial=err=>{if(isInitial&&!settled){settled=true;reject(err)}};
    ws.onopen=()=>{
      const payload={type:'cam:join',...this.joinPayload};
      if(this.participantId&&this.joinPayload?.role==='guest')payload.resumeParticipantId=this.participantId;
      ws.send(JSON.stringify(payload));
    };
    ws.onerror=()=>failInitial(new Error('No se pudo conectar con GREÑA Cam Room.'));
    ws.onclose=()=>{
      if(ws!==this.ws)return;
      this.resetPeers();
      this.opts.onStatus?.('Reconectando…');
      this.opts.onClose?.();
      if(!this.closed){
        const wait=Math.min(8000,1000*Math.pow(1.7,this.reconnectAttempt++));
        this.reconnectTimer=setTimeout(()=>this.openSocket(()=>{},()=>{},false),wait);
      }
    };
    ws.onmessage=async ev=>{
      let m;try{m=JSON.parse(ev.data)}catch{return}
      if(m.type==='cam:error'){
        this.opts.onError?.(m.error||'Error de sala');
        failInitial(new Error(m.error||'Error de sala'));
        return;
      }
      if(m.type==='cam:joined'){
        this.peerId=m.peerId;
        this.participantId=m.participantId||this.participantId;
        this.roomObsToken=m.roomObsToken||this.roomObsToken;
        if(Array.isArray(m.iceServers)&&m.iceServers.length)this.iceServers=m.iceServers;
        this.reconnectAttempt=0;
        this.opts.onJoined?.(m);
        this.opts.onStatus?.('Conectado');
        if(isInitial&&!settled){settled=true;resolve(m)}
        return;
      }
      if(m.type==='cam:peer-available'){await this.ensurePeer(m.peer,m.initiator,m.permissions||{});return}
      if(m.type==='cam:unlock-result'){const p=this.pendingUnlocks.get(String(m.requestId||''));if(p){this.pendingUnlocks.delete(String(m.requestId||''));clearTimeout(p.timer);m.ok?p.resolve(m):p.reject(new Error(m.error||'PIN incorrecto.'))}this.opts.onUnlockResult?.(m);return}
      if(m.type==='cam:signal'){await this.handleSignal(m.fromPeerId,m.signal||{});return}
      if(m.type==='cam:peer-left'){this.removePeer(m.peerId,m.participantId);return}
      if(m.type==='cam:room-state'){
        this.optimizeForParticipants((m.participants||[]).length).catch(()=>{});
        this.opts.onRoomState?.(m.participants||[]);
        return;
      }
      if(m.type==='cam:room-closed'){
        this.opts.onError?.(m.reason||'La sala fue cerrada');
        this.close();
      }
    };
    if(isInitial)setTimeout(()=>{
      if(!settled&&ws.readyState!==WebSocket.OPEN)failInitial(new Error('La conexión con la sala tardó demasiado.'));
    },12000);
  }
  iceConfig(){
    return {
      iceServers:this.iceServers,
      iceCandidatePoolSize:4,
      bundlePolicy:'max-bundle',
      rtcpMuxPolicy:'require'
    };
  }
  permissionDirection(perms={}){
    const send=!!perms.send,receive=!!perms.receive;
    if(send&&receive)return 'sendrecv';
    if(send)return 'sendonly';
    if(receive)return 'recvonly';
    return 'inactive';
  }
  createCtx(peer,permissions={}){
    const pc=new RTCPeerConnection(this.iceConfig());
    const perms={send:!!permissions.send,receive:!!permissions.receive};
    const ctx={peer,pc,permissions:perms,transceivers:new Map(),makingOffer:false,ignoreOffer:false,polite:this.peerId.localeCompare(peer.peerId)>0,restartTimer:null};
    this.peers.set(peer.peerId,ctx);
    for(const kind of ['video','audio']){
      const track=this.localStream?.getTracks?.().find(t=>t.kind===kind)||null;
      const direction=this.permissionDirection(perms);
      let tr;
      try{tr=track?pc.addTransceiver(track,{direction,streams:[this.localStream]}):pc.addTransceiver(kind,{direction})}
      catch{tr=pc.addTransceiver(kind,{direction});if(track&&perms.send)tr.sender.replaceTrack(track).catch(()=>{})}
      if(!perms.send&&track)tr.sender.replaceTrack(null).catch(()=>{});
      ctx.transceivers.set(kind,tr);
    }
    pc.onicecandidate=e=>{if(e.candidate)this.sendSignal(peer.peerId,{candidate:e.candidate})};
    pc.ontrack=e=>{
      if(!ctx.permissions.receive)return;
      const stream=e.streams?.[0]||new MediaStream([e.track]);
      this.opts.onRemoteTrack?.(ctx.peer,stream,e.track);
    };
    pc.onconnectionstatechange=()=>{
      const s=pc.connectionState;
      this.opts.onPeerState?.(ctx.peer,s);
      clearTimeout(ctx.restartTimer);
      if(s==='disconnected')ctx.restartTimer=setTimeout(()=>this.restartPeerIce(ctx).catch(()=>{}),3500);
      if(s==='failed')this.restartPeerIce(ctx).catch(()=>{});
    };
    pc.oniceconnectionstatechange=()=>{if(pc.iceConnectionState==='failed')this.restartPeerIce(ctx).catch(()=>{})};
    pc.onnegotiationneeded=async()=>{
      try{ctx.makingOffer=true;await pc.setLocalDescription();this.sendSignal(peer.peerId,{description:pc.localDescription})}
      catch(e){this.opts.onRtcError?.(e)}finally{ctx.makingOffer=false}
    };
    this.applyPeerPermissions(ctx,perms,false).catch(()=>{});
    this.tuneSenderBitrates(ctx).catch(()=>{});
    return ctx;
  }
  async applyPeerPermissions(ctx,permissions={},renegotiate=true){
    if(!ctx?.pc)return;
    ctx.permissions={send:!!permissions.send,receive:!!permissions.receive};
    const direction=this.permissionDirection(ctx.permissions);
    for(const kind of ['video','audio']){
      const tr=ctx.transceivers.get(kind);if(!tr)continue;
      try{if(tr.direction!==direction)tr.direction=direction}catch{}
      const track=ctx.permissions.send?(this.localStream?.getTracks?.().find(t=>t.kind===kind)||null):null;
      try{await tr.sender.replaceTrack(track)}catch{}
    }
    await this.tuneSenderBitrates(ctx);
    if(renegotiate&&ctx.pc.signalingState==='stable'){
      try{ctx.makingOffer=true;await ctx.pc.setLocalDescription();this.sendSignal(ctx.peer.peerId,{description:ctx.pc.localDescription})}
      catch(e){this.opts.onRtcError?.(e)}finally{ctx.makingOffer=false}
    }
  }
  async restartPeerIce(ctx){
    if(!ctx||ctx.pc.connectionState==='closed')return;
    try{
      ctx.pc.restartIce?.();
      ctx.makingOffer=true;
      const offer=await ctx.pc.createOffer({iceRestart:true});
      await ctx.pc.setLocalDescription(offer);
      this.sendSignal(ctx.peer.peerId,{description:ctx.pc.localDescription});
    }catch(e){this.opts.onRtcError?.(e)}finally{ctx.makingOffer=false}
  }
  async ensurePeer(peer,initiator,permissions={}){
    let ctx=this.peers.get(peer.peerId);
    if(!ctx)ctx=this.createCtx(peer,permissions);
    else await this.applyPeerPermissions(ctx,permissions,false);
    ctx.peer=peer;
    if(initiator){
      try{ctx.makingOffer=true;await ctx.pc.setLocalDescription();this.sendSignal(peer.peerId,{description:ctx.pc.localDescription})}
      catch(e){this.opts.onRtcError?.(e)}finally{ctx.makingOffer=false}
    }
    return ctx;
  }
  async handleSignal(fromPeerId,signal){
    let ctx=this.peers.get(fromPeerId);
    if(!ctx)ctx=this.createCtx({peerId:fromPeerId,participantId:'',name:'Participante',role:'guest'});
    const pc=ctx.pc;
    try{
      if(signal.description){
        const d=signal.description;
        const collision=d.type==='offer'&&(ctx.makingOffer||pc.signalingState!=='stable');
        ctx.ignoreOffer=!ctx.polite&&collision;
        if(ctx.ignoreOffer)return;
        await pc.setRemoteDescription(d);
        if(d.type==='offer'){
          await pc.setLocalDescription();
          this.sendSignal(fromPeerId,{description:pc.localDescription});
        }
      }else if(signal.candidate){
        try{await pc.addIceCandidate(signal.candidate)}catch(e){if(!ctx.ignoreOffer)throw e}
      }
    }catch(e){this.opts.onRtcError?.(e)}
  }
  sendSignal(toPeerId,signal){
    if(this.ws?.readyState===1)this.ws.send(JSON.stringify({type:'cam:signal',toPeerId,signal}));
  }
  sendMediaState(state={}){
    if(this.ws?.readyState===1)this.ws.send(JSON.stringify({type:'cam:media-state',audioEnabled:!!state.audioEnabled,videoEnabled:!!state.videoEnabled}));
  }
  async setLocalStream(stream){
    this.localStream=stream||null;
    for(const ctx of this.peers.values())await this.applyPeerPermissions(ctx,ctx.permissions||{},true);
  }
  unlockCamera(targetParticipantId,pin){
    const target=String(targetParticipantId||''),code=String(pin||'').trim();
    if(!target)return Promise.reject(new Error('Falta la cámara que quieres desbloquear.'));
    if(!/^\d{4,8}$/.test(code))return Promise.reject(new Error('El PIN debe tener de 4 a 8 números.'));
    if(this.ws?.readyState!==1)return Promise.reject(new Error('Cam Room está reconectando.'));
    const requestId=`unlock_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pendingUnlocks.delete(requestId);reject(new Error('La verificación del PIN tardó demasiado.'))},8000);
      this.pendingUnlocks.set(requestId,{resolve,reject,timer});
      this.ws.send(JSON.stringify({type:'cam:unlock',requestId,targetParticipantId:target,pin:code}));
    });
  }
  qualityProfile(count){
    if(count<=3)return {w:1280,h:720,fps:30,video:1200000,audio:64000};
    if(count<=5)return {w:960,h:540,fps:24,video:800000,audio:56000};
    if(count<=7)return {w:854,h:480,fps:22,video:580000,audio:48000};
    return {w:640,h:360,fps:20,video:380000,audio:40000};
  }
  async optimizeForParticipants(count){
    this.participantCount=Math.max(1,count||1);
    const q=this.qualityProfile(this.participantCount);
    const vt=this.localStream?.getVideoTracks?.()[0];
    if(vt){
      try{vt.contentHint='motion'}catch{}
      try{await vt.applyConstraints({width:{ideal:q.w,max:q.w},height:{ideal:q.h,max:q.h},frameRate:{ideal:q.fps,max:q.fps}})}catch{}
    }
    for(const ctx of this.peers.values())await this.tuneSenderBitrates(ctx);
  }
  async tuneSenderBitrates(ctx){
    if(!ctx?.pc)return;
    const q=this.qualityProfile(this.participantCount||1);
    for(const sender of ctx.pc.getSenders()){
      if(!sender.track)continue;
      try{
        const p=sender.getParameters();
        if(!p.encodings||!p.encodings.length)p.encodings=[{}];
        p.encodings[0].maxBitrate=sender.track.kind==='video'?(ctx.peer?.role==='obs'?Math.max(q.video,1000000):q.video):q.audio;
        if(sender.track.kind==='video')p.degradationPreference='balanced';
        await sender.setParameters(p);
      }catch{}
    }
  }
  removePeer(peerId,participantId){
    const ctx=this.peers.get(peerId);
    if(ctx){clearTimeout(ctx.restartTimer);try{ctx.pc.close()}catch{}this.peers.delete(peerId)}
    this.opts.onPeerLeft?.(peerId,participantId);
  }
  resetPeers(){
    for(const ctx of this.peers.values()){clearTimeout(ctx.restartTimer);try{ctx.pc.close()}catch{}}
    this.peers.clear();
  }
  close(){
    if(this.closed)return;
    this.closed=true;
    clearTimeout(this.reconnectTimer);
    for(const p of this.pendingUnlocks.values()){clearTimeout(p.timer);p.reject(new Error('Cam Room se cerró.'))}this.pendingUnlocks.clear();
    this.resetPeers();
    if(this.ws?.readyState===1)try{this.ws.send(JSON.stringify({type:'cam:leave'}))}catch{}
    try{this.ws?.close()}catch{}
  }
}
window.GrenaCamRTC=GrenaCamRTC;
})();
