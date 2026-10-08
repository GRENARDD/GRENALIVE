const status=document.getElementById('status');
document.getElementById('pair').addEventListener('click',async()=>{
 try{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.id)throw Error('Abre primero la pestaña de GREÑA Live.');
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
  if(results?.[0]?.result!==true)throw Error('La pestaña activa no es el panel principal de GREÑA Live.');
  await chrome.storage.local.set({grenaTabId:tab.id});
  status.textContent='Vinculado. Los atajos funcionarán con Chrome minimizado mientras la pestaña permanezca abierta.';
 }catch(e){status.textContent=e?.message||'No fue posible vincular GREÑA.'}
});
document.getElementById('shortcuts').addEventListener('click',()=>{
 chrome.tabs.create({url:'chrome://extensions/shortcuts'});
});
(async()=>{
 const {grenaTabId}=await chrome.storage.local.get('grenaTabId');
 if(Number.isInteger(grenaTabId))status.textContent='Última pestaña vinculada: '+grenaTabId+'. Si recargaste GREÑA, vuelve a vincular.';
})();
