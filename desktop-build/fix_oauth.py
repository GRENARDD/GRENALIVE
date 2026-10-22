#!/usr/bin/env python3
"""GREÑA Desktop v5.0.2: allow only trusted local OAuth popup windows."""
from pathlib import Path
import json, sys, re

root=Path(sys.argv[1]).resolve()
main_path=root/'desktop'/'main.cjs'
server_path=root/'server.mjs'
pkg_path=root/'package.json'
p=json.loads(pkg_path.read_text(encoding='utf-8'))
if p.get('version')!='5.0.1':
    raise RuntimeError('Se esperaba la version 5.0.1 despues de fix_startup.py')
main=main_path.read_text(encoding='utf-8')
old='''  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // External OAuth pages open in the system browser, not inside GREÑA.
    if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });'''
new='''  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let target;
    try { target = new URL(url); } catch { return { action: 'deny' }; }
    // Permitir solo ventanas de OAuth locales y conservar cookies de GREÑA.
    if (target.origin === ADDRESS && /^\\/oauth\\/(twitch|kick|youtube|tiktok)\\/start$/.test(target.pathname)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 660, height: 800, minWidth: 490, minHeight: 620,
          title: 'GREÑA LIVE · Vincular cuenta', autoHideMenuBar: true,
          parent: mainWindow, backgroundColor: '#0b1018',
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
        }
      };
    }
    if (target.protocol === 'https:') shell.openExternal(url).catch(e=>logStartup('OAuth externo:',e.message));
    return { action: 'deny' };
  });
  mainWindow.webContents.on('did-create-window', (popup) => {
    popup.webContents.setWindowOpenHandler(({url}) => {
      if (/^https:\/\//i.test(url)) shell.openExternal(url).catch(()=>{});
      return {action:'deny'};
    });
    popup.webContents.on('will-navigate',(event,url)=>{
      try {
        const target=new URL(url);
        if(target.protocol==='http:' && target.origin!==ADDRESS) event.preventDefault();
        if(!['https:','http:'].includes(target.protocol)) event.preventDefault();
      } catch { event.preventDefault(); }
    });
  });'''
if main.count(old)!=1:
    raise RuntimeError('El manejador OAuth original de Electron no coincide con el esperado.')
main=main.replace(old,new,1)
main_path.write_text(main,encoding='utf-8')
server=server_path.read_text(encoding='utf-8')
match=re.search(r'(?m)^const OAUTH_BASE=PUBLIC_URL\|\|.*?;$',server)
if not match or 'http://localhost:' not in match.group():
    raise RuntimeError('No se encontro la base OAuth localhost')
server=server[:match.start()]+match.group().replace('http://localhost:','http://127.0.0.1:',1)+server[match.end():]
server_path.write_text(server,encoding='utf-8')
p['version']='5.0.2'
pkg_path.write_text(json.dumps(p,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print('OK: Desktop v5.0.2 OAuth con ventanas locales permitidas, configuracion privada intacta.')
