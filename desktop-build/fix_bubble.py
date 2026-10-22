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
pkg['version']='5.0.8'
files=pkg.get('build',{}).get('files')
if isinstance(files,list):
    for required in ('desktop-bubble.html','desktop-bubble-preload.cjs'):
        if required not in files: files.append(required)
package.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
main=root/'desktop'/'main.cjs'
s=main.read_text(encoding='utf-8')
if "let mainWindow, backend" not in s or "const { app" not in s or "ADDRESS" not in s:
    raise RuntimeError("GREÑA Electron main layout changed; refusing unsafe bubble patch")
if "GRENA_FLOATING_BUBBLE_V1" in s:
    raise RuntimeError("Floating bubble patch was already applied")
for required in ('desktop-bubble.html','desktop-bubble-preload.cjs'):
    if not (root/required).is_file():
        raise RuntimeError(required+" missing from build")

s += r'''

// GRENA_FLOATING_BUBBLE_V1
// Version 2: full messages & alerts, safe automatic window sizing.
// This feature owns only a separate isolated Electron window.
// Never stop the Node backend or disconnect live channels when activating it.
{
 const {screen,ipcMain}=require('electron');
 let grenaBubble=null;
 let grenaBubbleQuitting=false;
 let grenaBubbleAttachedTo=null;
 app.on('before-quit',()=>{grenaBubbleQuitting=true});
 // The preload sends only a height and an optional expand flag.
 // Never accept messages from the main window, renderer frames or other senders.
 const applyGrenaBubbleLayout=(event,payload={})=>{
   const popup=grenaBubble;
   if(!popup||popup.isDestroyed()||event.sender!==popup.webContents)return;
   const area=screen.getDisplayMatching(popup.getBounds()).workArea;
   const wide=payload.expanded===true;
   const width=Math.min(Math.max(280,area.width-20),wide?576:435);
   const requested=Number(payload.height);
   if(!Number.isFinite(requested))return;
   const maxHeight=Math.max(160,Math.floor(area.height*.86));
   const height=Math.min(maxHeight,Math.max(156,Math.ceil(requested)));
   const old=popup.getBounds();
   // Keep the bottom-right anchor fixed while the notification grows upward.
   const right=old.x+old.width,bottom=old.y+old.height;
   const x=Math.max(area.x+8,Math.min(area.x+area.width-width-8,right-width));
   const y=Math.max(area.y+8,Math.min(area.y+area.height-height-8,bottom-height));
   if(old.x!==x||old.y!==y||old.width!==width||old.height!==height)
     popup.setBounds({x,y,width,height},false);
 };
 ipcMain.on('grena:bubble:layout',applyGrenaBubbleLayout);
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
   const work=display.workArea;const w=Math.min(435,Math.max(280,work.width-20)),h=166;
   grenaBubble=new BrowserWindow({
     x:Math.max(work.x,work.x+work.width-w-16),
     y:Math.max(work.y,work.y+work.height-h-12),
     width:w,height:h,
     show:false,frame:false,transparent:true,hasShadow:false,backgroundColor:'#00000000',
     alwaysOnTop:true,skipTaskbar:true,resizable:false,maximizable:false,fullscreenable:false,
     title:'GREÑA LIVE · Burbuja',
     webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,preload:join(APP_ROOT,'desktop-bubble-preload.cjs')}
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
