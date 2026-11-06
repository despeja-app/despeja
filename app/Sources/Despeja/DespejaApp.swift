// Despeja para Mac: la app nativa genérica de Pieza (pieza «host-mac», target PiezaHost) con la interfaz de ui/ y los scripts
// de bin/ (Python portátil adentro). Empezó con «pieza.py crear»: desde ahí es de la app.
// Lo que solo corre un script NO va aquí: se declara en app.json → acciones (pieza.py acciones . arma acciones.json) y el host lo
// atiende solo, igual en Windows y Linux. Aquí va lo nativo propio (p.registrar), los menús y lo que se suma al estado.
import AppKit
import PiezaHost
import PiezaActualizaciones
import PiezaTrabajos

@main
enum DespejaApp {
    @MainActor static func main() {
        Host.arrancar(.init(sitio: "https://despeja-app.github.io/despeja/", codigo: "https://github.com/despeja-app/despeja", global: "Despeja")) { p in
            // Pieza «actualizaciones»: solo los Releases de despeja-app/despeja (Despeja-macOS.zip + .sha256). El host atiende
            // buscarActualizacion y actualizar (nunca con algo en curso), revisa al abrir y cada 6 h con el idioma elegido.
            Actualizaciones.configurar(.init(repo: "despeja-app/despeja", nombre: "Despeja",
                archivoDesarrollo: Host.datos.appendingPathComponent("desarrollo"), variableProgreso: Host.prefijo + "PROGRESO"))
            p.actualizaciones = .init(revisar: Actualizaciones.revisar, revisarCadaRato: Actualizaciones.revisarCadaRato,
                seguir: Actualizaciones.seguir, instalar: Actualizaciones.instalar, aviso: Actualizaciones.aviso,
                disponible: { Actualizaciones.disponible })
            // Dónde quedan los respaldos (con marcador: la sigue aunque la muevan); los scripts la reciben por «carpetaActual».
            let destino = CarpetaElegida()
            destino.textoFalta = "Elige dónde guardar los respaldos."
            p.carpeta = destino
            p.registrar("elegirDestino") { _ in
                destino.elegir(mensaje: Idioma.t("Elige dónde guardar las fotos y videos del iPhone"), boton: Idioma.t("Guardar aquí")) { _ in p.enviarEstado() }
            }
            p.estado = { base, listo in
                var e = base
                if let u = destino.actual() { e["destino"] = ["nombre": u.lastPathComponent, "ruta": u.path] }
                listo(e)
            }
            // Pieza «trabajos»: el respaldo corre mientras late y avisa su avance a la interfaz.
            Procesador.lectorProgreso = { aviso in let l = LectorProgreso(prefijo: Host.id, aviso: aviso); return (l.url.path, l.empezar, l.terminar) }
        }
    }
}
