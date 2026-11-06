#!/usr/bin/env bash
# Compila la app de iPhone de Despeja y la instala en tu iPhone (por cable o Wi-Fi), sin abrir Xcode.
#   EQUIPO=<tu Team de Xcode> bash herramientas/instalar_iphone.sh
# EQUIPO es el «Team» de Signing & Capabilities (tu Apple ID). Queda solo en tu Mac: nunca va al repo.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
: "${EQUIPO:?Falta EQUIPO=<tu Team de Xcode>}"
DD="${TMPDIR:-/tmp}/despeja-iphone-dispositivo"
ID="$(xcrun devicectl list devices 2>/dev/null | awk '/iPhone/ && /available/ {for (i=1;i<=NF;i++) if ($i ~ /^[0-9A-F-]{36}$/) {print $i; exit}}')"
[ -n "$ID" ] || { echo "No veo tu iPhone: conéctalo por cable y desbloquéalo."; exit 1; }
cd "$RAIZ/movil/ios"
xcodebuild -project App.xcodeproj -scheme Despeja -configuration Debug -destination "generic/platform=iOS" \
  -derivedDataPath "$DD" -allowProvisioningUpdates DEVELOPMENT_TEAM="$EQUIPO" build > "$DD.log" 2>&1 \
  || { grep -E "error:" "$DD.log" | sort -u | head -20; exit 1; }
APP="$(find "$DD/Build/Products/Debug-iphoneos" -maxdepth 1 -name 'Despeja.app' | head -1)"
xcrun devicectl device install app --device "$ID" "$APP"
echo "✓ Despeja quedó instalada en tu iPhone"
