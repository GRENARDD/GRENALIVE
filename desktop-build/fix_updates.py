#!/usr/bin/env python3
"""Enable safe, opt-in GREÑA Desktop NSIS auto-updates from public GitHub Releases.
Run after the versioned 5.0.9 desktop patches. No destructive migration of user data.
"""
from pathlib import Path
import json
import sys
import os
import re

root=Path(sys.argv[1]).resolve()
package=root/'package.json'
launcher=root/'desktop'/'main.cjs'
index=root/'index.html'
pkg=json.loads(package.read_text(encoding='utf-8'))
if pkg.get('version')!='5.0.9':
    raise RuntimeError('Se esperaba GREÑA Desktop 5.0.9 antes de activar actualizaciones.')
if not isinstance(pkg.get('build'),dict):
    raise RuntimeError('electron-builder no está configurado; no se crean actualizaciones incompletas.')
tag=os.environ.get('GITHUB_REF_NAME','') if os.environ.get('GITHUB_REF_TYPE','')=='tag' else ''
pkg['version']=tag[1:] if re.fullmatch(r'v5\.\d+\.\d+',tag) else '5.0.10'
pkg.setdefault('dependencies',{})['electron-updater']='^6.6.2'
pkg['build']['publish']=[{'provider':'github','owner':'GRENARDD','repo':'GRENALIVE','releaseType':'release'}]
main=launcher.read_text(encoding='utf-8')
if 'GRENA_DESKTOP_UPDATER_V1' in main:
    raise RuntimeError('El módulo de actualización ya existe: evita duplicarlo.')
if 'let mainWindow, backend' not in main or 'const { app' not in main or 'ADDRESS' not in main:
    raise RuntimeError('Cambió el lanzador Electron; cancelando el parche de actualizaciones.')
