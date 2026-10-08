// Se inyecta únicamente en la pestaña GREÑA elegida expresamente por el usuario.
(()=>{
 if(!document.getElementById('soundboardStrip'))return false;
 if(globalThis.__grenaHotkeysLinked)return true;
 globalThis.__grenaHotkeysLinked=true;
 chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type!=='GRENA_SOUND_SLOT')return;
  const slot=Number(message.slot);
  if(Number.isInteger(slot)&&slot>=1&&slot<=5){
   document.dispatchEvent(new CustomEvent('grena-global-hotkey',{detail:{slot}}));
   sendResponse({ok:true});
  }
 });
 return true;
})();
