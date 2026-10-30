#!/usr/bin/env python3
"""GREÑA Desktop: install Electron updater with explicit Cloudflare owner release gate."""
from pathlib import Path
import json, os, re, sys
root=Path(sys.argv[1]).resolve()
pkgpath=root/'package.json'
pkg=json.loads(pkgpath.read_text(encoding='utf-8'))
if pkg.get('version')!='5.0.9':
    raise RuntimeError('Se esperaba GREÑA Desktop v5.0.9 antes de añadir autoactualizaciones')
tag=os.getenv('GITHUB_REF_NAME','') if os.getenv('GITHUB_REF_TYPE')=='tag' else ''
if tag and not re.fullmatch(r'v[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,4}',tag):
    raise RuntimeError('Tag de actualización inválido')
pkg['version']=tag[1:] if tag else '5.1.6'
pkg.setdefault('dependencies',{})['electron-updater']='^6.6.2'
pkg['build']['publish']={'provider':'github','owner':'GRENARDD','repo':'GRENALIVE','releaseType':'release'}
pkgpath.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
main=root/'desktop'/'main.cjs'
s=main.read_text(encoding='utf-8')
if 'GRENA_NATIVE_OFFICIAL_UPDATES_V1' in s:
    raise RuntimeError('Ya se instaló el actualizador de GREÑA')
if 'let mainWindow, backend' not in s or 'app.whenReady()' not in s:
    raise RuntimeError('No se reconoce el lanzador Electron; no se modifica')
s+=r"""

// GRENA_NATIVE_OFFICIAL_UPDATES_V1
// Windows NSIS updates are NOT scanned from GitHub directly.
// The owner must explicitly approve the exact release in Cloudflare D1 first.
{
 const {autoUpdater}=require('electron-updater');
 const releaseBase='https://grena-live-licenses.omelicolon18.workers.dev';
 const updateFeed=releaseBase+'/api/updates/';
 autoUpdater.autoDownload=false;
 autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.allowPrerelease=false;
 autoUpdater.setFeedURL({provider:'generic',url:updateFeed});
 let lastOffered='',downloading=false,checking=false;
 const logError=e=>{try{logStartup('AUTOACTUALIZADOR',String(e?.message||e))}catch{}};
 const showUpdateDialog=opts=>mainWindow&&!mainWindow.isDestroyed()?dialog.showMessageBox(mainWindow,opts):dialog.showMessageBox(opts);
 const isNewVersion=(candidate,current)=>{
   if(!/^\d+\.\d+\.\d+$/.test(candidate)||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(current))return false;
   const stableCurrent=current.split('-')[0];
   const a=candidate.split('.').map(Number),b=stableCurrent.split('.').map(Number);
   for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}
   return current!==stableCurrent;
 };
 autoUpdater.on('error',error=>{
   downloading=false;lastOffered='';
   if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(-1);
   logError(error);
 });
 autoUpdater.on('update-available',info=>{
   if(info.version===lastOffered)return;
   lastOffered=info.version;
   showUpdateDialog({
     type:'info',title:'GREÑA Live PRO · Actualización oficial',
     message:'Nueva versión oficial: GREÑA Live PRO v'+info.version,
     detail:'Publicada por el propietario. ¿Quieres descargarla ahora? No cerraremos tu directo automáticamente.',
     buttons:['Actualizar ahora','Más tarde'],defaultId:0,cancelId:1,noLink:true
   }).then(answer=>{
     if(answer.response!==0||downloading)return;
     downloading=true;
     autoUpdater.downloadUpdate().catch(error=>{
       downloading=false;lastOffered='';
       if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(-1);
       logError(error);
     });
   }).catch(logError);
 });
 autoUpdater.on('download-progress',progress=>{
   if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(Math.max(0,Math.min(1,progress.percent/100)));
 });
 autoUpdater.on('update-downloaded',info=>{
   downloading=false;
   if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(-1);
   showUpdateDialog({
     type:'question',title:'GREÑA Live PRO · Lista para instalar',
     message:'GREÑA Live PRO v'+info.version+' está descargada y verificada.',
     detail:'La instalación cerrará GREÑA. Si estás transmitiendo, pulsa Más tarde y termina tu directo.',
     buttons:['Instalar y reiniciar','Más tarde'],defaultId:1,cancelId:1,noLink:true
   }).then(answer=>{
     if(answer.response===0)autoUpdater.quitAndInstall(false,true);
   }).catch(logError);
 });
 const checkOfficial=async()=>{
   if(checking||downloading||!app.isPackaged)return;
   checking=true;
   try{
     const response=await fetch(releaseBase+'/api/updates/latest',{signal:AbortSignal.timeout(9000),cache:'no-store'});
     if(!response.ok)return;
     const state=await response.json();
     // Neither a draft nor a merely uploaded GitHub Release can trigger an alert.
     const version=state?.published===true?state?.release?.version:'';
     if(version&&isNewVersion(version,app.getVersion()))await autoUpdater.checkForUpdates();
   }catch(error){logError(error)}
   finally{checking=false}
 };
 app.whenReady().then(()=>{
   setTimeout(()=>checkOfficial(),12000);
   const timer=setInterval(checkOfficial,2*60*1000);
   timer.unref?.();
 });
}
"""
main.write_text(s,encoding='utf-8')
print('GREÑA Desktop: actualización oficial por Cloudflare habilitada para',pkg['version'])
