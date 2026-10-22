#!/usr/bin/env python3
"""Attach a native, isolated Electron floating bubble to GREÑA Desktop."""
from pathlib import Path
import sys
import json
root=Path(sys.argv[1]).resolve()
package=root/'package.json'
pkg=json.loads(package.read_text(encoding='utf-8'))
if pkg.get('version') != '5.0.6':
    raise RuntimeError('Se esperaba version 5.0.6 antes del modo burbuja')
pkg['version']='5.0.7'
files=pkg.get('build',{}).get('files')
if isinstance(files,list) and 'desktop-bubble.html' not in files:
    files.append('desktop-bubble.html')
package.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
main=root/'desktop'/'main.cjs'
s=main.read_text(encoding='utf-8')
if "let mainWindow, backend" not in s or "const { app" not in s or "ADDRESS" not in s:
    raise RuntimeError("GREÑA Electron main layout changed; refusing unsafe bubble patch")
if "GRENA_FLOATING_BUBBLE_V1" in s:
    raise RuntimeError("Floating bubble patch was already applied")
if not (root/'desktop-bubble.html').is_file():
    raise RuntimeError("desktop-bubble.html missing from build")

s += r'''

// GRENA_FLOATING_BUBBLE_V1
// This feature owns only a separate isolated Electron window.
// Never stop the Node backend or disconnect live channels when activating it.
{
 const {screen}=require('electron');
 let grenaBubble=null;
 let grenaBubbleQuitting=false;
 let grenaBubbleAttachedTo=null;
 app.on('before-quit',()=>{grenaBubbleQuitting=true});
 const isBubbleAction=(address,action)=>{
   try{
     const u=new URL(address);
     return u.origin===new URL(ADDRESS).origin&&u.pathname===action;
   }catch{return false}
 };
 const restoreGrenaBubble=()=>{
   if(grenaBubble&&!grenaBubble.isDestroyed()){
     const old=grenaBubble;grenaBubble=null;old.close();
   }
   if(mainWindow&&!mainWindow.isDestroyed()){
     mainWindow.show();mainWindow.restore();mainWindow.focus();
   }
 };
 const enableGrenaBubble=()=>{
   if(!mainWindow||mainWindow.isDestroyed())return;
   if(grenaBubble&&!grenaBubble.isDestroyed()){grenaBubble.show();grenaBubble.focus();mainWindow.hide();return}
   const display=screen.getDisplayMatching(mainWindow.getBounds());
   const work=display.workArea;const w=318,h=156;
   grenaBubble=new BrowserWindow({
     x:Math.max(work.x,work.x+work.width-w-16),
     y:Math.max(work.y,work.y+work.height-h-12),
     width:w,height:h,
     show:false,frame:false,transparent:true,hasShadow:false,backgroundColor:'#00000000',
     alwaysOnTop:true,skipTaskbar:true,resizable:false,maximizable:false,fullscreenable:false,
     title:'GREÑA LIVE · Burbuja',
     webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}
   });
   const popup=grenaBubble;
   popup.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   popup.webContents.on('will-navigate',(event,url)=>{
     event.preventDefault();
     if(isBubbleAction(url,'/__grena_bubble_restore__'))restoreGrenaBubble();
   });
   popup.on('closed',()=>{
     if(grenaBubble===popup)grenaBubble=null;
     if(!grenaBubbleQuitting&&mainWindow&&!mainWindow.isDestroyed()&&!mainWindow.isVisible()){
       mainWindow.show();mainWindow.focus();
     }
   });
   popup.loadURL(new URL('/desktop-bubble.html',ADDRESS).toString())
     .then(()=>{if(!popup.isDestroyed()){popup.showInactive();mainWindow.hide()}})
     .catch(error=>{
       logStartup('BURBUJA ERROR',String(error?.message||error));
       if(!popup.isDestroyed())popup.destroy();
     });
 };
 const attachGrenaBubbleNavigation=()=>{
   if(!mainWindow||mainWindow.isDestroyed()||grenaBubbleAttachedTo===mainWindow)return false;
   grenaBubbleAttachedTo=mainWindow;
   const exposeBubbleControl=()=>{
     if(!mainWindow.isDestroyed())mainWindow.webContents.executeJavaScript(
       "(()=>{const b=document.getElementById('grenaBubbleModeControl');if(b)b.style.display='inline-flex'})()"
     ).catch(()=>{});
   };
   mainWindow.webContents.on('dom-ready',exposeBubbleControl);
   exposeBubbleControl();
   mainWindow.webContents.on('will-navigate',(event,url)=>{
     if(isBubbleAction(url,'/__grena_bubble_mode__')){
       event.preventDefault();enableGrenaBubble();
     }
   });
   return true;
 };
 app.whenReady().then(()=>{
   if(attachGrenaBubbleNavigation())return;
   const poll=setInterval(()=>{if(attachGrenaBubbleNavigation())clearInterval(poll)},250);
   poll.unref?.();
 });
}
'''
main.write_text(s,encoding='utf-8')
print('GREÑA Desktop: bubble mode integrated with isolated frameless Electron window.')
