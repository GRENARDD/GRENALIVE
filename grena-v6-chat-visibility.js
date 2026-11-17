/* GREÑA Live 6 · solo filtrado visual por estado real comunicado desde el panel padre.
   No borra eventos, no detiene motores y deja siempre visibles los botones de conectar. */
(()=>{
 'use strict';
 if(window.parent===window)return;
 let known=false,visible=new Set();
 const names=['tiktok','twitch','kick','youtube'];
 const update=()=>{
  if(!known)return;
  for(const p of names){
   const tab=document.querySelector('.cc-filter-tabs [data-chat-filter="'+p+'"]');
   if(tab)tab.hidden=!visible.has(p);
  }
  for(const msg of document.querySelectorAll('#chat .msg')){
   const platform=names.find(p=>msg.classList.contains(p));
   msg.classList.toggle('grena-v6-unlinked',!!platform&&!visible.has(platform));
  }
  const active=document.querySelector('.cc-filter-tabs [data-chat-filter].active');
  if(active?.hidden)document.querySelector('.cc-filter-tabs [data-chat-filter="all"]')?.click();
 };
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  if(event.data?.type!=='grena-v6-linked-platforms'||!Array.isArray(event.data.linked))return;
  known=true;visible=new Set(event.data.linked.filter(p=>names.includes(p)));update();
 });
 const chat=document.getElementById('chat');
 if(chat)new MutationObserver(update).observe(chat,{childList:true,subtree:false});
})();
