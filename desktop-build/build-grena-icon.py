#!/usr/bin/env python3
"""Build the Windows EXE / NSIS logo from the exact SVG shown in GREÑA LIVE 6.0.

One source of truth: favicon.svg (transparent GOLD G).
Requires Pillow and @resvg/resvg-js in the GitHub build environment.
Do not use the legacy assets/grena-g-icon.png.base64 (old BLUE G).
"""
from pathlib import Path
from io import BytesIO
import json
import subprocess
import sys

from PIL import Image

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
svg_path = root / "favicon.svg"
package_path = root / "package.json"
if not svg_path.is_file() or not package_path.is_file():
    raise SystemExit("Faltan favicon.svg o package.json para GREÑA Live")

svg = svg_path.read_text(encoding="utf-8")
if '<linearGradient id="body"' not in svg or 'G Dorada' not in svg:
    raise RuntimeError("La fuente del icono no es la G dorada aprobada.")
if '<rect' in svg:
    raise RuntimeError("El SVG no debe contener rectángulos de fondo.")

output_dir = root / "build"
output_dir.mkdir(parents=True, exist_ok=True)
png = output_dir / "grena-g.png"
ico = output_dir / "grena-g.ico"

# Resvg rasterizes the same SVG used by all in-app logos and browser tabs.
# No alternative PNG artwork is allowed in the Windows executable.
renderer = root / "desktop-build" / "render-grena-g.cjs"
if not renderer.is_file():
    raise RuntimeError("Falta el renderizador del logo dorado.")
subprocess.run(["node", str(renderer), str(svg_path), str(png)], check=True, cwd=root)

with Image.open(png) as opened:
    image = opened.convert("RGBA")
if image.size != (256, 256):
    raise RuntimeError(f"El logo debe renderizarse a 256x256 px: {image.size}")
alpha = image.getchannel("A")
low, high = alpha.getextrema()
if low != 0 or high != 255 or image.getpixel((0, 0))[3] != 0:
    raise RuntimeError("El logo perdió la transparencia o tiene un fondo opaco.")
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
print("OK: G DORADA transparente compartida por favicon, EXE, accesos directos e instalador.")
