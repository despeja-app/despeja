// La app de iPhone de Despeja (pieza «host-ios»): las manos. La interfaz es la misma de ui/ (plataforma «movil»); aquí va lo
// nativo: las fotos con PhotoKit. Nada sale del iPhone sin que la persona lo pida.
import SwiftUI

@main
struct DespejaApp: App {
    init() {
        Host.arrancar(.init(sitio: "https://despeja-app.github.io/despeja/", codigo: "https://github.com/despeja-app/despeja")) { p in
            // El permiso de Fotos se pide recién cuando la persona toca «Revisar mis fotos» (nunca al abrir).
            p.registrar("fotosResumen") { _ in
                Fotos.resumen { r in p.llamar("fotosResumen", r) }
            }
            // Respaldo en el Mac (Respaldo.swift): buscar, conectar con el código, respaldar, detener y borrar lo verificado.
            let r = Respaldo.shared
            p.registrar("respaldoEstado") { _ in p.llamar("respaldoEstado", r.resumen()) }
            p.registrar("macBuscar") { _ in r.buscar { p.llamar("macsEncontrados", $0) } }
            p.registrar("macConectar") { d in
                let mac = d["mac"] as? String ?? "", codigo = d["codigo"] as? String ?? ""
                guard mac.count <= 120, codigo.count <= 20 else { return }
                Task { p.llamar("macConectado", await r.conectar(mac: mac, codigo: codigo)) }
            }
            p.registrar("respaldar") { _ in
                p.ocupar()   // la pantalla no se apaga mientras manda
                Task {
                    let fin = await r.respaldar { p.llamar("respaldoAvance", $0) }
                    p.soltar()
                    p.llamar("respaldoListo", fin)
                }
            }
            p.registrar("respaldoParar") { _ in r.pararRespaldo() }
            // Analizar y limpiar (Limpieza.swift): grupos con lo que se propone borrar, ver, marcar y borrar.
            let l = Limpieza.shared
            p.registrar("analizar") { _ in
                p.ocupar()
                Task {
                    let r = await l.analizar { p.llamar("analisisAvance", $0) }
                    p.soltar()
                    p.llamar("analisisListo", r)
                }
            }
            p.registrar("grupoVer") { d in
                guard let g = d["grupo"] as? String, g.count <= 20 else { return }
                let desde = (d["desde"] as? NSNumber)?.intValue ?? 0
                Task { p.llamar("grupoPagina", await l.pagina(g, desde: desde)) }
            }
            p.registrar("fotoGrande") { d in
                guard let id = d["id"] as? String, id.count <= 300 else { return }
                Task { p.llamar("fotoGrande", await l.grande(id)) }
            }
            p.registrar("grupoMarcar") { d in
                guard let g = d["grupo"] as? String, g.count <= 20 else { return }
                let id = (d["id"] as? String).flatMap { $0.count <= 300 ? $0 : nil }
                l.marcar(g, id: id, marcada: d["marcada"] as? Bool, todas: d["todas"] as? Bool)
                p.llamar("grupos", ["ok": true, "grupos": l.resumen()])
            }
            p.registrar("grupoBorrar") { d in
                guard let g = d["grupo"] as? String, g.count <= 20 else { return }
                Task {
                    let r = await l.borrar(g)
                    p.llamar("grupoBorrado", r)
                    p.llamar("respaldoEstado", Respaldo.shared.resumen())
                }
            }
            p.registrar("borrarRespaldadas") { _ in
                Task { p.llamar("borradas", await r.borrar()) }
            }
        }
    }

    var body: some Scene {
        WindowGroup { Host.Vista().ignoresSafeArea() }
    }
}
