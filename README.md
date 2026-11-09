# Despeja

**Deja tu iPhone solo con lo necesario.** Despeja hace tres cosas:

1. Muestra qué ocupa espacio en tu iPhone.
2. Respalda tus fotos y videos en tu Mac. El Mac verifica cada archivo.
3. Borra del iPhone solo lo que ya está a salvo.

Tu propia IA revisa el resumen y te propone un plan.

Despeja es gratis y abierto (AGPL-3.0). Todo queda entre tu Mac y tu iPhone. No hay cuentas ni servidores. Tu IA nunca ve tus
fotos.

| En el Mac | En el iPhone |
|---|---|
| Ve tu iPhone por cable o Wi-Fi: el espacio, las apps (de la más pesada a la más liviana) y si hay un iOS más nuevo | Cuenta tus fotos, videos y capturas, y cuánto ocupan |
| Recibe los respaldos en la carpeta que elijas, ordenados por año y mes. Verifica cada archivo | Manda cada foto y video al Mac, con su Live Photo y sus ediciones. Va cifrado por tu Wi-Fi |
| WhatsApp: muestra qué chats ocupan más (desde el respaldo del Finder). Guarda sus fotos y videos antes de que los borres | |
| Tu IA (Claude, ChatGPT o Gemini, con tu cuenta) arma un plan. Marca las apps que podrían sobrar. Las desinstalas con casillas | Borra solo lo que tu Mac verificó |
| | Analiza solo: fotos repetidas y parecidas, capturas, ráfagas, videos repetidos, fotos borrosas, memes y videos grandes. Los revisas en cuadrícula o uno por uno |
| | Ahorra espacio sin borrar: comprime videos y convierte Live Photos en fotos. Junta contactos repetidos y borra eventos viejos |

iOS no deja hacer algunas cosas desde afuera: borrar la caché de otras apps, borrar chats de WhatsApp o vaciar «Eliminados
recientemente». Para esas, Despeja te dice dónde hacerlo en el iPhone.

**[Descargar](https://github.com/despeja-app/despeja/releases/latest) · [Página](https://despeja-app.github.io/despeja/) ·
[Probar en el navegador](https://despeja-app.github.io/despeja/demo/) · [Wiki](https://github.com/despeja-app/despeja/wiki) ·
[Cómo aportar](CONTRIBUTING.md)**

## Instalar

### Mac (Apple Silicon, macOS 15)

1. Abre la Terminal.
2. Ejecuta: `curl -fsSL https://raw.githubusercontent.com/despeja-app/despeja/main/instalar.sh | bash`

El instalador baja la última versión de los Releases de este repo. Antes de instalar, revisa su huella SHA-256.

### iPhone (iOS 17 o más nuevo)

Por ahora, Despeja no está en la App Store. Se instala desde tu Mac con Xcode:

1. Abre `movil/ios/App.xcodeproj` en Xcode.
2. En «Signing & Capabilities», elige tu Apple ID.
3. Elige tu iPhone y toca ▶︎.
4. La primera vez, en el iPhone: Ajustes → General → VPN y gestión de dispositivos → «Confiar».

Con una cuenta gratis de Apple, la app dura 7 días. Después, instálala otra vez con los mismos pasos.

## Cómo está hecha

- `ui/`: una sola interfaz web para todas las plataformas.
- `escritorio/`: la app de Mac, en Rust con Tauri (pieza `host-tauri`).
- `movil/`: la app de iPhone.
- `bin/`: los scripts, en Python con su biblioteca estándar.

Lo común viene de [Pieza](https://github.com/pieza-app/pieza). La guía para personas y para cualquier IA es `AGENTS.md`. Las
piezas que usa la app están en `piezas.json`.

```bash
bash pruebas/correr.sh                       # todas las pruebas (contrato, Python, interfaz con Playwright, privacidad)
cd ui && python3 -m http.server 8765         # la vista previa: http://localhost:8765/?bienvenida · ?idioma=en · ?tema=oscuro
cd escritorio && cargo run                   # la app de escritorio
```

## Despeja in English

**Keep only what you need on your iPhone.** Despeja shows what takes up space. It backs up your photos and videos to your Mac and
verifies each file. Then it deletes from the iPhone only what is already safe. Your own AI reviews the summary and suggests a plan.
Everything stays between your Mac and your iPhone: no accounts, no servers. Your AI never sees your photos.

Free and open source (AGPL-3.0). [Download](https://github.com/despeja-app/despeja/releases/latest) ·
[Website](https://despeja-app.github.io/despeja/).

[![Hecho con Pieza](https://pieza-app.github.io/pieza/sello.svg)](https://pieza-app.github.io/pieza/)
