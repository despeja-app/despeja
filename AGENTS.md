# Despeja — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

Despeja deja el iPhone solo con lo necesario. Son **dos apps que trabajan juntas**: la de **Mac** (el cerebro) ve el iPhone por
cable o Wi-Fi, su espacio, sus apps y la versión de iOS disponible, recibe y verifica los respaldos y le pide a **la IA de la
persona** (Claude Code, Codex o Gemini, con su cuenta) un plan; la de **iPhone** (las manos) lee la biblioteca de fotos con
PhotoKit, manda cada foto y video al Mac y borra del iPhone **solo lo que el Mac verificó**. Lo que iOS no deja hacer desde afuera
(la caché de otras apps, los chats de WhatsApp, vaciar «Eliminados recientemente») Despeja lo explica paso a paso, sin prometerlo.

**Principios que no se negocian**

1. **Nada se borra sin estar verificado.** Una foto queda «respaldada» solo cuando el Mac confirmó el SHA-256 de **todos** sus
   recursos (una Live Photo es foto + video; una editada trae el original y el ajuste) leyéndolos otra vez desde el disco. Borrar
   lo pide la persona y iOS pregunta. Perder una foto es lo único que esta app no se puede permitir.
2. **Todo queda entre el Mac y el iPhone de la persona.** Sin cuentas ni servidores nuestros. Por el Wi-Fi viaja cifrado (TLS
   con un certificado nuevo en cada sesión) y solo con el código de 8 letras que muestra el Mac, que nunca viaja: firma la huella
   del Mac y cada archivo. Las fotos van a una carpeta que elige la persona.
3. **La IA es la de la persona y ve lo mínimo:** espacio, tamaños y nombres de apps, versión de iOS y cuánto hay respaldado. Nunca
   fotos, nombres de archivos ni contenido. Su respuesta se valida (tipos de paso conocidos, textos cortos, una app solo si está en
   la lista revisada) y **nada se hace solo**: cada paso tiene su botón o su guía y lo decide la persona.
4. **Honesta con lo que iOS no deja.** Si algo no se puede hacer desde afuera, se dice y se explica dónde hacerlo en el iPhone.
   Nunca se promete limpiar la caché de otras apps ni borrar chats de WhatsApp.
5. **Sin dependencias.** El Mac habla con el iPhone como el Finder (usbmuxd + lockdownd) con la biblioteca estándar de Python, sin
   pymobiledevice3 ni permisos de administrador; el iPhone usa solo frameworks de Apple.
6. **Gratis y abierto (AGPL-3.0)**, sin publicidad; nada personal en el código ni en las pruebas (Ana Pérez, Matías Soto).

## Mapa del repo

| Ruta | Qué es |
|---|---|
| `bin/` | Python **solo biblioteca estándar**: lo que corren las apps. El último argumento siempre es el JSON de salida; lo que escribe la persona llega en un JSON de entrada, nunca como argumento. |
| `ui/` | La interfaz única (`index.html` con CSP, `app.js`, `app.css`), las piezas de interfaz (ver «Piezas») e `idiomas/en.json`. |
| `app/` | App de Mac (SwiftPM, macOS 15): lo propio en `Sources/Despeja/`, las piezas en `Sources/Pieza*/`. `Info.plist` y `Package.swift` los genera la pieza «empaquetado». |
| `movil/` | App del celular. |
| `docs/` | La página pública (GitHub Pages). |
| `pruebas/` | `correr.sh` (todo lo que revisa GitHub en cada cambio) y las pruebas. |
| `herramientas/` | `revisar_privacidad.sh` (antes de cada commit), `empaquetar.sh` (arma la app de Mac). |
| `app.json`, `piezas.json`, `acciones.json` | **Pieza** (ver «Piezas»): `app.json` describe la app (id, nombre, versión, datos, plataformas, config y sus acciones); `piezas.json` y `acciones.json` los escribe `pieza.py`. |
| `CHANGELOG.md` | Lo que cambia para quien usa la app, en palabras simples (ver «Lo que rodea a un cambio»). |
| `bin/iphone.py` | El Mac habla con el iPhone (usbmuxd → lockdownd con TLS y el registro de emparejamiento): `estado` (modelo, iOS, capacidad, libre), `apps` (con su tamaño; queda en `catastro.json`) y `desinstalar` (solo una app de la última lista revisada). |
| `bin/respaldo.py` | El Mac recibe: servidor HTTPS en la red local anunciado por Bonjour (`_despeja._tcp`), código de 8 letras, verificación SHA-256 y `respaldo/indice.json`. |
| `bin/plan.py` | El catastro y el plan con la IA de la persona (`armar`) y la versión de iOS más nueva para el modelo (`ios`, api.ipsw.me). |
| `movil/ios/Fuentes/` | La app de iPhone: `App.swift` (lo que atiende), `Fotos.swift` (resumen con PhotoKit), `Respaldo.swift` (buscar el Mac, conectar, mandar, borrar). El proyecto de Xcode y su `Info.plist` los genera «host-ios». |
| `herramientas/compilar_iphone.sh`, `instalar_iphone.sh` | Compilar la app de iPhone para el simulador; instalarla con `devicectl` (si Xcode no tiene la sesión, se instala con ▶︎ desde Xcode). |
| `docs/ficha.md` | La ficha del proyecto: qué es, decisiones y límites. |

