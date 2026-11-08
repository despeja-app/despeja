#!/usr/bin/env bash
# Arma los íconos de la app de escritorio desde escritorio/iconos/icono-1024.png (el de Mac, con su margen y sombra):
# icon.icns (Mac), icon.ico (Windows) y los PNG que pide Tauri. Solo para desarrollo: se versionan los resultados.
# Necesita Pillow (pip install pillow). El ícono del iPhone está en movil/ios.
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)/escritorio/iconos"
python3 - "$D" <<'PY'
import sys
from pathlib import Path
from PIL import Image
d = Path(sys.argv[1])
base = Image.open(d / "icono-1024.png").convert("RGBA")
for lado, nombre in [(32, "32x32.png"), (128, "128x128.png"), (256, "128x128@2x.png"), (512, "icono.png")]:
    base.resize((lado, lado), Image.LANCZOS).save(d / nombre)
base.save(d / "icon.icns", sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)])
base.resize((256, 256), Image.LANCZOS).save(d / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("✓ escritorio/iconos/")
PY
