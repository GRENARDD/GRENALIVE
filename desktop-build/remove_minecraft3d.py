#!/usr/bin/env python3
"""Remove the retired Minecraft 3D alert pack from packaged GREÑA Desktop.

Normal Minecraft Pixelcraft files are assets/afterglow-minecraft.* and MUST remain.
Domino is a separate assets/grena-packs/domino pack and MUST remain.
This runs after applying the original desktop integration kit and selecting themes.
"""
from pathlib import Path
import json
import re
import shutil
import sys

root = Path(sys.argv[1]).resolve()
removed_pack = root / 'assets' / 'grena-packs' / 'minecraft'
normal = [root / 'assets' / f'afterglow-minecraft.{ext}' for ext in ('js','css')]
domino = root / 'assets' / 'grena-packs' / 'domino'
for filepath in normal:
    if not filepath.is_file():
        raise RuntimeError('Se detuvo la limpieza: falta el Minecraft normal: ' + str(filepath))
if not domino.is_dir():
    raise RuntimeError('Se detuvo la limpieza: falta el paquete Dominó.')

# Remove stale 3D-only controls from any included studio and preview screens.
html_files = ('alerts.html','afterglow-studio.html','afterglow-overlay.html',
              'vista-previa-alertas.html','preview.html')
for name in html_files:
    f=root/name
    if not f.exists(): continue
    original=f.read_text(encoding='utf-8')
    s=re.sub(r'<option\b[^>]*\bvalue\s*=\s*["\']minecraft3d["\'][^>]*>[^<]*</option\s*>','',original,flags=re.I)
    s=re.sub(r'<button\b[^>]*\bdata-grena-theme\s*=\s*["\']minecraft3d["\'][^>]*>.*?</button\s*>','',s,flags=re.I|re.S)
    if s!=original:
        f.write_text(s,encoding='utf-8')

# The original pack is not used by normal Minecraft. Remove its installed files.
if removed_pack.exists():
    shutil.rmtree(removed_pack)

# Do not let electron-builder package an old pack through an explicit files entry.
pkg_file=root/'package.json'
pkg=json.loads(pkg_file.read_text(encoding='utf-8'))
build=pkg.get('build') or {}
if isinstance(build.get('files'),list):
    build['files']=[x for x in build['files'] if not (
        isinstance(x,str) and ('grena-packs/minecraft' in x or 'grena-minecraft-alerts-3d' in x))]
pkg_file.write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

dashboard=(root/'alerts.html').read_text(encoding='utf-8')
picker=(root/'assets/alerts-theme-picker.js').read_text(encoding='utf-8')
server=(root/'server.mjs').read_text(encoding='utf-8')
overlay=(root/'afterglow-overlay.html').read_text(encoding='utf-8')
for file,src in [('alerts.html',dashboard),('alerts-theme-picker.js',picker)]:
    if re.search(r'data-grena-theme=["\']minecraft3d["\']|minecraft3d\s*:\s*["\']',src):
        raise RuntimeError('Minecraft 3D sigue disponible en el selector: '+file)
if 'minecraft3d' not in server or "?'minecraft'" not in server:
    raise RuntimeError('No se ha activado la migración de preferencias Minecraft 3D -> Minecraft.')
if 'minecraft3d' not in overlay or "?'minecraft'" not in overlay:
    raise RuntimeError('No se ha activado la migración en OBS Minecraft 3D -> Minecraft.')
if removed_pack.exists() or not domino.is_dir() or any(not p.is_file() for p in normal):
    raise RuntimeError('La eliminación no ha conservado Minecraft normal y Dominó.')

print('OK: Eliminado Minecraft 3D: paquete, selector y opciones de estudio.')
print('OK: Minecraft normal, Dominó, Afterglow, Halloween y Navidad conservados.')