main += r'''

// GRENA_DESKTOP_UPDATER_V1
// Updates are opt-in, delivered only through public GitHub Releases containing NSIS + latest.yml.
// Never force restart while the creator is live, and never install on ordinary app quit.
{
 const {autoUpdater} = require('electron-updater');
 const {dialog:updaterDialog} = require('electron');
 autoUpdater.autoDownload=false;
 autoUpdater.allowPrerelease=false;
 if('autoInstallEvent' in autoUpdater) autoUpdater.autoInstallEvent='manual';
 else autoUpdater.autoInstallOnAppQuit=false;
 let updateBusy=false;
 let lastCheck=0;
 let manualCheckPending=false;
 const updateLog=(...items)=>{try{logStartup('[UPDATES]',...items)}catch{console.log('[UPDATES]',...items)}};
 const notifyUpdateError=(error,manual)=>{
    updateLog('Error:',String(error?.message||error));
    if(manual && mainWindow && !mainWindow.isDestroyed())
      updaterDialog.showMessageBox(mainWindow,{type:'warning',title:'Actualizaciones GREÑA',
       message:'No se pudo consultar la actualización.',
       detail:'Comprueba Internet y que exista una versión publicada en GitHub Releases.',
       buttons:['Cerrar']}).catch(()=>{});
 };
 const checkGrenaUpdates=async(manual=false)=>{
   if(!app.isPackaged||process.platform!=='win32'){
     if(manual&&mainWindow&&!mainWindow.isDestroyed())
       updaterDialog.showMessageBox(mainWindow,{type:'info',message:'Las actualizaciones se comprueban en el instalador de Windows.',buttons:['Entendido']}).catch(()=>{});
     return;
   }
   if(updateBusy)return;
   if(!manual && Date.now()-lastCheck<20*60*1000)return;
   lastCheck=Date.now();
   updateBusy=true;
   manualCheckPending=!!manual;
   try{
     const result=await autoUpdater.checkForUpdates();
     if(manual&&(!result||!result.updateInfo))updateLog('Sin información de nueva versión');
   }catch(error){notifyUpdateError(error,manual);manualCheckPending=false}
   finally{updateBusy=false}
 };
 autoUpdater.on('update-available',async info=>{
   manualCheckPending=false;
   updateLog('Disponible:',info.version);
   if(!mainWindow||mainWindow.isDestroyed())return;
   try{
     const prompt=await updaterDialog.showMessageBox(mainWindow,{
      type:'info',title:'GREÑA LIVE · Actualización disponible',
      message:'Hay una nueva versión de GREÑA LIVE Desktop: '+info.version,
      detail:'¿Quieres descargarla ahora? La instalación y el reinicio solo ocurren cuando tú lo confirmes. No se modifican tus ajustes personales.',
      buttons:['Actualizar','Más tarde'],defaultId:0,cancelId:1,noLink:true
     });
     if(prompt.response!==0)return;
     mainWindow?.setProgressBar(0);
     await autoUpdater.downloadUpdate();
   }catch(error){mainWindow?.setProgressBar(-1);notifyUpdateError(error,true)}
 });
 autoUpdater.on('download-progress',p=>{
   if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(Math.max(0,Math.min(1,Number(p.percent||0)/100)));
 });
 autoUpdater.on('update-downloaded',async info=>{
   if(!mainWindow||mainWindow.isDestroyed())return;
   mainWindow.setProgressBar(-1);
   try{
     const prompt=await updaterDialog.showMessageBox(mainWindow,{
      type:'info',title:'GREÑA LIVE · Actualización lista',
      message:'GREÑA LIVE '+info.version+' está descargada.',
      detail:'Para no interrumpir tu directo, el programa solo se cerrará e instalará si pulsas Reiniciar e instalar.',
      buttons:['Reiniciar e instalar','Más tarde'],defaultId:1,cancelId:1,noLink:true
     });
     if(prompt.response===0)autoUpdater.quitAndInstall(false,true);
   }catch(error){notifyUpdateError(error,true)}
 });
 autoUpdater.on('error',err=>{updateLog('Updater error:',String(err?.message||err));if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(-1)});
 autoUpdater.on('update-not-available',()=>{
   updateLog('No hay actualizaciones.');
   if(manualCheckPending&&mainWindow&&!mainWindow.isDestroyed())
     updaterDialog.showMessageBox(mainWindow,{
       type:'info',title:'GREÑA LIVE · Actualizaciones',
       message:'Ya tienes la última versión publicada de GREÑA LIVE.',
       buttons:['Entendido']
     }).catch(()=>{});
   manualCheckPending=false;
 });
 const attachUpdateNavigation=()=>{
   if(!mainWindow||mainWindow.isDestroyed())return false;
   const showUpdateLink=()=>mainWindow.webContents.executeJavaScript(
     "(()=>{const e=document.getElementById('grenaUpdateControl');if(e)e.style.display='inline-flex'})()"
   ).catch(()=>{});
   mainWindow.webContents.on('dom-ready',showUpdateLink);
   mainWindow.webContents.on('will-navigate',(ev,url)=>{
     try{
       const u=new URL(url);
       if(u.origin===new URL(ADDRESS).origin&&u.pathname==='/__grena_update_check__'){
         ev.preventDefault();checkGrenaUpdates(true);
       }
     }catch{}
   });
   showUpdateLink();
   return true;
 };
 app.whenReady().then(()=>{
   if(!attachUpdateNavigation()){
     const t=setInterval(()=>{if(attachUpdateNavigation())clearInterval(t)},250);
     t.unref?.();
   }
   setTimeout(()=>checkGrenaUpdates(false),12000);
   const periodic=setInterval(()=>checkGrenaUpdates(false),6*60*60*1000);
   periodic.unref?.();
 });
}
'''
idx=index.read_text(encoding='utf-8')
needle='<a class="top-link" href="/mode.html"'
if idx.count(needle)!=1:
    raise RuntimeError('No se encuentra el menú superior para acceder a Buscar actualizaciones.')
idx=idx.replace(needle,'<a class="top-link" id="grenaUpdateControl" href="/__grena_update_check__" style="display:none" title="Buscar nueva versión del programa">↻ <span>Buscar actualización</span></a>\n      '+needle,1)
package.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
launcher.write_text(main,encoding='utf-8')
index.write_text(idx,encoding='utf-8')
print('GREÑA Desktop v5.0.10: actualización opt-in por GitHub Releases NSIS habilitada.')
