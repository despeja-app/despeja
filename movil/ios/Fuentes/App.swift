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
        }
    }

    var body: some Scene {
        WindowGroup { Host.Vista().ignoresSafeArea() }
    }
}
