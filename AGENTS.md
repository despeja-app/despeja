# Despeja — guía para trabajar en el proyecto

> Para personas y para cualquier IA de programación (Claude Code, Codex, Gemini/Antigravity…). `CLAUDE.md` y `GEMINI.md` solo
> importan este archivo: la guía es una sola.

<!-- La app: en un párrafo, qué es Despeja, para quién y qué hace con la IA de la persona (si la usa). Sin promesas que la app
no cumpla todavía. Borra este comentario al escribirlo. -->

**Principios que no se negocian**

<!-- La app: de 4 a 7 principios propios, numerados y en negrita al comienzo, cada uno con su porqué. Los que comparte toda la
familia (ajústalos a la app): los datos son de la persona y viven en su computador; la IA es la de la persona, con su cuenta, sin
herramientas ni memoria, y ve lo mínimo; todo lo que viene de afuera se valida y se escapa; gratis y abierto (AGPL-3.0), sin
cuentas ni publicidad; nada personal en el código (Ana Pérez, Matías Soto). Borra este comentario al escribirlos. -->

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
<!-- La app: suma una fila por cada carpeta o archivo propio importante (qué es y qué hay adentro), sin repetir lo de arriba. -->

<!-- La app: aquí van las secciones propias de la app («Cómo funciona», el formato de sus archivos, el puente con sus acciones,
lo que hace cada app nativa…). Escribe lo que una persona o una IA necesita para cambiar algo sin romperlo; nada más. -->

## Piezas (de [Pieza](https://github.com/pieza-app/pieza))
Despeja usa piezas de Pieza, la base de la familia de apps: código probado que se copia a la app (modelo «copiar y adueñarse»).

| Pieza | Versión | Archivos | Qué usa Despeja |
|---|---|---|---|
| `actualizaciones` | 0.3.0 | `app/Sources/PiezaActualizaciones/Actualizaciones.swift` | <!-- La app: qué usa de «Actualizaciones» --> |
| `bienvenida` | 0.4.1 | `ui/bienvenida.css`, `ui/bienvenida.js` | <!-- La app: qué usa de «Bienvenida» --> |
| `cifrado` | 0.2.0 | `ui/cifrado.js` | <!-- La app: qué usa de «Cifrado» --> |
| `componentes` | 0.3.0 | `ui/componentes.css`, `ui/componentes.js` | <!-- La app: qué usa de «Componentes» --> |
| `contrato` | 0.1.1 | `pruebas/contrato.py` | <!-- La app: qué usa de «Contrato del puente» --> |
| `empaquetado` | 0.1.0 | `herramientas/python.lock` | <!-- La app: qué usa de «Empaquetado» --> |
| `esqueleto` | 0.1.0 |  | <!-- La app: qué usa de «Esqueleto de una app nueva» --> |
| `github` | 0.1.0 |  | <!-- La app: qué usa de «Repo listo para la comunidad» --> |
| `host-ios` | 0.1.0 | `movil/ios/Fuentes/PiezaHost/Host.swift`, `movil/ios/Fuentes/PiezaHost/Puente.swift` | <!-- La app: qué usa de «App de iPhone» --> |
| `host-mac` | 0.3.0 | `app/Sources/PiezaHost/Carpeta.swift`, `app/Sources/PiezaHost/Enchufe.swift`, `app/Sources/PiezaHost/Host.swift`, `app/Sources/PiezaHost/Procesador.swift`, `app/Sources/PiezaHost/Puente.swift`, `app/Sources/PiezaHost/Sistema.swift` | <!-- La app: qué usa de «App de Mac» --> |
| `host-ui` | 0.2.0 | `ui/host.js` | <!-- La app: qué usa de «Puente de la interfaz» --> |
| `i18n` | 0.3.1 | `ui/i18n.js` | <!-- La app: qué usa de «Idiomas» --> |
| `ia` | 0.6.3 | `bin/ia.py` | <!-- La app: qué usa de «Tu IA» --> |
| `nucleo` | 0.7.1 | `bin/nucleo.py` | <!-- La app: qué usa de «Núcleo» --> |
| `pagina` | 0.1.0 | `docs/pagina-comunes.json`, `docs/pagina.css`, `docs/pagina.js`, `docs/sello-en.svg`, `docs/sello.svg`, `docs/tema.css`, `herramientas/pagina_capturas.mjs` | <!-- La app: qué usa de «Página pública» --> |
| `red` | 0.2.0 | `bin/red.py` | <!-- La app: qué usa de «Red segura» --> |
| `tema` | 0.2.1 | `ui/tema.css`, `ui/tema.js` | <!-- La app: qué usa de «Tema claro y oscuro» --> |
| `trabajos` | 0.2.1 | `app/Sources/PiezaTrabajos/LectorProgreso.swift`, `bin/trabajos.py` | <!-- La app: qué usa de «Trabajos largos» --> |

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
<!-- La app: suma las reglas propias (el formato de sus archivos, lo que nunca se cambia sin compatibilidad…). -->

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
