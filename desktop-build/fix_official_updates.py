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
pkg['version']=tag[1:] if tag else '5.1.3'
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
 const {BrowserWindow}=require('electron');
 const releaseBase='https://grena-live-licenses.omelicolon18.workers.dev';
 const updateFeed=releaseBase+'/api/updates/';
 autoUpdater.autoDownload=false;
 autoUpdater.autoInstallOnAppQuit=false;
 autoUpdater.allowPrerelease=false;
 autoUpdater.setFeedURL({provider:'generic',url:updateFeed});
 let lastOffered='',downloading=false,checking=false,progressWindow=null,progressReady=false;
 const closeDownloadWindow=()=>{
   const win=progressWindow;progressWindow=null;progressReady=false;
   if(win&&!win.isDestroyed())win.close();
 };
 const showDownloadWindow=()=>{
   if(progressWindow&&!progressWindow.isDestroyed()){progressWindow.show();return}
   progressReady=false;
   const win=new BrowserWindow({
     width:500,height:250,resizable:false,maximizable:false,minimizable:true,
     parent:mainWindow&&!mainWindow.isDestroyed()?mainWindow:undefined,
     modal:false,show:false,backgroundColor:'#101525',
     title:'GREÑA Live PRO · Descargando actualización',
     autoHideMenuBar:true,
     webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}
   });
   progressWindow=win;
   win.on('closed',()=>{if(progressWindow===win){progressWindow=null;progressReady=false}});
   const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <style>*{box-sizing:border-box}body{margin:0;padding:24px;color:#f1f5ff;font:15px system-ui,'Segoe UI',sans-serif;background:#101525}
   b{font-size:18px}p{color:#b3bed8;font-size:12px;margin:8px 0 18px}.line{display:flex;align-items:baseline;justify-content:space-between}
   #pct{color:#77e4d6;font-size:29px;font-weight:900;font-variant-numeric:tabular-nums}
   progress{width:100%;height:23px;accent-color:#56c8ce;border-radius:12px}small{display:block;margin-top:12px;color:#b3bed8}</style>
   </head><body><div class="line"><b>Actualizando GREÑA Live</b><span id="pct">0%</span></div>
   <p>Descargando el instalador oficial. Puedes seguir usando tu directo.</p>
   <progress id="bar" value="0" max="100"></progress>
   <small id="details">Preparando descarga…</small>
   <script>window.updateProgress=function(p,done,total,speed){
     p=Math.max(0,Math.min(100,Number(p)||0));document.getElementById('bar').value=p;
     document.getElementById('pct').textContent=p.toFixed(1)+'%';
     const mb=n=>(Math.max(0,Number(n)||0)/1048576).toFixed(1)+' MB';
     document.getElementById('details').textContent=mb(done)+' / '+(total?mb(total):'tamaño pendiente')+(speed?' · '+mb(speed)+'/s':'');
   };<\/script></body></html>`;
   win.loadURL('data:text/html;charset=UTF-8,'+encodeURIComponent(html)).then(()=>{
     if(progressWindow!==win||win.isDestroyed())return;
     progressReady=true;win.show();
   }).catch(logError);
 };
 const renderDownloadProgress=p=>{
   const percent=Math.max(0,Math.min(100,Number(p.percent)||0));
   if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(percent/100);
   if(progressWindow&&!progressWindow.isDestroyed()){
     progressWindow.setTitle('GREÑA Live PRO · '+percent.toFixed(1)+'%');
     if(progressReady)progressWindow.webContents.executeJavaScript('window.updateProgress('+[percent,Number(p.transferred)||0,Number(p.total)||0,Number(p.bytesPerSecond)||0].join(',')+')').catch(logError);
   }
 };
 const logError=e=>{try{logStartup('AUTOACTUALIZADOR',String(e?.message||e))}catch{}};
 const showUpdateDialog=opts=>mainWindow&&!mainWindow.isDestroyed()?dialog.showMessageBox(mainWindow,opts):dialog.showMessageBox(opts);
 const isNewVersion=(candidate,current)=>{
   if(!/^\d+\.\d+\.\d+$/.test(candidate)||!/^\d+\.\d+\.\d+$/.test(current))return false;
   const a=candidate.split('.').map(Number),b=current.split('.').map(Number);
   for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}
   return false;
 };
 autoUpdater.on('error',logError);
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
     showDownloadWindow();
     autoUpdater.downloadUpdate().catch(error=>{
       downloading=false;closeDownloadWindow();
       if(mainWindow&&!mainWindow.isDestroyed())mainWindow.setProgressBar(-1);
       logError(error);
       showUpdateDialog({type:'error',title:'GREÑA Live · Descarga interrumpida',message:'No se completó la actualización.',detail:'Revisa tu conexión e intenta de nuevo cuando aparezca el aviso.',buttons:['Aceptar']}).catch(logError);
     });
   }).catch(logError);
 });
 autoUpdater.on('download-progress',renderDownloadProgress);
 autoUpdater.on('update-downloaded',info=>{
   downloading=false;
   closeDownloadWindow();
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
