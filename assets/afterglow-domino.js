/* GREÑA DOMINÓ: renderizado aislado dentro de la fuente OBS existente. */
(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positions={0:[],1:[[50,50]],2:[[24,24],[76,76]],3:[[24,24],[50,50],[76,76]],4:[[24,24],[76,24],[24,76],[76,76]],5:[[24,24],[76,24],[50,50],[24,76],[76,76]],6:[[24,20],[76,20],[24,50],[76,50],[24,80],[76,80]]};
function half(n){return '<div class="dom-half">'+positions[n].map(([x,y])=>'<i style="left:'+x+'%;top:'+y+'%"></i>').join('')+'</div>'}
function tile(a,b,i){return '<div class="dom-tile" style="--di:'+i+'">'+half(a)+'<div class="dom-line"></div>'+half(b)+'</div>'}
const samples={follow:[[6,6]],sub:[[6,6],[6,5],[5,5]],gift:[[6,6],[6,4],[4,4]],likes:[[1,1],[1,2],[2,2]],share:[[3,3],[3,4],[4,4]],raid:[[6,6],[6,5],[5,4],[4,3]]};
const titles={follow:'¡ENTRÓ A LA MESA!',sub:'¡SE FORMÓ EL TRANQUE!',gift:'¡JUGADA DE REGALO!',likes:'¡SIGUEN LOS PUNTOS!',share:'¡CORRE LA VOZ!',raid:'¡LLEGÓ LA GENTE!'};
function render(event,data,opts={}){
 const seq=samples[event]||samples.gift, gift=event==='gift'?' · '+esc(data.gift||'Regalo')+' ×'+esc(data.amount||1):event==='likes'?' · '+esc(data.amount||1):'';
 const img=event==='gift'&&/^https?:\/\//i.test(opts.giftSource||'')?'<img class="dom-gift-art" alt="" src="'+esc(opts.giftSource)+'">':'';
 return '<div class="dom-alert"><div class="dom-row">'+seq.map((t,i)=>tile(t[0],t[1],i)).join('')+'</div><div class="dom-title">'+titles[event]+'</div><div class="dom-name">'+esc(data.name||'Alguien')+'</div><div class="dom-meta">'+esc(opts.platform||'')+gift+'</div>'+img+'</div>';
}
window.AfterglowDomino={render};
})();