#!/usr/bin/env python3
"""Version the verified Starvios diagnostics and viewer bridge fixes as v5.0.6."""
from pathlib import Path
import json
import sys

root = Path(sys.argv[1]).resolve()
package = root / "package.json"
data = json.loads(package.read_text(encoding="utf-8"))
if data.get("version") != "5.0.5":
    raise RuntimeError("Se esperaba GREÑA LIVE 5.0.5 antes de Starvios 5.0.6")
data["version"] = "5.0.6"
package.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("GREÑA LIVE Desktop 5.0.6: diagnóstico Starvios y contador desacoplado del chat visual.")
