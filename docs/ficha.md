# Despeja — ficha

Deja tu iPhone solo con lo necesario: revisa fotos, videos, apps y WhatsApp, arma un catastro de lo que usas y lo que no,
respalda lo que vale la pena en tu disco o tu nube y borra lo que sobra. Tu propia IA (Claude, ChatGPT o Gemini, con tu cuenta)
analiza el catastro y propone el plan. Open source (AGPL-3.0), todo local, sin cuentas. Hecha con Pieza.

## Dos partes
| Parte | Rol | Hace |
|---|---|---|
| Mac (`app/`, `bin/`) | El cerebro | Ve el iPhone (usbmuxd + lockdownd, USB y Wi-Fi), su espacio y sus apps; catastro y plan con tu IA; respaldo; WhatsApp desde el respaldo local; actualización de iOS |
| iPhone (`movil/ios/`, pieza `host-ios`) | Las manos | Fotos y videos con PhotoKit (también lo de iCloud), envío de originales al Mac, borrado por tandas de lo ya verificado, contactos duplicados, pasos guiados |

La interfaz es una sola (`ui/`): en el iPhone se ve la parte de fotos (`host.plataforma === "movil"`).

## Decisiones
- **Sin pymobiledevice3** (Pieza: solo biblioteca estándar). `bin/iphone.py` habla con usbmuxd y lockdownd como el Finder; sin
  permisos de administrador. `devicectl` solo lista apps instaladas desde Xcode: no sirve para el catastro.
- En iOS 26 el espacio se pide clave por clave y el tamaño de los datos de cada app llega en 0: el peso de WhatsApp y otros sale
  del respaldo local.
- La nube va como carpeta sincronizada (iCloud Drive, Drive, Dropbox), cifrada con la frase de la persona (pieza `cifrado`).
- El permiso de Fotos se pide recién al tocar «Revisar mis fotos».

## Límites honestos (iOS no deja)
- La caché de otras apps y los chats de WhatsApp no se borran desde afuera: Despeja dice qué y dónde.
- «Eliminados recientemente» lo vacía la persona; el uso de cada app es una estimación; la actualización de iOS se instala desde Ajustes.
- Sin cuenta pagada de Apple, la app de iPhone se reinstala desde Xcode cada 7 días.

## Fases
1. ✓ Prueba de concepto (`poc/HALLAZGOS.md`, fuera del repo).
2. ✓ Pieza `host-ios` 0.1.0 y `contrato` 0.1.2.
3. ✓ Despeja creada: el Mac ve el iPhone, su espacio y sus apps; el iPhone cuenta fotos y videos.
4. Enlace Mac ↔ iPhone (Bonjour y cable), catastro de fotos, duplicados, respaldo verificado y borrado por tandas.
5. IA y plan; actualización de iOS; WhatsApp desde el respaldo local.
6. Repo, página, comunidad y anuncio.