## Cómo funciona

| Quién | Hace | Cómo |
|---|---|---|
| Mac | Ve el iPhone, su espacio y sus apps | `iphoneEstado`, `iphoneApps` → `bin/iphone.py` (USB o Wi-Fi, sin cable después de «Confiar» la primera vez) |
| Mac | ¿Hay iOS más nuevo? | `iosRevisar` → `bin/plan.py ios` (una vez por conexión) |
| Mac | Plan con la IA | `planArmar` → `bin/plan.py armar` (idioma inyectado; la respuesta se valida) |
| Mac | Desinstalar una app | `iphoneDesinstalar` → `bin/iphone.py desinstalar` (con confirmación en la interfaz) |
| Mac | Recibir un respaldo | `elegirDestino` (nativo, `CarpetaElegida`) y `respaldoRecibir` → `bin/respaldo.py recibir` (trabajo que late; avisa `esperando`/`conectado`/`archivo`/`fin` por `respaldoProgreso`); `respaldoDetener` |
| iPhone | Resumen de fotos | `fotosResumen` (PhotoKit; el permiso se pide recién al tocar) |
| iPhone | Mandar al Mac | `macBuscar` → `macConectar {mac, codigo}` → `respaldar` (avisa `respaldoAvance`) → `respaldoListo`; `respaldoParar` |
| iPhone | Borrar lo verificado | `borrarRespaldadas` → `borradas` (iOS pregunta; va a «Eliminados recientemente») |

**El respaldo, paso a paso** (las mismas reglas en `bin/respaldo.py` y `Respaldo.swift`; si cambias una, cambia las dos y su prueba):
- Llave: `PBKDF2-SHA256(código sin guion, sal "despeja-respaldo-1", 200.000 vueltas)`. Firma: `HMAC-SHA256(llave, partes unidas por "|")`.
- `GET /hola` → `{nombre, huella, firma: firma("hola", huella)}`. El iPhone compara la huella con la del certificado que vio y
  desde ahí acepta solo ese certificado.
- `POST /tiene` (cuerpo `{"ids": [...]}`, firma `("tiene", sha256 del cuerpo)`) → los recursos que el Mac ya tiene: se retoma donde quedó.
- `POST /archivo` con `X-Despeja-Id` (`<localIdentifier>#<n>`), `-Sha256`, `-Nombre` (con `%XX`), `-Fecha` (ISO) y `-Firma`
  `("archivo", id, sha, largo, nombre tal como llegó, fecha)`. Se guarda en `<carpeta>/AAAA/MM/<nombre>` (sin pisar nada) y se
  confirma con el SHA-256 leído del disco. `POST /fin` cierra la sesión.
- El iPhone anota en `respaldados.json` (su carpeta de datos) solo las fotos con todos sus recursos confirmados.

**Datos:** en el Mac, `~/Library/Application Support/Despeja/` (`catastro.json`, `respaldo/indice.json`, `config.json`); en el
iPhone, Application Support de la app (`respaldados.json`). Las fotos, en la carpeta que eligió la persona.

## Piezas (de [Pieza](https://github.com/pieza-app/pieza))
Despeja usa piezas de Pieza, la base de la familia de apps: código probado que se copia a la app (modelo «copiar y adueñarse»).

