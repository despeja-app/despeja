// Despeja en el iPhone: eventos de calendario de hace más de dos años, solo de calendarios que se pueden cambiar (nunca
// suscritos, cumpleaños ni festivos). Borrarlos ordena el calendario; casi no libera espacio y la app lo dice.
import EventKit
import Foundation

@MainActor
final class Calendario {
    static let shared = Calendario()
    private let tienda = EKEventStore()
    private var viejos: [String] = []

    private func calendarios() -> [EKCalendar] {
        tienda.calendars(for: .event).filter { $0.allowsContentModifications && $0.type != .subscription && $0.type != .birthday }
    }

    func analizar() async -> [String: Any] {
        guard (try? await tienda.requestFullAccessToEvents()) == true else {
            return ["ok": false, "codigo": "sin_permiso", "error": Idioma.t("Para revisar tu calendario necesito permiso.")]
        }
        let hasta = Calendar.current.date(byAdding: .year, value: -2, to: Date())!
        var ids: [String] = []
        // EventKit busca en tramos de hasta 4 años
        var desde = Calendar.current.date(byAdding: .year, value: -20, to: Date())!
        while desde < hasta {
            let fin = min(Calendar.current.date(byAdding: .year, value: 4, to: desde)!, hasta)
            let p = tienda.predicateForEvents(withStart: desde, end: fin, calendars: calendarios())
            ids += tienda.events(matching: p).filter { !$0.hasRecurrenceRules }.compactMap(\.eventIdentifier)
            desde = fin
        }
        viejos = Array(Set(ids))
        return ["ok": true, "viejos": viejos.count]
    }

    func borrarViejos() async -> [String: Any] {
        var n = 0
        for id in viejos {
            if let e = tienda.event(withIdentifier: id), (try? tienda.remove(e, span: .thisEvent, commit: false)) != nil { n += 1 }
        }
        do { try tienda.commit() } catch { tienda.reset(); return ["ok": false, "codigo": "fallo", "error": Idioma.t("No pude borrar los eventos.")] }
        viejos = []
        return ["ok": true, "borrados": n]
    }
}
