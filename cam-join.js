(()=>{'use strict';
const $=id=>document.getElementById(id),token=new URLSearchParams(location.search).get('invite')||'';
const state={room:null,rtc:null,stream:null,participants:[],streams:new Map(),audible:new Set(),unlocked:new Map(),obsToken:'',pin:'',micEnabled:false};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function validPin(v){return /^\d{4,8}$/.test(String(v||'').trim())}
function selfId(p){return p?.participantId===state.rtc?.participantId}
async function info(){const r=await fetch('/api/cam-room/invite?token='+encodeURIComponent(token),{cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'Invitación inválida');return d}
async function copy(t){try{await navigator.clipboard.writeText(t)}catch{const x=document.createElement('textarea');x.value=t;document.body.appendChild(x);x.select();document.execCommand('copy');x.remove()}$('guestStatus').textContent='✓ Copiado';setTimeout(()=>$('guestStatus').textContent='Conectado',1200)}
function accessFor(p){if(selfId(p))return {obsToken:state.obsToken,pin:state.pin};return state.unlocked.get(p.participantId)||null}
function obsUrl(p,audio=false){const access=accessFor(p),obsToken=access?.obsToken||'';if(!obsToken)throw Error('Primero desbloquea esta cámara con su PIN.');return `${location.origin}/cam-source.html?room=${encodeURIComponent(state.room.id)}&participant=${encodeURIComponent(p.participantId)}&token=${encodeURIComponent(obsToken)}&audio=${audio?'1':'0'}`}
async function unlockParticipant(participantId,presetPin=''){
 const p=state.participants.find(x=>x.participantId===participantId);if(!p||selfId(p))return true;
 let pin=String(presetPin||'').trim();if(!pin)pin=String(prompt(`PIN de la cámara de ${p.name}:`,'')||'').trim();if(!pin)return false;
 if(!validPin(pin)){alert('El PIN debe tener de 4 a 8 números.');return false}
 try{const r=await state.rtc.unlockCamera(participantId,pin);state.unlocked.set(participantId,{pin,obsToken:r.obsToken||''});render();return true}catch(e){if(!presetPin)alert(e.message||'PIN incorrecto.');return false}
}
async function restoreUnlocks(){for(const [id,a] of state.unlocked){if(a?.pin)await unlockParticipant(id,a.pin).catch(()=>{})}}
function render(){
 const box=$('guestParticipants');box.innerHTML='';$('guestCount').textContent=`${state.participants.length} en la sala`;
 for(const p of state.participants){
  const self=selfId(p),access=accessFor(p),unlocked=self||!!access,stream=self?state.stream:state.streams.get(p.participantId),listening=state.audible.has(p.participantId);
  const a=document.createElement('article');a.className='participant';
  const locked=unlocked?'':`<div class="locked-camera"><div><b>🔒 PIN REQUERIDO</b><small>${esc(p.name)} debe darte su PIN para ver o copiar esta cámara.</small></div></div>`;
  const buttons=self?`<button class="btn" data-obs="${esc(p.participantId)}">Copiar OBS</button><button class="btn obs-audio" data-obsa="${esc(p.participantId)}">OBS + audio</button>`:unlocked?`<button class="btn audio-btn" data-audio="${esc(p.participantId)}">${listening?'🔊 Mutear':'🔇 Escuchar'}</button><button class="btn" data-obs="${esc(p.participantId)}">Copiar OBS</button><button class="btn obs-audio" data-obsa="${esc(p.participantId)}">OBS + audio</button>`:`<button class="btn unlock-btn" data-unlock="${esc(p.participantId)}">🔒 Ver / OBS</button>`;
  a.innerHTML=`<div class="video-box"><video autoplay playsinline ${self||!listening?'muted':''}></video><div class="video-placeholder">${self?'TU CÁMARA':'CÁMARA REMOTA'}</div>${locked}<div class="video-label">${p.role==='host'?'ANFITRIÓN':'INVITADO'} · ${p.audioEnabled?'🎙 Mic activo':'🔇 Mic muteado'}</div></div><div class="participant-foot"><div><b>${esc(p.name)}${self?' · Tú':''}</b><small class="pin-badge">${self?'Tu cámara protegida por PIN':unlocked?'PIN verificado':'Cámara bloqueada'}</small></div><div class="participant-buttons">${buttons}</div></div>`;box.appendChild(a);
  const v=a.querySelector('video'),ph=a.querySelector('.video-placeholder');if(stream&&unlocked){v.srcObject=stream;v.muted=self||!listening;v.play().catch(()=>{});ph.classList.add('hidden')}
 }
 box.querySelectorAll('[data-unlock]').forEach(b=>b.onclick=()=>unlockParticipant(b.dataset.unlock));
 box.querySelectorAll('[data-audio]').forEach(b=>b.onclick=()=>{const id=b.dataset.audio;if(state.audible.has(id))state.audible.delete(id);else state.audible.add(id);render()});
 box.querySelectorAll('[data-obs]').forEach(b=>b.onclick=()=>{const p=state.participants.find(x=>x.participantId===b.dataset.obs);if(p)try{copy(obsUrl(p,false))}catch(e){alert(e.message)}});
 box.querySelectorAll('[data-obsa]').forEach(b=>b.onclick=()=>{const p=state.participants.find(x=>x.participantId===b.dataset.obsa);if(p)try{copy(obsUrl(p,true))}catch(e){alert(e.message)}});
}
(async()=>{try{const d=await info();state.room=d.room;$('inviteInfo').textContent=`${state.room.hostName} te invitó a una sala de cámaras. Escribe tu nombre y crea un PIN para proteger tu cámara.`;$('roomPill').textContent='SALA '+state.room.code;$('guestRoomCode').textContent='Sala '+state.room.code}catch(e){$('inviteInfo').textContent=e.message;$('joinBtn').disabled=true;$('joinError').textContent='Pide al anfitrión un enlace nuevo.'}})();
$('guestPin')?.addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,8)});
$('joinBtn').onclick=async()=>{const name=$('guestName').value.trim(),pin=String($('guestPin')?.value||'').trim();if(!name){$('joinError').textContent='Escribe tu nombre.';return}if(!validPin(pin)){$('joinError').textContent='Crea un PIN de 4 a 8 números para tu cámara.';$('guestPin')?.focus();return}try{state.pin=pin;$('joinError').textContent='Solicitando cámara…';state.stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:30,max:30}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});state.stream.getAudioTracks().forEach(t=>t.enabled=false);state.micEnabled=false;state.rtc=new GrenaCamRTC({role:'guest',localStream:state.stream,
 onJoined:m=>{state.obsToken=m.roomObsToken||'';$('joinScreen').classList.add('hidden');$('guestRoom').classList.remove('hidden');$('guestMic').textContent='🎙 Activar mi micrófono';state.rtc.sendMediaState({audioEnabled:false,videoEnabled:true});restoreUnlocks()},
 onRoomState:p=>{state.participants=p;render()},onRemoteTrack:(peer,s)=>{state.streams.set(peer.participantId,s);render()},onPeerLeft:(peerId,pid)=>{state.streams.delete(pid);state.audible.delete(pid);render()},onStatus:s=>$('guestStatus').textContent=s,onError:e=>$('joinError').textContent=e
 });await state.rtc.connect({role:'guest',inviteToken:token,name,pin,audioEnabled:false,videoEnabled:true})}catch(e){state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;$('joinError').textContent=e.message+' Usa un enlace HTTPS para entrar desde Internet.'}};
$('guestMic').onclick=()=>{const at=state.stream?.getAudioTracks?.()[0];if(!at)return;state.micEnabled=!state.micEnabled;at.enabled=state.micEnabled;$('guestMic').textContent=state.micEnabled?'🔇 Mutear mi micrófono':'🎙 Activar mi micrófono';state.rtc?.sendMediaState({audioEnabled:state.micEnabled,videoEnabled:true});render()};
$('leaveBtn').onclick=()=>{state.rtc?.close();state.stream?.getTracks().forEach(t=>t.stop());location.reload()};
window.addEventListener('beforeunload',()=>{state.rtc?.close();state.stream?.getTracks().forEach(t=>t.stop())});
})();
