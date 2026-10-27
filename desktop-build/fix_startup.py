#!/usr/bin/env python3
"""Fix GREÑA LIVE 5.0: expose server.mjs as a real file for the Node child process."""
from pathlib import Path
import json, sys
root=Path(sys.argv[1]).resolve()
pkg_file=root/'package.json'
main_file=root/'desktop'/'main.cjs'
pkg=json.loads(pkg_file.read_text(encoding='utf-8'))
if pkg.get('version')!='5.0.0':
    raise RuntimeError('Se esperaba el kit Desktop 5.0.0; version encontrada: '+str(pkg.get('version')))
pkg['version']='5.0.1'
# ELECTRON_RUN_AS_NODE launches a separate process: virtual app.asar isn't a real path.
pkg['build']['asar']=False
# El paquete Electron debe incluir las rutas importadas por server.mjs en ejecución.
files=pkg['build'].get('files')
if isinstance(files,list):
    for required in ['grena-licensing.mjs','license.html','license-admin.html']:
        if required not in files:
            files.append(required)
pkg_file.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
s=main_file.read_text(encoding='utf-8')
def change(before,after):
    global s
    if s.count(before)!=1:
        raise RuntimeError('No se puede actualizar el lanzador: patron inesperado '+repr(before))
    s=s.replace(before,after,1)
change("const { existsSync } = require('node:fs');",
       "const { existsSync, mkdirSync, writeFileSync, appendFileSync, statSync } = require('node:fs');")
change("let mainWindow, backend, checking = false, stopping = false;",
"""let mainWindow, backend, checking = false, stopping = false;
let lastBackendError = '';
const LOG_DIR = join(app.getPath('appData'), 'GREÑA LIVE PRO', 'logs');
const DESKTOP_LOG = join(LOG_DIR, 'desktop-startup.log');
function logStartup(...parts) {
  try {
    mkdirSync(LOG_DIR, {recursive:true});
    if (existsSync(DESKTOP_LOG) && statSync(DESKTOP_LOG).size > 2 * 1024 * 1024)
      writeFileSync(DESKTOP_LOG, '[GREÑA] Nuevo diagnóstico\\n');
    appendFileSync(DESKTOP_LOG, '[' + new Date().toISOString() + '] ' + parts.map(String).join(' ') + '\\n');
  } catch(e) { console.warn('[GREÑA] no se pudo guardar el diagnóstico:', e.message); }
}
""")
change("  backend = spawn(process.execPath, [join(APP_ROOT, 'server.mjs')], {",
"""  logStartup('Iniciando motor',join(APP_ROOT,'server.mjs'),'empaquetado=',app.isPackaged,'Node=',process.versions.node);
  backend = spawn(process.execPath, [join(APP_ROOT, 'server.mjs')], {""")
change("  backend.on('error', err => console.error('[GREÑA] backend:', err.message));",
"""  backend.on('error', err => {
    lastBackendError=err.message;
    logStartup('ERROR AL ARRANCAR MOTOR:',err.stack || err.message);
    console.error('[GREÑA] backend:',err.message);
  });""")
change("  backend.stdout?.on('data', data => console.log('[GREÑA]', String(data).slice(0, 500)));",
"""  backend.stdout?.on('data', data => {
    logStartup('stdout',String(data).slice(0,4000));
    console.log('[GREÑA]',String(data).slice(0,500));
  });""")
change("  backend.stderr?.on('data', data => console.error('[GREÑA]', String(data).slice(0, 500)));",
"""  backend.stderr?.on('data', data => {
    lastBackendError=String(data).slice(0,400);
    logStartup('stderr',String(data).slice(0,4000));
    console.error('[GREÑA]',String(data).slice(0,500));
  });""")
change("  backend.on('exit', (code, signal) => console.warn('[GREÑA] backend stopped', code, signal));",
"""  backend.on('exit', (code, signal) => {
    logStartup('EL MOTOR TERMINÓ','code=',code,'signal=',signal);
    console.warn('[GREÑA] backend stopped',code,signal);
  });""")
change("    dialog.showErrorBox('El motor no inició', 'No se pudo iniciar el servidor local. Revisa las conexiones de Windows y los registros en AppData\\\\Roaming\\\\GREÑA LIVE PRO\\\\logs.');",
"""    const detail=lastBackendError ? '\\n\\nÚltimo error: '+lastBackendError : '';
    logStartup('EL MOTOR NO RESPONDIÓ A HEALTHCHECK',detail);
    dialog.showErrorBox('El motor no inició','GREÑA LIVE no pudo iniciar su motor local.'+detail+'\\n\\nDiagnóstico: '+DESKTOP_LOG);""")
main_file.write_text(s,encoding='utf-8')
print('OK: GREÑA LIVE Desktop v5.0.1 sin ASAR y con diagnóstico del motor.')
