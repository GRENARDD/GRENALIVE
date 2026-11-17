#!/usr/bin/env python3
"""GREÑA LIVE 6.0.2: safe per-account global soundboard shortcuts in Electron.
This script is applied after fix_bubble.py to the generated desktop/main.cjs.
It does not alter the renderer DOM, the backend port or any GREÑA ID secret.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]).resolve()
main=root/'desktop'/'main.cjs'
s=main.read_text(encoding='utf-8')
if 'GRENA_SOUNDBOARD_GLOBAL_V602' in s:
    raise RuntimeError('The global shortcut patch is already installed')
if "let mainWindow, backend" not in s or "const { app" not in s:
    raise RuntimeError('Unknown Electron launcher; cannot attach soundboard shortcuts safely')
s+=r"""

// GRENA_SOUNDBOARD_GLOBAL_V602
// Only shortcuts for the authenticated local GREÑA ID profile are registered.
// No hard-coded accounts, tokens, or access to other users' local files.
{
 const {globalShortcut}=require('electron');
 const activeShortcuts=new Map();
 let scanning=false;
 const origin=new URL(ADDRESS).origin;
 const normalize=(stored)=>{
   const words=String(stored||'').split('+');
   const key=words.pop();
   if(!/^(?:F(?:[1-9]|1[0-2])|Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(key||''))return '';
   const mods=words.map(w=>({Ctrl:'Control',Alt:'Alt',Shift:'Shift',Meta:'Super'})[w]);
   if(mods.some(x=>!x)||new Set(mods).size!==mods.length)return '';
   // Never hijack ordinary typing across the entire computer.
   if(!/^F/.test(key)&&!mods.includes('Control')&&!mods.includes('Alt'))return '';
   const accelerator=/^Key[A-Z]$/.test(key)?key.slice(3):
     /^Digit[0-9]$/.test(key)?key.slice(5):
     /^Numpad[0-9]$/.test(key)?'num'+key.slice(6):key;
   const combo=[...mods,accelerator].join('+');
   if(combo==='Alt+F4'||combo==='Control+Alt+Delete')return '';
   return combo;
 };
 const cleanup=()=>{
   for(const key of activeShortcuts.keys())globalShortcut.unregister(key);
   activeShortcuts.clear();
 };
 app.on('will-quit',cleanup);
 // Soundpads also work when the streaming window is in the background.
 app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
 const update=async()=>{
   if(scanning||!mainWindow||mainWindow.isDestroyed()||mainWindow.webContents.isDestroyed()){return}
   scanning=true;
   try{
     const cookies=await mainWindow.webContents.session.cookies.get({url:origin});
     const cookieHeader=cookies.map(x=>x.name+'='+x.value).join('; ');
     let slots=[];
     if(cookieHeader){
       const response=await fetch(origin+'/api/soundboard',{
         headers:{cookie:cookieHeader,accept:'application/json'},
         signal:AbortSignal.timeout(3500),redirect:'error'
       });
       if(response.ok){const data=await response.json();slots=Array.isArray(data.slots)?data.slots:[]}
     }
     const desired=new Map();
     for(const pad of slots){
       if(pad.empty||!Number.isInteger(pad.slot)||pad.slot<1||pad.slot>5)continue;
       const key=normalize(pad.shortcut);
       if(key&&!desired.has(key))desired.set(key,pad.slot);
     }
     for(const [key,slot] of activeShortcuts){
       if(desired.get(key)!==slot){globalShortcut.unregister(key);activeShortcuts.delete(key)}
     }
     for(const [key,slot] of desired){
       if(activeShortcuts.has(key))continue;
       try{
         const ok=globalShortcut.register(key,()=>{
           if(!mainWindow||mainWindow.isDestroyed()||mainWindow.webContents.isDestroyed())return;
           // Server-authenticated profile in renderer determines which audio to play.
           const script='window.dispatchEvent(new CustomEvent("grena:soundboard:trigger",{detail:{slot:'+Number(slot)+'}}))';
           mainWindow.webContents.executeJavaScript(script,true).catch(()=>{});
         });
         if(ok)activeShortcuts.set(key,slot);
       }catch(error){logStartup('ATAJO GLOBAL NO DISPONIBLE',key,String(error?.message||error))}
     }
   }catch(error){
     // Offline or logged out means previous user must not retain global hotkeys.
     cleanup();
     logStartup('ATAJOS SOUNDBOARD',String(error?.message||error));
   }finally{scanning=false}
 };
 app.whenReady().then(()=>{
   update().catch(()=>{});
   const timer=setInterval(()=>update().catch(()=>{}),5000);
   timer.unref?.();
 });
}
"""
main.write_text(s,encoding='utf-8')
print('GREÑA: native account-scoped soundboard shortcuts attached to Windows Electron.')
