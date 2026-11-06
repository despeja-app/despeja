#!/usr/bin/env bash
# Compila la app de iPhone de Despeja para el simulador (sin firmar), para revisar que todo calza. Para instalarla en tu
# iPhone: abre movil/ios/App.xcodeproj en Xcode, elige tu Team en «Signing & Capabilities» y tu iPhone, y dale ▶︎.
#   bash herramientas/compilar_iphone.sh
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DD="${TMPDIR:-/tmp}/despeja-iphone"
cd "$RAIZ/movil/ios"
xcodebuild -project App.xcodeproj -scheme Despeja -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DD" CODE_SIGNING_ALLOWED=NO build > "$DD.log" 2>&1 || { grep -E "error:|warning: .*Fotos" "$DD.log" | head -30; tail -5 "$DD.log"; exit 1; }
grep -E "warning:" "$DD.log" | grep -v "appintents" | sort -u | head -10 || true
echo "✓ la app de iPhone compila (log: $DD.log)"
