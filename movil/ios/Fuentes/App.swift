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
            p.registrar("borrarRespaldadas") { _ in
                Task { p.llamar("borradas", await r.borrar()) }
            }
        }
    }

    var body: some Scene {
        WindowGroup { Host.Vista().ignoresSafeArea() }
    }
}
