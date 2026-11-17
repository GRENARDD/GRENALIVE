#!/usr/bin/env python3
"""GREÑA Live desktop: native Windows titlebar overlay with original minimize/maximize/close."""
from pathlib import Path
import re
import sys

root=Path(sys.argv[1]).resolve()
main=root/'desktop'/'main.cjs'
source=main.read_text(encoding='utf-8')
marker='GRENA_PREMIUM_NATIVE_TITLEBAR_V605'
if marker in source:
    print('Premium GREÑA titlebar already enabled')
    raise SystemExit(0)

# Apply to the MAIN app window only. Never modify overlays, cameras or floating tabs.
pattern=r'(?P<prefix>\bmainWindow\s*=\s*new\s+BrowserWindow\s*\(\s*\{)'
matches=list(re.finditer(pattern,source))
if len(matches)!=1:
    raise RuntimeError(f'Expected one main BrowserWindow initializer; found {len(matches)}; refusing unsafe change.')
insert="""\n    // GRENA_PREMIUM_NATIVE_TITLEBAR_V605
    // Keep native Windows window buttons and Snap; remove only the old caption bar.
    ...(process.platform==='win32'?{
      titleBarStyle:'hidden',
      titleBarOverlay:{color:'#17120c',symbolColor:'#e4bb70',height:40}
    }:{}),
"""
match=matches[0]
source=source[:match.end()]+insert+source[match.end():]
main.write_text(source,encoding='utf-8')
print('GREÑA Premium Windows title bar enabled; native controls retained.')
