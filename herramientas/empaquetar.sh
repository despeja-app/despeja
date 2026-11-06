#!/bin/bash
# Arma dist/Despeja.app (autosuficiente) y dist/Despeja-macOS.zip + .sha256, sin instalar nada. Solo en un Mac (Apple Silicon).
# Lo usan build.sh (en tu Mac), la pieza «actualizaciones» (instalación de desarrollo) y publicar.yml (cada versión).
# Dentro van: la app, Python portátil y el código (bin/, ui/, app.json, acciones.json y lo de app.json → empaquetado.carpetas) en
# Contents/Resources/despeja. Todo lo que se descarga tiene su huella SHA-256 fija: si no coincide, no se usa y el armado se detiene.
# Generado por la pieza «empaquetado» de Pieza (MPL-2.0, https://mozilla.org/MPL/2.0/) desde app.json: si lo cambias, desde ahí
# es de la app y Pieza ya no lo toca. Lo propio va en app.json → empaquetado o en herramientas/empaquetar-extra.sh.
set -euo pipefail
export PATH=/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
[ "$(uname -s)" = Darwin ] || { echo "✗ La app de Mac se arma en un Mac." >&2; exit 1; }
[ "$(uname -m)" = arm64 ] || { echo "✗ Por ahora Despeja para Mac es solo para Apple Silicon (arm64)." >&2; exit 1; }
# La versión sale de app.json (la única que se sube para publicar).
VERSION=$(plutil -extract version raw -o - "$RAIZ/app.json" 2>/dev/null || echo 0.2.0)
cd "$RAIZ/app"
PROGRESO=DESPEJA_PROGRESO   # la pieza «actualizaciones» muestra el avance de la compilación
swift build -c release 2>&1 | tee "${!PROGRESO:-/dev/null}" | tail -20
REL=.build/release
CACHE=.build/descargas
mkdir -p "$CACHE"

huella() { shasum -a 256 "$1" | cut -d' ' -f1; }
bajar() { # url huella destino
  if [ -f "$3" ] && [ "$(huella "$3")" = "$2" ]; then return; fi
  echo "→ $(basename "$3")"
  curl -fsSL --proto '=https' --retry 3 "$1" -o "$3.tmp"
  [ "$(huella "$3.tmp")" = "$2" ] || { rm -f "$3.tmp"; echo "✗ $(basename "$3") no coincide con su huella: no se usa." >&2; exit 1; }
  mv "$3.tmp" "$3"
}

# Python portátil (python-build-standalone): el mismo en todas las apps de la familia (herramientas/python.lock). La persona no instala nada.
read -r _ PY_URL PY_SHA < <(grep '^mac ' "$RAIZ/herramientas/python.lock")
PY_VER=$(sed -n 's/^version //p' "$RAIZ/herramientas/python.lock")
bajar "$PY_URL" "$PY_SHA" "$CACHE/python-$PY_VER.tar.gz"

DIST="$RAIZ/dist"; APP="$DIST/Despeja.app"; R="$APP/Contents/Resources/despeja"
rm -rf "$DIST"; mkdir -p "$APP/Contents/MacOS" "$R" "$APP/Contents/Frameworks"
cp "$REL/Despeja" "$APP/Contents/MacOS/"
chmod +x "$APP/Contents/MacOS/"*
cp Info.plist "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $VERSION" "$APP/Contents/Info.plist"
[ -f Despeja.icns ] && cp Despeja.icns "$APP/Contents/Resources/Despeja.icns"
tar -xzf "$CACHE/python-$PY_VER.tar.gz" -C "$APP/Contents/Resources"   # → Resources/python/bin/python3
# Más liviano: la app solo usa la biblioteca estándar (sin pruebas, tkinter, idle ni pip).
for d in lib/python3.13/test lib/python3.13/idlelib lib/python3.13/tkinter lib/python3.13/turtledemo lib/python3.13/ensurepip lib/tcl9.0 lib/tk9.0 include share; do
  rm -rf "$APP/Contents/Resources/python/$d"
done
for d in bin ui; do ditto "$RAIZ/$d" "$R/$d"; done
# app.json (la descripción de la app que leen las piezas: bin/nucleo.py la busca junto a bin/) y acciones.json (las acciones
# declaradas que atiende el host; lo arma pieza.py): sin ellos la app no arranca.
cp "$RAIZ/app.json" "$RAIZ/acciones.json" "$R/"
# La app usa los datos de la persona, nunca la demo de la vista previa.
rm -rf "$R/ui/demo.json"
find "$R" -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
chmod +x "$R/bin/"*.py
cat > "$APP/Contents/Resources/LICENCIAS-TERCEROS.txt" <<'TXT'
Despeja se distribuye con la licencia AGPL-3.0 (https://github.com/despeja-app/despeja). Dentro de la app va, como programa aparte:

- Python 3.13 de python-build-standalone (https://github.com/astral-sh/python-build-standalone), licencia PSF y las de sus partes.
TXT
# Lo que la app arma a su manera (opcional): recibe la app y la carpeta de swift build.
if [ -f "$RAIZ/herramientas/empaquetar-extra.sh" ]; then bash "$RAIZ/herramientas/empaquetar-extra.sh" "$APP" "$PWD/$REL"; fi

# Firma ad hoc, de adentro hacia afuera, con requisito por identificador: macOS reconoce la app entre versiones (los permisos que
# dio la persona no se vuelven a pedir después de cada actualización).
for f in "$APP/Contents/Frameworks/"*; do [ -e "$f" ] && codesign --force --sign - "$f"; done
find "$APP/Contents/Resources/python" -type f \( -name "*.so" -o -name "*.dylib" -o -perm -u+x \) -exec codesign --force --sign - {} \; 2>/dev/null || true
for p in "$APP/Contents/MacOS/"*; do [ "$(basename "$p")" = Despeja ] || codesign --force --sign - "$p"; done
codesign --force --sign - --requirements '=designated => identifier "app.despeja.mac"' "$APP"

cd "$DIST"
ditto -c -k --keepParent Despeja.app Despeja-macOS.zip
shasum -a 256 Despeja-macOS.zip > Despeja-macOS.zip.sha256
echo "Listo: $DIST/Despeja-macOS.zip ($(du -h Despeja-macOS.zip | cut -f1))"