| Pieza | Versión | Archivos | Qué usa Despeja |
|---|---|---|---|
| `actualizaciones` | 0.3.0 | `app/Sources/PiezaActualizaciones/Actualizaciones.swift` | Avisos de versión nueva de la app de Mac y actualizar en un clic. |
| `bienvenida` | 0.4.1 | `ui/bienvenida.css`, `ui/bienvenida.js` | El primer uso: idioma, qué hace, tu IA (Mac) y cómo conectar el iPhone. |
| `cifrado` | 0.2.0 | `ui/cifrado.js` | Todavía no se usa: quedará para el respaldo cifrado en una carpeta de la nube. |
| `componentes` | 0.3.0 | `ui/componentes.css`, `ui/componentes.js` | Diálogos de confirmación (desinstalar, borrar), avisos, filas de Tu IA, Acerca de. |
| `contrato` | 0.1.2 | `pruebas/contrato.py` | Revisa que Mac, iPhone y la vista previa atiendan lo que pide la interfaz (excepciones de un solo lado en `pruebas/contrato_app.py`). |
| `empaquetado` | 0.1.0 | `herramientas/python.lock` | Arma y publica la app de Mac con su Python portátil. |
| `esqueleto` | 0.1.0 |  | El punto de partida (ya reemplazado por lo propio). |
| `github` | 0.1.0 |  | Plantillas de issues y PR, workflows, agentes y revisión de privacidad. |
| `host-ios` | 0.1.1 | `movil/ios/Fuentes/PiezaHost/Host.swift`, `movil/ios/Fuentes/PiezaHost/Puente.swift` | La app de iPhone: la misma interfaz (`plataforma «movil»`), el proyecto de Xcode y los permisos de `app.json → ios`. |
| `host-mac` | 0.3.0 | `app/Sources/PiezaHost/Carpeta.swift`, `app/Sources/PiezaHost/Enchufe.swift`, `app/Sources/PiezaHost/Host.swift`, `app/Sources/PiezaHost/Procesador.swift`, `app/Sources/PiezaHost/Puente.swift`, `app/Sources/PiezaHost/Sistema.swift` | La app de Mac: acciones declaradas, `CarpetaElegida` para el destino del respaldo, el estado y el lector de progreso. |
| `host-ui` | 0.2.0 | `ui/host.js` | `host.enviar` y las respuestas en `window.Despeja`, iguales en Mac, iPhone y la vista previa. |
| `i18n` | 0.3.1 | `ui/i18n.js` | Español e inglés en toda la interfaz. |
| `ia` | 0.6.3 | `bin/ia.py` | El plan (`bin/plan.py`) con la IA de la persona, sin herramientas ni memoria. |
| `nucleo` | 0.7.1 | `bin/nucleo.py` | `app.json`, la carpeta de datos y el contrato de los scripts. |
| `pagina` | 0.1.1 | `docs/pagina-comunes.json`, `docs/pagina.css`, `docs/pagina.js`, `docs/sello-en.svg`, `docs/sello.svg`, `docs/tema.css`, `herramientas/pagina_capturas.mjs` | La página pública bilingüe con su SEO y la demo. |
| `red` | 0.2.0 | `bin/red.py` | La versión de iOS disponible (solo `api.ipsw.me`). |
| `tema` | 0.2.1 | `ui/tema.css`, `ui/tema.js` | Claro, oscuro o como el sistema. |
| `trabajos` | 0.2.1 | `app/Sources/PiezaTrabajos/LectorProgreso.swift`, `bin/trabajos.py` | El latido y el avance del respaldo (`LectorProgreso`); `bin/trabajos.py` aún no se usa. |

- **No edites a mano los archivos de una pieza.** Se actualizan con «Pieza al día» (`.github/workflows/pieza-al-dia.yml`, una vez por
  semana abre un PR o un issue) o con `python3 <pieza>/herramientas/pieza.py actualizar .`. Si hay que cambiar algo, el cambio va
  primero a Pieza (`pieza.py diferencias . <pieza>` lo muestra) y vuelve desde allá; `pieza.py estado .` dice si algo quedó distinto.
- Lo que **generan** las piezas desde `app.json` (el empaquetado, los workflows, las plantillas de GitHub) se vuelve a generar con
  `pieza.py generar .` después de cambiar `app.json`; si lo cambias a mano, desde ahí es de la app y Pieza ya no lo toca.
- `app.json` y `acciones.json` van dentro de las apps (los empaqueta `herramientas/empaquetar.sh` y `extraResources`). Después de
  cambiar una acción de `app.json`: `python3 <pieza>/herramientas/pieza.py acciones .`.
- `.gitignore` es una lista blanca: un archivo o carpeta nueva de la raíz se agrega ahí.
- Al agregar o actualizar una pieza, pon al día esta tabla (`pieza.py estado .` dice las versiones).

