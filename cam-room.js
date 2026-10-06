(()=>{'use strict';
const $=id=>document.getElementById(id);
const state={room:null,rtc:null,localStream:null,participants:[],streams:new Map(),audible:new Set(),unlocked:new Map(),obsToken:'',pin:'',micEnabled:false,refreshTimer:null};
const isLocal=u=>{try{const h=new URL(u).hostname;return ['127.0.0.1','localhost','::1'].includes(h)}catch{return true}};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function validPin(v){return /^\d{4,8}$/.test(String(v||'').trim())}
function selfId(p){return p?.participantId===state.rtc?.participantId||p?.role==='host'&&p?.participantId===`host_${state.room?.id}`}
async function api(path,opts={}){const r=await fetch(path,{cache:'no-store',headers:{'content-type':'application/json',...(opts.headers||{})},...opts});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);return d}
async function copy(t){try{await navigator.clipboard.writeText(t)}catch{const x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();document.execCommand('copy');x.remove()}$('serviceStatus').textContent='✓ Copiado';setTimeout(()=>$('serviceStatus').textContent='● Cam Room listo',1200)}
function accessFor(p){if(selfId(p))return {obsToken:state.obsToken,pin:state.pin};return state.unlocked.get(p.participantId)||null}
function obsUrl(p,audio=false){const b=(state.room.localBase||location.origin).replace(/\/$/,'');const access=accessFor(p),token=access?.obsToken||'';if(!token)throw Error('Primero desbloquea esta cámara con su PIN.');return `${b}/cam-source.html?room=${encodeURIComponent(state.room.id)}&participant=${encodeURIComponent(p.participantId)}&token=${encodeURIComponent(token)}&audio=${audio?'1':'0'}`}
function updateExternalStatus(){if(!state.room)return;const ok=!!state.room.externalReady&&!isLocal(state.room.inviteUrl)&&String(state.room.inviteUrl||'').startsWith('https://'),el=$('externalStatus');if(!el)return;if(ok){el.className='secure-ok';el.textContent='✓ Enlace HTTPS externo activo · funciona desde otra red o país.'}else{el.className='secure-warn';el.textContent='⚠ Reconectando el acceso externo de la sala…'}}
function mediaIcon(p){return p.audioEnabled?'🎙 Mic activo':'🔇 Mic muteado'}
async function unlockParticipant(participantId,presetPin=''){
 const p=state.participants.find(x=>x.participantId===participantId);if(!p||selfId(p))return true;
 let pin=String(presetPin||'').trim();if(!pin)pin=String(prompt(`PIN de la cámara de ${p.name}:`,'')||'').trim();if(!pin)return false;
 if(!validPin(pin)){alert('El PIN debe tener de 4 a 8 números.');return false}
 try{const r=await state.rtc.unlockCamera(participantId,pin);state.unlocked.set(participantId,{pin,obsToken:r.obsToken||''});render();return true}catch(e){if(!presetPin)alert(e.message||'PIN incorrecto.');return false}
}
async function restoreUnlocks(){for(const [id,a] of state.unlocked){if(a?.pin)await unlockParticipant(id,a.pin).catch(()=>{})}}
function render(){
 const box=$('participants');
 $('roomCount').textContent=`${state.participants.length} participante${state.participants.length===1?'':'s'}`;
 $('emptyParticipants').classList.toggle('hidden',state.participants.length>0);box.innerHTML='';
 for(const p of state.participants){
  const self=selfId(p),access=accessFor(p),unlocked=self||!!access,stream=self?state.localStream:state.streams.get(p.participantId),listening=state.audible.has(p.participantId);
  const article=document.createElement('article');article.className='participant';
  const locked=unlocked?'':`<div class="locked-camera"><div><b>🔒 PIN REQUERIDO</b><small>${esc(p.name)} debe darte su PIN para ver o copiar esta cámara.</small></div></div>`;
  const buttons=self?`<button class="btn" data-obs="${esc(p.participantId)}">Copiar OBS</button><button class="btn obs-audio" data-obsa="${esc(p.participantId)}">OBS + audio</button>`:unlocked?`<button class="btn audio-btn" data-audio="${esc(p.participantId)}">${listening?'🔊 Mutear':'🔇 Escuchar'}</button><button class="btn" data-obs="${esc(p.participantId)}">Copiar OBS</button><button class="btn obs-audio" data-obsa="${esc(p.participantId)}">OBS + audio</button>`:`<button class="btn unlock-btn" data-unlock="${esc(p.participantId)}">🔒 Ver / OBS</button>`;
  article.innerHTML=`<div class="video-box"><video autoplay playsinline ${self||!listening?'muted':''}></video><div class="video-placeholder">${self?'TU CÁMARA':'CÁMARA REMOTA'}</div>${locked}<div class="video-label">${p.role==='host'?'ANFITRIÓN':'INVITADO'} · ${esc(mediaIcon(p))}</div></div><div class="participant-foot"><div><b>${esc(p.name)}${self?' · Tú':''}</b><small class="pin-badge">${self?'Tu cámara protegida por PIN':unlocked?'PIN verificado':'Cámara bloqueada'}</small></div><div class="participant-buttons">${buttons}</div></div>`;
  box.appendChild(article);const v=article.querySelector('video'),ph=article.querySelector('.video-placeholder');if(stream&&unlocked){v.srcObject=stream;v.muted=self||!listening;v.play().catch(()=>{});ph.classList.add('hidden')}
 }
 box.querySelectorAll('[data-unlock]').forEach(b=>b.onclick=()=>unlockParticipant(b.dataset.unlock));
 box.querySelectorAll('[data-audio]').forEach(b=>b.onclick=()=>{const id=b.dataset.audio;if(state.audible.has(id))state.audible.delete(id);else state.audible.add(id);render()});
 box.querySelectorAll('[data-obs]').forEach(b=>b.onclick=()=>{const p=state.participants.find(x=>x.participantId===b.dataset.obs);if(p)try{copy(obsUrl(p,false))}catch(e){alert(e.message)}});
 box.querySelectorAll('[data-obsa]').forEach(b=>b.onclick=()=>{const p=state.participants.find(x=>x.participantId===b.dataset.obsa);if(p)try{copy(obsUrl(p,true))}catch(e){alert(e.message)}});
}
async function connectHost(){
 if(!validPin(state.pin))throw Error('Define un PIN de 4 a 8 números para tu cámara.');
 state.rtc?.close();state.rtc=new GrenaCamRTC({role:'host',localStream:state.localStream,
  onJoined:m=>{state.obsToken=m.roomObsToken||state.room.obsToken||'';state.rtc.sendMediaState({audioEnabled:state.micEnabled,videoEnabled:!!state.localStream?.getVideoTracks().length});restoreUnlocks()},
  onRoomState:p=>{state.participants=p;render()},onRemoteTrack:(peer,stream)=>{state.streams.set(peer.participantId,stream);render()},onPeerLeft:(peerId,pid)=>{state.streams.delete(pid);state.audible.delete(pid);render()},onStatus:s=>$('serviceStatus').textContent=s==='Conectado'?'● Cam Room listo':'● '+s,onError:e=>{$('serviceStatus').textContent='⚠ '+e}
 });
 await state.rtc.connect({role:'host',roomId:state.room.id,pin:state.pin,audioEnabled:state.micEnabled,videoEnabled:!!state.localStream?.getVideoTracks().length});
}
function storedPin(roomId){try{return sessionStorage.getItem('grenaCamPin:'+roomId)||''}catch{return ''}}
function storePin(roomId,pin){try{sessionStorage.setItem('grenaCamPin:'+roomId,pin)}catch{}}
function showRoom(room,participants=[]){state.room=room;state.obsToken=room.obsToken||state.obsToken||'';state.pin=state.pin||storedPin(room.id);state.participants=participants;$('noRoom').classList.add('hidden');$('roomView').classList.remove('hidden');$('roomCode').textContent=room.code;$('inviteUrl').value=room.inviteUrl||'';updateExternalStatus();render();if(!validPin(state.pin)){const entered=String(prompt('Crea el PIN de tu cámara (4 a 8 números):','')||'').trim();if(validPin(entered)){state.pin=entered;storePin(room.id,entered)}else{$('serviceStatus').textContent='⚠ Define un PIN válido para entrar con tu cámara';return}}if(!state.rtc||state.rtc.closed)connectHost().catch(e=>$('serviceStatus').textContent='⚠ '+e.message)}
async function refreshRoom(){if(!state.room)return;try{const d=await api('/api/cam-room/current');if(!d.room)return;if(d.room.inviteUrl&&d.room.inviteUrl!==state.room.inviteUrl){state.room={...state.room,...d.room};$('inviteUrl').value=state.room.inviteUrl}else state.room={...state.room,...d.room};updateExternalStatus()}catch{}}
async function load(){try{const d=await api('/api/cam-room/current');if(d.room)showRoom(d.room,d.participants||[])}catch(e){$('serviceStatus').textContent='⚠ '+e.message}finally{clearInterval(state.refreshTimer);state.refreshTimer=setInterval(refreshRoom,5000)}}
$('createRoom').onclick=async()=>{const b=$('createRoom'),status=$('createStatus'),pin=String($('hostPinCreate')?.value||'').trim();if(!validPin(pin)){status.className='secure-warn';status.textContent='⚠ Crea primero un PIN de 4 a 8 números para tu cámara.';$('hostPinCreate')?.focus();return}try{state.pin=pin;b.disabled=true;b.textContent='Preparando sala…';status.className='secure-ok';status.textContent='Preparando enlace HTTPS externo seguro… La primera vez GREÑA puede descargar el componente de conexión.';const d=await api('/api/cam-room/create',{method:'POST',body:'{}'});if(!d.room?.externalReady)throw Error('La sala no obtuvo un enlace HTTPS externo.');storePin(d.room.id,pin);showRoom(d.room,[])}catch(e){status.className='secure-warn';status.textContent='⚠ '+e.message;alert(e.message)}finally{b.disabled=false;b.textContent='＋ Crear sala'}};
$('hostPinCreate')?.addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,8)});
$('copyInvite').onclick=$('copyInvite2').onclick=()=>{if(!state.room?.inviteUrl)return;if(isLocal(state.room.inviteUrl)||!String(state.room.inviteUrl).startsWith('https://'))return alert('GREÑA todavía está preparando el enlace externo. Espera unos segundos.');copy(state.room.inviteUrl)};
$('closeRoom').onclick=async()=>{if(!confirm('¿Cerrar la sala y desconectar a todos los invitados?'))return;await api('/api/cam-room/close',{method:'POST',body:'{}'}).catch(()=>{});state.rtc?.close();state.localStream?.getTracks().forEach(t=>t.stop());location.reload()};
$('toggleCamera').onclick=async()=>{try{if(state.localStream){state.localStream.getTracks().forEach(t=>t.stop());state.localStream=null;state.micEnabled=false;await state.rtc?.setLocalStream(null);state.rtc?.sendMediaState({audioEnabled:false,videoEnabled:false});$('toggleCamera').textContent='Activar mi cámara';$('toggleMic').textContent='🎙 Activar mi micrófono';$('toggleMic').disabled=true;render();return}state.localStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:30,max:30}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});state.localStream.getAudioTracks().forEach(t=>t.enabled=false);state.micEnabled=false;await state.rtc?.setLocalStream(state.localStream);state.rtc?.sendMediaState({audioEnabled:false,videoEnabled:true});$('toggleCamera').textContent='Desactivar mi cámara';$('toggleMic').disabled=false;$('toggleMic').textContent='🎙 Activar mi micrófono';render()}catch(e){alert('No se pudo abrir cámara/micrófono.\n\n'+e.message)}};
$('toggleMic').onclick=()=>{const at=state.localStream?.getAudioTracks?.()[0];if(!at)return;state.micEnabled=!state.micEnabled;at.enabled=state.micEnabled;$('toggleMic').textContent=state.micEnabled?'🔇 Mutear mi micrófono':'🎙 Activar mi micrófono';state.rtc?.sendMediaState({audioEnabled:state.micEnabled,videoEnabled:!!state.localStream?.getVideoTracks().length});render()};
window.addEventListener('beforeunload',()=>{clearInterval(state.refreshTimer);state.rtc?.close()});load();
})();
