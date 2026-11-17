#!/usr/bin/env python3
"""Fail CI if the Windows PNG/ICO differs from the transparent gold master."""
from pathlib import Path
from PIL import Image
import sys

if len(sys.argv) != 3:
    raise SystemExit("Usage: verify-grena-g-alpha.py build/grena-g.png build/grena-g.ico")

png, ico = [Path(v) for v in sys.argv[1:]]
with Image.open(png) as source:
    gold = source.convert("RGBA")
with Image.open(ico) as source:
    icon = source.convert("RGBA")
if gold.size != (256, 256) or icon.size != (256, 256):
    raise RuntimeError("PNG and ICO must both contain a full 256x256 G.")
if gold.getchannel("A").getextrema() != (0, 255):
    raise RuntimeError("The G must have transparent and opaque pixels.")
if gold.getpixel((0, 0))[3] != 0 or icon.getpixel((0, 0))[3] != 0:
    raise RuntimeError("Detected a solid background in the G icon.")
if list(gold.getdata()) != list(icon.getdata()):
    raise RuntimeError("The Windows ICO differs pixel-for-pixel from the gold PNG master.")
if not any(r > 150 and g > 80 and b < 200 and a > 200
           for r, g, b, a in gold.getdata()):
    raise RuntimeError("The master icon does not contain the golden G artwork.")
print("OK: Windows 256px ICO equals the gold SVG raster, alpha preserved, no solid background")