## Reglas al cambiar cosas
- Código, comentarios, commits y textos en **español** (de Chile neutro). Todo texto nuevo visible va con su traducción en
  `ui/idiomas/en.json` en el mismo cambio, como frase completa con marcadores (`T("Llevas {n}…", {n})`), nunca pedazos pegados.
- Contenido de la persona con `esc()` y `data-sin-traducir`. Lo que escribe la persona **nunca** va como argumento de un proceso.
- Archivos de piezas: no se editan aquí (ver «Piezas»). Colores con los tokens de «tema» y botones y diálogos de «componentes».
- Antes de cerrar un cambio: `bash pruebas/correr.sh` y mirar la interfaz (`cd ui && python3 -m http.server 8765`, `?idioma=en`,
  `?bienvenida`), también a 390 px y en claro y oscuro.
- Seguridad (detalle en `SECURITY.md`): CSP sin scripts ni manejadores en línea; todo dato externo validado y escapado; la IA sin
  herramientas ni MCP. Workflows: actions fijadas por SHA con su versión en un comentario, `permissions` mínimos,
  `persist-credentials: false`, nunca `pull_request_target` ni `${{ github.event.* }}` dentro de `run:`.
- Privacidad: `bash herramientas/revisar_privacidad.sh` antes de cada commit (usa `.terminos-privados`, local y nunca versionado).
  Jamás subas datos reales, ni siquiera "para probar".
- Commits con autor `@users.noreply.github.com`. El repo es público: cada commit se ve al tiro.
- Swift solo compila en un Mac (o en el job `mac` de GitHub): imita código que ya compila y anota qué revisar en el Mac.
- El protocolo del respaldo (llave, firmas, cabeceras, `respaldados.json`, `respaldo/indice.json`) no se cambia sin
  compatibilidad: un iPhone y un Mac con versiones distintas tienen que seguir entendiéndose, o el cambio sube la sal
  (`despeja-respaldo-2`) y lo dice en el `CHANGELOG.md`.
- Nunca se borra nada del iPhone que no esté en `respaldados.json`, y nunca se escribe ahí algo que el Mac no confirmó.
- Lo que va a la IA (`catastro()` en `bin/plan.py`) no suma fotos, nombres de archivos ni contenido sin conversarlo antes.

## Lo que rodea a un cambio
Un cambio está listo cuando la app **y lo que la cuenta** dicen lo mismo. Antes de empezar, anota qué tipo de cambio es; al terminar,
revisa cada fila ("no aplica" se decide, no se supone):

| Si el cambio… | Deja al día |
|---|---|
| agrega o cambia una función | la página (`docs/`: funciones, «cómo funciona», comparación, preguntas frecuentes), el README y la guía si la hay |
| cambia lo que se ve | capturas de la página y del README (datos ficticios, español e inglés, normal y celular) e imagen para compartir si sale esa vista |
| cambia un flujo o un paso | instrucciones paso a paso, preguntas frecuentes, textos de la bienvenida e instalación si la toca |
| quita algo | bórralo de la página, el README y las guías: nada que prometa lo que ya no hace |
| cambia el formato de datos o el puente | la documentación del formato, `ejemplos/` si existe y esta guía |
| cambia carpetas, reglas o pruebas | esta guía (`AGENTS.md`) y `CONTRIBUTING.md` |
| actualiza o agrega una pieza | `piezas.json` (lo escribe `pieza.py`), la tabla «Piezas» de esta guía y `app.json` si pide config |
| resuelve un issue | ciérralo con «Resuelto en …» dando crédito y abre issues para lo que quedó pendiente |
| lo nota quien usa Despeja | `CHANGELOG.md`: una línea en «Sin publicar», en lenguaje de persona («Ahora puedes…»), en español e inglés |

Todo texto nuevo de la página y del README va en los dos idiomas, sin nada inventado. Antes de cerrar, busca con `grep` en `docs/` y el
README el nombre o el texto viejo de lo que cambió. Al publicar una versión (se sube `version` en `app.json`), las líneas de «Sin
publicar» pasan a su número. Los issues que abrimos para una tarea traen una sección «Qué actualizar alrededor» con las filas de
esta tabla que le tocan.

## Revisar aportes
Todo entra por pull request y lo junta quien mantiene el proyecto, solo con su aprobación. Leer todo el diff antes de correr nada
(alerta roja: workflows, scripts de instalación o empaquetado, la CSP, `innerHTML` sin `esc()`, red nueva, dependencias nuevas,
binarios, cómo se arma el comando o el pedido de la IA). Agentes: `.claude/agents/despeja-revisor.md` y `despeja-privacidad.md`.
Detalle en `CONTRIBUTING.md`.
