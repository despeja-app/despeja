# Despeja

**Deja tu iPhone solo con lo necesario.** Despeja ve qué ocupa espacio, respalda tus fotos y videos en tu Mac (verificados uno
por uno) y borra del iPhone solo lo que ya está a salvo. Tu propia IA revisa el resumen y te propone un plan.

Gratis y abierto (AGPL-3.0). Todo queda entre tu Mac y tu iPhone: sin cuentas ni servidores, y tu IA nunca ve tus fotos.

| En el Mac | En el iPhone |
|---|---|
| Ve tu iPhone por cable o Wi-Fi: espacio, apps de la más pesada a la más liviana y si hay un iOS más nuevo | Cuenta tus fotos, videos y capturas y cuánto ocupan |
| Recibe los respaldos en la carpeta que elijas, ordenados por año y mes, y verifica cada archivo | Manda cada foto y video al Mac, con su Live Photo y sus ediciones, cifrado por tu Wi-Fi |
| Tu IA (Claude, ChatGPT o Gemini, con tu cuenta) arma un plan y marca las apps que podrían sobrar; las desinstalas con casillas | Borra solo lo que tu Mac verificó |
| | Analiza solo: fotos repetidas y parecidas, capturas, ráfagas, videos repetidos, borrosas, memes y videos grandes; las revisas en cuadrícula o una por una deslizando |
| | Ahorra sin borrar: comprime videos y convierte Live Photos en fotos; junta contactos repetidos y borra eventos viejos |

Lo que iOS no deja hacer desde afuera (la caché de otras apps, los chats de WhatsApp, vaciar «Eliminados recientemente») Despeja te
dice exactamente dónde hacerlo.

**[Descargar](https://github.com/despeja-app/despeja/releases/latest) · [Página](https://despeja-app.github.io/despeja/) · [Probar en el navegador](https://despeja-app.github.io/despeja/demo/) ·
[Cómo aportar](CONTRIBUTING.md)**

- **Mac** (Apple Silicon, macOS 15): `curl -fsSL https://raw.githubusercontent.com/despeja-app/despeja/main/instalar.sh | bash`

Cada instalador baja la última versión de los Releases de este repo y revisa su huella SHA-256 antes de instalar.

- **iPhone** (iOS 17 o más nuevo): por ahora se instala desde tu Mac con Xcode, sin App Store. Abre `movil/ios/App.xcodeproj`,
  elige tu Apple ID en «Signing & Capabilities», tu iPhone y ▶︎. Con una cuenta gratis, la app dura 7 días y se vuelve a instalar
  igual. La primera vez: Ajustes → General → VPN y gestión de dispositivos → «Confiar».

## Cómo está hecha

Una sola interfaz web (`ui/`) para todas las plataformas, la app de Mac en `app/` y los scripts en `bin/` (Python, solo biblioteca estándar). Lo común viene de
[Pieza](https://github.com/pieza-app/pieza): ver `AGENTS.md` (la guía para personas y para cualquier IA) y `piezas.json`.

```bash
bash pruebas/correr.sh                       # todas las pruebas (contrato, Python, interfaz con Playwright, privacidad)
cd ui && python3 -m http.server 8765         # la vista previa: http://localhost:8765/?bienvenida · ?idioma=en · ?tema=oscuro
```

## Despeja in English

**Keep only what you need on your iPhone.** Despeja shows what takes up space, backs up your photos and videos to your Mac
(each file verified) and deletes from the iPhone only what's already safe. Your own AI reviews the summary and suggests a plan.
Everything stays between your Mac and your iPhone: no accounts, no servers, and your AI never sees your photos.

Free and open source (AGPL-3.0). [Download](https://github.com/despeja-app/despeja/releases/latest) · [Website](https://despeja-app.github.io/despeja/).

[![Hecho con Pieza](https://pieza-app.github.io/pieza/sello.svg)](https://pieza-app.github.io/pieza/)
