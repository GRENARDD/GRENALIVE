// Chrome registra los atajos globales; el control de audio sigue dentro de GREÑA.
chrome.commands.onCommand.addListener(async command=>{
 const match=/^sound-([1-5])$/.exec(command);
 if(!match)return;
 const {grenaTabId}=await chrome.storage.local.get('grenaTabId');
 if(!Number.isInteger(grenaTabId))return;
 try{
  await chrome.tabs.sendMessage(grenaTabId,{type:'GRENA_SOUND_SLOT',slot:Number(match[1])});
 }catch{
  // El usuario cerró o recargó GREÑA: debe volver a pulsar "Vincular" en la extensión.
 }
});
chrome.tabs.onRemoved.addListener(async tabId=>{
 const {grenaTabId}=await chrome.storage.local.get('grenaTabId');
 if(tabId===grenaTabId)await chrome.storage.local.remove('grenaTabId');
});
