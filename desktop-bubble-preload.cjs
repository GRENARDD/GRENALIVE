'use strict';
// Bridge mínimo para el tamaño de la burbuja. Ningún acceso a filesystem,
// Node, URL remota o ventanas principales desde el contenido HTML.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('grenaBubble',{
  resize(value={}){
    const height=Number(value.height);
    if(!Number.isFinite(height))return;
    ipcRenderer.send('grena:bubble:layout',{
      height:Math.round(height),
      expanded:value.expanded===true
    });
  }
});
