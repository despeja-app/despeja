#!/usr/bin/env bash
# Todas las pruebas de Despeja. Córrelas antes de cada commit; GitHub las corre en cada cambio (.github/workflows/revisar.yml).
# Sin dependencias: Python con la biblioteca estándar y Node. La app nativa (Rust) se prueba si hay cargo, y se abre si hay Xvfb. La interfaz en un navegador de verdad necesita Playwright
# (PLAYWRIGHT=/ruta/a/node_modules/playwright); sin él se avisa y se sigue.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Sintaxis"
python3 -m py_compile bin/*.py
for f in ui/app.js; do node --check "$f"; done
echo "Contrato del puente (pieza «contrato»)"
python3 pruebas/contrato.py
echo "Python"
python3 -W ignore -m unittest discover -q -s pruebas -p 'test_*.py'
if PLAYWRIGHT="${PLAYWRIGHT:-playwright}" node -e 'require(process.env.PLAYWRIGHT)' 2>/dev/null; then
  echo "Interfaz (Chromium)"
  node pruebas/interfaz.mjs
  echo "Página pública (pieza «pagina»)"
  node herramientas/pagina_capturas.mjs revisar ${CAPTURAS:+"$CAPTURAS/pagina"}
else
  echo "Interfaz: sin Playwright, no la pruebo aquí (PLAYWRIGHT=/ruta/a/playwright)"
fi
if command -v cargo >/dev/null && [ "${SIN_RUST:-0}" != "1" ]; then
  echo "App nativa (Rust, pieza «host-tauri»)"; (cd escritorio && cargo test --quiet 2>&1 | grep -E "test result|error" | tail -3)
  if command -v xvfb-run >/dev/null && command -v dbus-run-session >/dev/null; then bash escritorio/pruebas/arranque.sh; fi
else
  echo "App nativa: sin cargo (o SIN_RUST=1), se prueba en GitHub (job «app»)"
fi
echo "Privacidad"
bash herramientas/revisar_privacidad.sh --generico
if [ -s .terminos-privados ]; then bash herramientas/revisar_privacidad.sh --todo; fi
echo "Todo bien"
