#!/usr/bin/env python3
"""Produce GREÑA Live's original G icon for Electron/NSIS.

Run only after desktop-build/fix_startup.py has created the Electron package.
The source PNG is a small transparent, generated artwork checked into this repo
as base64 so the GitHub text-only file workflow can reproduce it exactly.
"""
from pathlib import Path
from io import BytesIO
import base64
import json
import sys

from PIL import Image

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
source = root / "assets" / "grena-g-icon.png.base64"
package_path = root / "package.json"
if not source.is_file() or not package_path.is_file():
    raise SystemExit("Faltan el icono o el package.json para GREÑA Live")

raw = base64.b64decode(source.read_text(encoding="ascii").strip(), validate=True)
image = Image.open(BytesIO(raw)).convert("RGBA")
if image.size != (256, 256):
    raise RuntimeError(f"El icono original debe tener 256x256 px: {image.size}")
if image.getchannel("A").getextrema() == (255, 255):
    raise RuntimeError("El icono perdió la transparencia")

output_dir = root / "build"
output_dir.mkdir(parents=True, exist_ok=True)
png = output_dir / "grena-g.png"
ico = output_dir / "grena-g.ico"
image.save(png, format="PNG")
image.save(ico, format="ICO", sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])

package = json.loads(package_path.read_text(encoding="utf-8-sig"))
build = package.setdefault("build", {})
build["icon"] = "build/grena-g.ico"
win = build.setdefault("win", {})
win["icon"] = "build/grena-g.ico"
nsis = build.setdefault("nsis", {})
nsis["installerIcon"] = "build/grena-g.ico"
nsis["uninstallerIcon"] = "build/grena-g.ico"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("OK: GREÑA G en ejecutable, accesos directos e instalador Windows")
