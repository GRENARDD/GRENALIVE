(()=>{'use strict';
const q=new URLSearchParams(location.search),roomId=q.get('room')||'',target=q.get('participant')||'',token=q.get('token')||'',withAudio=q.get('audio')==='1',v=document.getElementById('sourceVideo'),status=document.getElementById('sourceStatus');
v.muted=!withAudio;
const rtc=new GrenaCamRTC({role:'obs',onJoined:()=>status.textContent='Esperando cámara…',onRemoteTrack:(peer,stream)=>{v.srcObject=stream;v.muted=!withAudio;v.play().catch(()=>{});status.style.display='none'},onError:e=>{status.style.display='block';status.textContent=e},onPeerLeft:()=>{status.style.display='block';status.textContent='Cámara desconectada · esperando reconexión…'}});
rtc.connect({role:'obs',roomId,obsToken:token,targetParticipantId:target}).catch(e=>status.textContent=e.message);
window.addEventListener('beforeunload',()=>rtc.close());
})();
