#!/usr/bin/env bash
# Arma app/Despeja.icns desde app/icono-1024.png (en un Mac: sips + iconutil). El ícono del iPhone está en
# movil/ios/Fuentes/Assets.xcassets/AppIcon.appiconset/icono.png (1024×1024, sin esquinas: iOS las pone).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)/Despeja.iconset"; mkdir -p "$T"
for s in 16 32 128 256 512; do
  sips -z $s $s "$RAIZ/app/icono-1024.png" --out "$T/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$RAIZ/app/icono-1024.png" --out "$T/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$T" -o "$RAIZ/app/Despeja.icns"
echo "✓ app/Despeja.icns"
