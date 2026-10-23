#!/usr/bin/env python3
"""Keep the kit's verified patch prerequisites unchanged during the Windows build.

The repository's web sources continue to carry the new Halloween features.
In CI, the upstream Desktop kit must first patch the exact original sources.
After that, apply_theme_after_kit.py merges the new features into the patched output.
"""
from pathlib import Path
import subprocess
import sys

root=Path(sys.argv[1]).resolve()
base='74665215397bee249eab62ecf3e3a410044e3f03'
files=('server.mjs','alerts.html','afterglow-overlay.html',
       'assets/alerts-simple.css','assets/alerts-theme-picker.js')
backup=root/'.grena-halloween-new'
for relative in files:
    destination=root/relative
    target=backup/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(destination.read_bytes())
    try:
        original=subprocess.check_output(['git','show',base+':'+relative],cwd=root)
    except subprocess.CalledProcessError as err:
        raise RuntimeError(f'No se encontró la fuente original {relative}: {err}') from err
    destination.write_bytes(original)
print('Kit prerequisites restored temporarily; Halloween changes backed up for merging.')
