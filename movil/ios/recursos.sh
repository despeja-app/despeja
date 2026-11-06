#!/bin/sh
# Pieza «host-ios» (generado desde app.json): copia la interfaz y app.json dentro de la app de iPhone, en pieza/
# (una carpeta despeja/ chocaría con el ejecutable: el iPhone no distingue mayúsculas). Lo corre Xcode en cada compilación (fase «Interfaz y app.json»).
set -eu
RAIZ="$PROJECT_DIR/../.."
DESTINO="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/pieza"
mkdir -p "$DESTINO"
cp "$RAIZ/app.json" "$DESTINO/app.json"
# Solo la interfaz: sin pruebas, mapas de fuentes ni archivos ocultos.
rsync -a --delete --exclude '.*' --exclude '*.map' --exclude 'pruebas/' "$RAIZ/ui/" "$DESTINO/ui/"
