// swift-tools-version:5.10
// Generado por la pieza «empaquetado» de Pieza (MPL-2.0, https://mozilla.org/MPL/2.0/) desde app.json y las piezas instaladas
// (pieza.py generar . lo vuelve a armar al agregar una pieza). Si lo cambias, desde ahí es de la app y Pieza ya no lo toca.
import PackageDescription

// Despeja para Mac: la app nativa genérica de Pieza (host-mac) con la interfaz de ui/ y los scripts de bin/ (Python portátil
// adentro). Lo propio de la app va en Sources/Despeja.
let package = Package(
    name: "Despeja",
    platforms: [.macOS("15.0")],
    targets: [
        .executableTarget(
            name: "Despeja",
            dependencies: ["PiezaHost", "PiezaActualizaciones", "PiezaTrabajos", ],
            path: "Sources/Despeja"
        ),
        // Pieza «host-mac» (de Pieza: no se edita a mano): ventana, puente con guardas, config e idioma desde app.json, menús,
        // apariencia, scripts con límite de tiempo y las acciones declaradas en acciones.json.
        .target(name: "PiezaHost", path: "Sources/PiezaHost"),
        // Pieza «actualizaciones»: versiones nuevas solo desde los Releases de despeja-app/despeja, con su .sha256.
        .target(name: "PiezaActualizaciones", path: "Sources/PiezaActualizaciones"),
        // Pieza «trabajos»: LectorProgreso, el avance en vivo de los trabajos largos.
        .target(name: "PiezaTrabajos", path: "Sources/PiezaTrabajos"),
    ]
)
